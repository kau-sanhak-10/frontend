import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { ApiError } from "../src/lib/api.ts";
import { getCustomerVisitInfo } from "../src/lib/customer-api.ts";
import {
  getAvailableVisits,
  confirmCustomerVisit,
} from "../src/lib/customer-booking-api.ts";
import { bookingIssue } from "../src/lib/customer-booking.ts";

const inquiry = {
  inquiryId: 10,
  version: 3,
  status: "SCHEDULING",
  handlerMode: "AI",
  nextAction: "CHECK_SCHEDULE",
  reservation: null,
  visitInfo: {
    name: "테스트",
    phone: "01000000000",
    address: "테스트 주소",
    addressDetail: null,
    accessNote: null,
    lat: 37.5,
    lng: 127,
    workCategory: null,
  },
};
const slot = {
  startAt: "2026-12-01T10:00:00+09:00",
  endAt: "2026-12-01T11:00:00+09:00",
};
const key = "a1234567-1234-4123-8123-123456789abc";
const available = {
  workMinutes: 60,
  days: [{ date: "2026-12-01", slots: [slot], emptyReason: null }],
};
const confirmed = {
  ...slot,
  reservationId: 71,
  status: "CONFIRMED",
  version: 0,
  notifications: [],
};

function respond(result) {
  return Response.json({ success: true, code: "OK", message: "", result });
}
function api(readInquiry) {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
  return mock.method(globalThis, "fetch", async (url) => {
    if (url.pathname.endsWith("/inquiries/10")) return respond(readInquiry());
    if (url.pathname.endsWith("/available-slots")) return respond(available);
    if (url.pathname.endsWith("/reservations")) return respond(confirmed);
    assert.fail(`예상하지 않은 요청: ${url.pathname}`);
  });
}
afterEach(() => mock.restoreAll());

for (const [status, handlerMode, nextAction, expected] of [
  ["SCHEDULING", "AI", "CHECK_SCHEDULE", "candidate"],
  ["COLLECTING", "AI", "CHECK_SCHEDULE", "collecting"],
  ["COLLECTING", "AI", "ASK_MORE_INFO", "collecting"],
  ["SCHEDULING", "AI", "ASK_MORE_INFO", "collecting"],
  ["SCHEDULING", "AI", null, "collecting"],
  ["SCHEDULING", "AI", undefined, "collecting"],
  ["SCHEDULING", "AI", { action: "CHECK_SCHEDULE" }, "collecting"],
  ["OWNER_CHECK", "AI", "CHECK_SCHEDULE", "owner-review"],
  ["SCHEDULING", "OWNER", "CHECK_SCHEDULE", "owner-review"],
  ["COLLECTING", "OWNER", null, "owner-review"],
  ["CLOSED", "AI", "CHECK_SCHEDULE", null],
  ["UNSERVICEABLE", "AI", "CHECK_SCHEDULE", null],
  ["BOOKED", "AI", "CHECK_SCHEDULE", null],
  ["UNKNOWN", "AI", "CHECK_SCHEDULE", null],
  ["SCHEDULING", "UNKNOWN", "CHECK_SCHEDULE", null],
]) {
  test(`예약 단계는 최신 Spring 상태로 판단한다: ${status}/${handlerMode}/${JSON.stringify(nextAction)}`, async () => {
    api(() => ({ ...inquiry, status, handlerMode, nextAction }));
    const result = await getCustomerVisitInfo(10, "inq_test");
    assert.equal(result.bookingStage, expected);
  });
}

