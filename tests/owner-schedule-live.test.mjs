import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import {
  loadOwnerSchedule,
  ownerScheduleRequest,
  scheduleDate,
  scheduleClock,
  scheduleIso,
  shiftDay,
  scheduleIssue,
} from "../src/lib/owner-schedule-api.ts";

const before = process.env.NEXT_PUBLIC_API_BASE_URL;
afterEach(() => {
  mock.restoreAll();
  if (before === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = before;
});

test("서울 날짜·시간은 기기 시간대와 무관하게 다음 주와 자정을 처리한다", () => {
  const instant = Date.parse("2026-11-25T15:00:00Z");
  assert.equal(scheduleDate(instant), "2026-11-26");
  assert.equal(scheduleClock(instant), "00:00");
  assert.equal(shiftDay("2026-12-30", 6), "2027-01-05");
  assert.equal(scheduleIso("2026-11-26", "00:00"), "2026-11-26T00:00:00+09:00");
});

test("서버 일정은 제안 전 기존 시간·이동정보를 유지하고 여러 날에 걸친 차단은 한 ID로 묶는다", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:35116";
  const from = "2026-11-23";
  const to = "2026-11-29";
  const block = {
    blockId: 42,
    startAt: scheduleIso("2026-11-26", "18:00"),
    endAt: scheduleIso("2026-11-27", "10:00"),
    reason: "휴무",
  };
  const startAt = scheduleIso("2026-11-26", "10:00");
  mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.pathname, "/api/v1/owner/schedule");
    assert.equal(url.searchParams.get("from"), from);
    assert.equal(url.searchParams.get("to"), to);
    assert.equal(options.headers.get("Authorization"), "Bearer own_test");
    return Response.json({
      success: true,
      code: "OK",
      message: "",
      result: {
        from,
        to,
        days: [
          {
            date: "2026-11-26",
            blocks: [block],
            visits: [
              {
                reservationId: 42,
                inquiryId: 7,
                status: "CONFIRMED",
                startAt,
                endAt: scheduleIso("2026-11-26", "11:00"),
                customerName: "테스트",
                workCategory: "REPAIR",
                address: "테스트 주소",
                isManual: false,
                activeChange: { status: "PROPOSED" },
                travelMinutes: null,
                travelStatus: "UNKNOWN",
              },
            ],
          },
          { date: "2026-11-27", blocks: [block], visits: [] },
        ],
      },
    });
  });
  const items = await loadOwnerSchedule("own_test", from, to);
  assert.deepEqual(
    items.map((item) => item.id),
    ["block-42", "reservation-42"],
  );
  assert.equal(items[1].startAt, Date.parse(startAt));
  assert.equal(items[1].status, "변경 제안");
  assert.equal(items[1].travel, "unknown");
});

test("수동 예약과 예약 변경은 서버의 idempotency 키·버전 계약을 그대로 전송한다", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:35116";
  const key = "b1a11a11-3211-4f22-ad11-31311a111111";
  const first = {
    workTypeId: 62,
    customerPhone: "01000000000",
    address: "테스트 주소",
    lat: 37.5,
    lng: 126.8,
    startAt: scheduleIso("2026-11-26", "10:00"),
  };
  const second = {
    baseVersion: 3,
    changeId: 13,
    proposedStartAt: scheduleIso("2026-11-27", "10:00"),
  };
  let calls = 0;
  mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(init.method, "POST");
    if (calls++ === 0) {
      assert.equal(url.pathname, "/api/v1/owner/reservations");
      assert.equal(init.headers.get("Idempotency-Key"), key);
      assert.deepEqual(JSON.parse(init.body), first);
      return Response.json({
        success: true,
        code: "OK",
        message: "",
        result: { reservationId: 1 },
      });
    }
    assert.equal(url.pathname, "/api/v1/owner/reservations/1/proposals");
    assert.equal(init.headers.get("Idempotency-Key"), null);
    assert.deepEqual(JSON.parse(init.body), second);
    return Response.json(
      {
        success: false,
        code: "RESERVATION_VERSION_CONFLICT",
        message: "",
        result: null,
      },
      { status: 409 },
    );
  });
  await ownerScheduleRequest("own_test", "reservations", {
    method: "POST",
    body: first,
    key,
  });
  await assert.rejects(
    ownerScheduleRequest("own_test", "reservations/1/proposals", {
      method: "POST",
      body: second,
    }),
    (error) => /기존 예약은 그대로/.test(scheduleIssue(error)),
  );
  assert.equal(calls, 2);
});
