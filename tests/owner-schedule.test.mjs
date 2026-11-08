import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSchedule } from "../src/lib/owner-inquiries/schedule.ts";

test("차단 종료가 시작 이전이거나 같으면 막고, 정확히 맞닿은 일정은 허용한다", () => {
  assert.equal(
    checkSchedule({ startAt: 10, endAt: 10 }, [], { required: true }),
    "BAD_RANGE",
  );
  assert.equal(
    checkSchedule({ startAt: 10, endAt: 9 }, [], { required: true }),
    "BAD_RANGE",
  );
  assert.equal(
    checkSchedule({ startAt: 10, endAt: 15 }, [{ startAt: 15, endAt: 20 }], {
      required: true,
    }),
    "READY",
  );
});

test("영업시간 확인은 누락·일정 충돌·이동 검증 실패를 우회하지 못한다", () => {
  const slot = { startAt: 18, endAt: 20 };
  const hours = { startAt: 8, endAt: 19 };
  assert.equal(
    checkSchedule(slot, [], { required: true, hours }),
    "OUTSIDE_HOURS",
  );
  assert.equal(
    checkSchedule(slot, [], { required: true, hours, outsideConfirmed: true }),
    "READY",
  );
  assert.equal(
    checkSchedule(slot, [{ startAt: 19, endAt: 21 }], {
      required: true,
      hours,
      outsideConfirmed: true,
    }),
    "CONFLICT",
  );
  assert.equal(
    checkSchedule(slot, [], {
      required: true,
      hours,
      routeAvailable: false,
      outsideConfirmed: true,
    }),
    "ROUTE_UNAVAILABLE",
  );
  assert.equal(
    checkSchedule(slot, [], { required: false, hours, outsideConfirmed: true }),
    "INCOMPLETE",
  );
});