for (const [label, change, kind] of [
  [
    "추가 질문",
    { status: "COLLECTING", nextAction: "ASK_MORE_INFO" },
    "collecting",
  ],
  [
    "안전 인계",
    { status: "OWNER_CHECK", nextAction: "ESCALATE_TO_OWNER" },
    "owner",
  ],
  ["사장님 응대", { handlerMode: "OWNER" }, "owner"],
  ["오래된 판단", { nextAction: null }, "collecting"],
  ["종료", { status: "CLOSED", nextAction: null }, "collecting"],
  [
    "미확인 위치",
    { visitInfo: { ...inquiry.visitInfo, lat: null } },
    "collecting",
  ],
]) {
  for (const operation of ["load", "confirm"]) {
    test(`${label} 변경 뒤 ${operation} 호출을 차단하고 상담 안내를 제공한다`, async () => {
      let latest = inquiry;
      const calls = api(() => latest);
      assert.equal(
        (await getCustomerVisitInfo(10, "inq_test")).bookingStage,
        "candidate",
      );
      latest = { ...inquiry, ...change };
      await assert.rejects(
        operation === "load"
          ? getAvailableVisits(10, "inq_test", "2026-12-01")
          : confirmCustomerVisit(10, "inq_test", slot, key),
        (error) => bookingIssue(error).kind === kind,
      );
      assert.equal(calls.mock.callCount(), 2);
      assert.ok(
        calls.mock.calls.every((call) =>
          call.arguments[0].pathname.endsWith("/inquiries/10"),
        ),
      );
    });
  }
}

test("참고정보·작업 유형 선택이 없어도 서버가 예약 가능으로 판단하면 후보를 그대로 조회한다", async () => {
  const calls = api(() => inquiry);
  assert.deepEqual(
    await getAvailableVisits(10, "inq_test", "2026-12-01"),
    available,
  );
  assert.equal(calls.mock.callCount(), 2);
});

test("이미 예약된 문의는 후보를 다시 생성하지 않고 기존 예약으로 안내한다", async () => {
  const calls = api(() => ({ ...inquiry, reservation: { reservationId: 71 } }));
  await assert.rejects(
    getAvailableVisits(10, "inq_test", "2026-12-01"),
    (error) => {
      assert.equal(bookingIssue(error).kind, "existing");
      assert.equal(error.result.reservationId, 71);
      return true;
    },
  );
  assert.equal(calls.mock.callCount(), 1);
});

test("확정 응답 유실 뒤 BOOKED로 바뀌어도 같은 키·본문으로 서버 결과를 재확인한다", async () => {
  let booked = false;
  const requests = [];
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
  mock.method(globalThis, "fetch", async (url, options) => {
    if (url.pathname.endsWith("/inquiries/10"))
      return respond(
        booked
          ? {
              ...inquiry,
              status: "BOOKED",
              nextAction: null,
              reservation: { reservationId: 71 },
            }
          : inquiry,
      );
    assert.equal(url.pathname, "/api/v1/customer/inquiries/10/reservations");
    requests.push({
      key: new Headers(options.headers).get("Idempotency-Key"),
      body: options.body,
    });
    if (!booked) {
      booked = true;
      throw new TypeError("응답 유실");
    }
    return respond(confirmed);
  });
  await assert.rejects(confirmCustomerVisit(10, "inq_test", slot, key));
  assert.deepEqual(
    await confirmCustomerVisit(10, "inq_test", slot, key, undefined, true),
    confirmed,
  );
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[0].key, key);
  assert.deepEqual(JSON.parse(requests[0].body), { startAt: slot.startAt });
});

test("기존 예약이 확인된 첫 확정 시도는 POST 없이 기존 예약으로 안내한다", async () => {
  const calls = api(() => ({
    ...inquiry,
    status: "OWNER_CHECK",
    handlerMode: "OWNER",
    reservation: { reservationId: 71 },
  }));
  await assert.rejects(
    confirmCustomerVisit(10, "inq_test", slot, key),
    (error) => bookingIssue(error).kind === "existing",
  );
  assert.equal(calls.mock.callCount(), 1);
});

test("문의 재조회 실패는 확정으로 표시하지 않고 예약 API도 호출하지 않는다", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
  const calls = mock.method(globalThis, "fetch", async () => {
    throw new ApiError(503, "INTERNAL_SERVER_ERROR", "");
  });
  await assert.rejects(
    confirmCustomerVisit(10, "inq_test", slot, key),
    (error) => bookingIssue(error).kind === "retry",
  );
  assert.equal(calls.mock.callCount(), 1);
});
