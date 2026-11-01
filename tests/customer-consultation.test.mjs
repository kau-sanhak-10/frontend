import assert from "node:assert/strict";
import { test, afterEach, mock } from "node:test";
import {
  validatePhoto,
  fieldText,
  consultationError,
} from "../src/lib/customer-consultation.ts";
import {
  createCustomerInquiry,
  sendCustomerMessage,
} from "../src/lib/customer-api.ts";

const previousBase = process.env.NEXT_PUBLIC_API_BASE_URL;
afterEach(() => {
  mock.restoreAll();
  if (previousBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = previousBase;
});
test("사진은 10장·10,000,000바이트까지이며 JPG·PNG만 허용한다", () => {
  assert.equal(
    validatePhoto({ type: "image/jpeg", size: 10_000_000 }, 9),
    undefined,
  );
  for (const [file, count] of [
    [{ type: "image/jpeg", size: 10_000_001 }, 0],
    [{ type: "image/png", size: 1 }, 10],
    [{ type: "image/heic", size: 20 }, 0],
    [{ type: "image/png", size: 0 }, 0],
  ])
    assert.ok(validatePhoto(file, count));
});
test("미확인·충돌 값은 추측해 표시하지 않고 매뉴얼 출처도 구분한다", () => {
  const field = {
    key: "model",
    label: "모델명",
    value: "guess",
    source: "PHOTO",
    status: "UNCONFIRMED",
  };
  assert.equal(fieldText(field), "미확인");
  assert.equal(fieldText({ ...field, status: "CONFLICT" }), "정보 확인 필요");
  assert.equal(fieldText({ ...field, status: "CONFIRMED" }), "guess");
  assert.equal(
    fieldText({ ...field, status: "CONFIRMED", value: null }),
    "미확인",
  );
});
test("만료·발송 제한·통신 실패의 안내는 입력 보존과 복구를 설명한다", () => {
  assert.match(consultationError({ code: "TOKEN_EXPIRED" }), /본인 확인/);
  assert.match(consultationError({ code: "TOO_MANY_REQUESTS" }), /기다려/);
  assert.match(consultationError(new Error("secret")), /다시 시도/);
  assert.doesNotMatch(consultationError(new Error("secret")), /secret/);
});
function respond(result) {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";
  return mock.method(globalThis, "fetch", async () =>
    Response.json({ success: true, code: "OK", message: "성공", result }),
  );
}
test("상담 생성은 필수 동의와 버전을 전달하고 문의 토큰을 반환한다", async () => {
  const fetch = respond({
    inquiryId: 10,
    inquiryToken: "inq_test",
    expiresAt: "2030-01-01T00:00:00Z",
  });
  const result = await createCustomerInquiry("link/value", [
    { type: "PRIVACY_REQUIRED", termsVersion: "v1" },
  ]);
  assert.equal(result.inquiryId, 10);
  assert.match(String(fetch.mock.calls[0].arguments[0]), /link%2Fvalue/);
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), {
    consents: [{ type: "PRIVACY_REQUIRED", termsVersion: "v1" }],
  });
});
test("메시지는 같은 clientMsgId·사진 ID와 토큰 헤더로 전송한다", async () => {
  const fetch = respond({
    messageId: 11,
    deliveryStatus: "SENT",
    aiStatus: "PROCESSING",
  });
  const input = {
    clientMsgId: "stable-id",
    content: "온수가 안 나와요",
    photoIds: [3],
  };
  await sendCustomerMessage(10, "inq_test", input);
  const options = fetch.mock.calls[0].arguments[1];
  assert.equal(
    new Headers(options.headers).get("Authorization"),
    "Bearer inq_test",
  );
  assert.deepEqual(JSON.parse(options.body), input);
  assert.ok(!String(fetch.mock.calls[0].arguments[0]).includes("inq_test"));
});
test("입력·권한 정보가 잘못되면 요청하지 않고 잘못된 성공 응답을 거절한다", async () => {
  const fetch = respond({});
  await assert.rejects(createCustomerInquiry("x", []));
  await assert.rejects(
    sendCustomerMessage(-1, "token", {
      clientMsgId: "a",
      content: "test",
      photoIds: [],
    }),
  );
  assert.equal(fetch.mock.callCount(), 0);
  await assert.rejects(
    createCustomerInquiry("x", [
      { type: "PRIVACY_REQUIRED", termsVersion: "v1" },
    ]),
  );
  await assert.rejects(
    sendCustomerMessage(1, "token", {
      clientMsgId: "a",
      content: "test",
      photoIds: [],
    }),
  );
  assert.equal(fetch.mock.callCount(), 2);
});
