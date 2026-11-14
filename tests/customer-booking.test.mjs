import assert from "node:assert/strict";
import { test, afterEach, mock } from "node:test";
import { ApiError } from "../src/lib/api.ts";
import {
  readAvailableVisits,
  readConfirmedVisit,
  bookingIssue,
  kstDate,
  formatVisit,
} from "../src/lib/customer-booking.ts";
import {
  getAvailableVisits,
  confirmCustomerVisit,
} from "../src/lib/customer-booking-api.ts";
import {
  getCustomerVisitInfo,
  saveCustomerVisitInfo,
  visitSaveError,
} from "../src/lib/customer-api.ts";
import { VisitInputError } from "../src/lib/customer-intake.ts";

const slot = {
  startAt: "2026-11-20T10:00:00+09:00",
  endAt: "2026-11-20T11:00:00+09:00",
};
const available = {
  workMinutes: 60,
  days: [{ date: "2026-11-20", slots: [slot], emptyReason: null }],
};
const confirmed = {
  ...slot,
  reservationId: 10,
  status: "CONFIRMED",
  version: 0,
  notifications: [
    { recipient: "CUSTOMER", channel: "SMS", sendStatus: "FAILED" },
  ],
};
const key = "a1234567-1234-4123-8123-123456789abc";
afterEach(() => mock.restoreAll());
function reply(value, status = 200, code = "OK") {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
  return mock.method(globalThis, "fetch", async () =>
    Response.json(
      { success: status < 400, code, message: "", result: value },
      { status },
    ),
  );
}
test("시간 후보는 날짜·시간대·순서·중복·기간을 검증하며 임의 후보를 추가하지 않는다", () => {
  assert.deepEqual(readAvailableVisits(available), available);
  for (const data of [
    null,
    { ...available, workMinutes: 0 },
    { ...available, days: [...available.days, ...available.days] },
    { ...available, days: [{ ...available.days[0], date: "2026-02-30" }] },
    { ...available, days: [{ ...available.days[0], slots: [slot, slot] }] },
    {
      ...available,
      days: [
        { ...available.days[0], slots: [{ ...slot, endAt: slot.startAt }] },
      ],
    },
    {
      ...available,
      days: [
        {
          ...available.days[0],
          slots: [{ ...slot, startAt: "2026-11-20T10:00:00" }],
        },
      ],
    },
    { ...available, days: [{ ...available.days[0], date: "2026-11-21" }] },
  ])
    assert.throws(() => readAvailableVisits(data));
  assert.equal(kstDate(new Date("2026-11-19T15:01:00Z")), "2026-11-20");
  assert.match(formatVisit(slot.startAt), /10:00/);
});
test("확정된 서버 응답만 확정으로 읽고 알림 실패를 예약 실패로 바꾸지 않는다", () => {
  assert.deepEqual(readConfirmedVisit(confirmed), confirmed);
  for (const data of [
    { ...confirmed, status: "REQUESTED" },
    { ...confirmed, reservationId: 0 },
    { ...confirmed, notifications: null },
    { ...confirmed, version: -1 },
    { ...confirmed, endAt: "not-time" },
  ])
    assert.throws(() => readConfirmedVisit(data));
});
test("고객의 시간 선택과 최종 확정은 별도 API이며 같은 요청 식별자를 재사용한다", async () => {
  let call = reply(available);
  await getAvailableVisits(10, "inq_private", "2026-11-20");
  assert.equal(
    call.mock.calls[0].arguments[0].pathname,
    "/api/v1/customer/inquiries/10/available-slots",
  );
  assert.equal(
    call.mock.calls[0].arguments[0].search,
    "?from=2026-11-20&days=3",
  );
  mock.restoreAll();
  call = reply(confirmed);
  for (let i = 0; i < 2; i++)
    await confirmCustomerVisit(10, "inq_private", slot, key);
  for (const {
    arguments: [, options],
  } of call.mock.calls) {
    assert.equal(new Headers(options.headers).get("Idempotency-Key"), key);
    assert.equal(
      new Headers(options.headers).get("Authorization"),
      "Bearer inq_private",
    );
    assert.deepEqual(JSON.parse(options.body), { startAt: slot.startAt });
  }
});
test("잘못된 문의·시간·식별자는 서버로 전송하지 않는다", async () => {
  const call = reply(available);
  await assert.rejects(getAvailableVisits(1, "own_other", "2026-11-20"));
  await assert.rejects(getAvailableVisits(1, "inq_private", "2026-02-30"));
  await assert.rejects(
    confirmCustomerVisit(
      1,
      "inq_private",
      { ...slot, endAt: slot.startAt },
      key,
    ),
  );
  await assert.rejects(confirmCustomerVisit(1, "inq_private", slot, "other"));
  assert.equal(call.mock.callCount(), 0);
});
test("예약 오류는 재선택·인증·사장님 확인·기존 예약·접근 만료로 구분한다", () => {
  for (const [code, kind] of [
    ["SLOT_UNAVAILABLE", "conflict"],
    ["PHONE_NOT_VERIFIED", "verify"],
    ["RESERVATION_ALREADY_EXISTS", "existing"],
    ["AUTO_BOOKING_DISABLED", "owner"],
    ["SAFETY_CHECK_REQUIRED", "owner"],
    ["TRAVEL_TIME_UNAVAILABLE", "owner"],
  ])
    assert.equal(bookingIssue(new ApiError(422, code, "")).kind, kind);
  assert.equal(
    bookingIssue(new ApiError(401, "TOKEN_EXPIRED", "")).kind,
    "expired",
  );
  assert.equal(bookingIssue(new Error("network")).kind, "retry");
});
test("방문정보 조회는 같은 문의의 서버 버전과 위치만 사용하고 없는 정보는 만들지 않는다", async () => {
  reply({
    inquiryId: 10,
    version: 3,
    visitInfo: {
      name: null,
      phone: null,
      address: null,
      addressDetail: null,
      lat: null,
      lng: null,
      accessNote: null,
      workCategory: null,
    },
  });
  const data = await getCustomerVisitInfo(10, "inq_private");
  assert.equal(data.coordinates, null);
  assert.equal(data.visit.address, "");
  assert.equal(data.version, 3);
  mock.restoreAll();
  reply({ inquiryId: 11, version: 3, visitInfo: {} });
  await assert.rejects(getCustomerVisitInfo(10, "inq_private"));
});
test("서버 전화번호 오류를 해당 항목에 표시하고 다른 입력은 바꾸지 않는다", async () => {
  const visit = {
    name: "테스트",
    phone: "010-0000-0000",
    address: "테스트 주소",
    addressDetail: "",
    accessNote: "",
    workTypeId: "",
  };
  const call = reply(
    [{ field: "phone", reason: "휴대전화 번호를 확인해 주세요" }],
    400,
    "INVALID_INPUT",
  );
  await assert.rejects(
    saveCustomerVisitInfo(10, "inq_private", 3, visit, { lat: 37.5, lng: 127 }),
    (error) => {
      assert.equal(
        visitSaveError(error).fields.phone,
        "휴대전화 번호를 확인해 주세요",
      );
      return true;
    },
  );
  assert.equal(visit.phone, "010-0000-0000");
  assert.equal(
    JSON.parse(call.mock.calls[0].arguments[1].body).phone,
    "01000000000",
  );
  await assert.rejects(
    saveCustomerVisitInfo(
      10,
      "inq_private",
      3,
      { ...visit, phone: "010abc" },
      { lat: 37.5, lng: 127 },
    ),
    VisitInputError,
  );
  assert.equal(call.mock.callCount(), 1);
});
