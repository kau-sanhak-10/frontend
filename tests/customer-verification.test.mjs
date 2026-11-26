import assert from "node:assert/strict";
import { test, afterEach, mock } from "node:test";
import { ApiError } from "../src/lib/api.ts";
import {
  confirmCustomerVerification,
  sendCustomerVerification,
  verificationIssue,
} from "../src/lib/customer-verification.ts";
import { getCustomerReservation } from "../src/lib/customer-booking-api.ts";
import { readBookingResult } from "../src/lib/customer-booking.ts";

const signal = new AbortController().signal;
const expiration = new Date(Date.now() + 600_000).toISOString();
const inquiry = {
  purpose: "CUSTOMER_VERIFY",
  inquiryId: 10,
  inquiryToken: "inq_test",
};
const lookup = { purpose: "RESERVATION_LOOKUP", linkToken: "x".repeat(43) };
afterEach(() => mock.restoreAll());

function respond(result) {
  mock.restoreAll();
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
  return mock.method(globalThis, "fetch", async () =>
    Response.json({ success: true, code: "OK", message: "", result }),
  );
}
test("고객 인증 대상별 요청 범위와 OTP 응답을 검증한다", async () => {
  const call = respond({
    verificationId: 11,
    expiresAt: expiration,
    resendAvailableAt: expiration,
  });
  await sendCustomerVerification(inquiry, "010-0000-0000", signal);
  await sendCustomerVerification(lookup, "01000000000", signal);
  for (const [index, target] of [inquiry, lookup].entries()) {
    const [url, req] = call.mock.calls[index].arguments;
    assert.equal(url.pathname, "/api/v1/auth/verifications");
    assert.equal(
      req.headers.get("Authorization"),
      index ? null : "Bearer inq_test",
    );
    assert.deepEqual(JSON.parse(req.body), {
      phone: "01000000000",
      purpose: target.purpose,
      ...(index ? { linkToken: lookup.linkToken } : {}),
    });
  }
  await assert.rejects(
    sendCustomerVerification(inquiry, "010bad00000", signal),
  );
  assert.equal(call.mock.callCount(), 2);
  respond({
    purpose: "CUSTOMER_VERIFY",
    inquiryId: 11,
    verifiedAt: expiration,
  });
  await assert.rejects(
    confirmCustomerVerification(inquiry, 11, "000000", signal),
  );
  respond({
    purpose: "INQUIRY_ACCESS",
    accessToken: "cus_mock",
    expiresAt: expiration,
  });
  await assert.rejects(
    confirmCustomerVerification(lookup, 11, "000000", signal),
  );
  respond({
    purpose: "RESERVATION_LOOKUP",
    accessToken: "cus_mock",
    expiresAt: expiration,
  });
  assert.equal(
    (await confirmCustomerVerification(lookup, 11, "000000", signal))
      .accessToken,
    "cus_mock",
  );
});

test("알림 미발송·번호 불일치·시도 제한과 예약 저장 상태를 각각 처리한다", async () => {
  const code = (value, result) => new ApiError(400, value, "", result);
  assert.match(
    verificationIssue(code("VERIFICATION_CODE_MISMATCH", { attemptsLeft: 4 }))
      .message,
    /4회/,
  );
  assert.equal(verificationIssue(code("VERIFICATION_EXPIRED")).clear, true);
  assert.equal(
    verificationIssue(code("VERIFICATION_ATTEMPTS_EXCEEDED")).clear,
    true,
  );
  assert.equal(
    verificationIssue(
      code("VERIFICATION_SEND_LIMITED", { retryAfterSeconds: 15 }),
    ).wait,
    15000,
  );
  assert.match(
    verificationIssue(code("VERIFICATION_SEND_FAILED")).message,
    /문자를 보내지/,
  );
  const canceled = {
    reservationId: 10,
    status: "CANCELED",
    startAt: "2026-11-23T10:00:00+09:00",
    endAt: "2026-11-23T11:00:00+09:00",
    version: 2,
    address: "가상 주소",
  };
  assert.equal(
    readBookingResult({ ...canceled, notifications: [] }, true).status,
    "CANCELED",
  );
  const call = respond(canceled);
  assert.equal(
    (await getCustomerReservation(10, "cus_mock", signal)).status,
    "CANCELED",
  );
  await assert.rejects(getCustomerReservation(11, "cus_mock", signal));
  await assert.rejects(getCustomerReservation(10, "own_mock", signal));
  assert.equal(call.mock.callCount(), 2);
});
