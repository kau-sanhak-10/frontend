// 방문 작업·메모·완료·알림 (FE-13 · B-23~B-27)
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  completeVisit,
  correctCompletion,
  fetchNotificationPrefs,
  fetchNotifications,
  fetchVisit,
  fetchVisits,
  fetchWorkNote,
  markNotificationRead,
  mockWorkConfig,
  resetMockWork,
  saveNotificationPrefs,
  saveWorkNote,
} from "../src/lib/owner-work/mock-api.ts";
import {
  DEFAULT_PREFS,
  groupVisits,
  noteError,
  notificationHref,
  prefsWarning,
  reasonError,
  remainingToday,
  splitNotifications,
  unreadCount,
  visitActionsOf,
} from "../src/lib/owner-work/rules.ts";

const NOW = new Date(2026, 10, 16, 12, 0).getTime();
const HANBIT = "biz-hanbit";

beforeEach(() => {
  mockWorkConfig.delayMs = 0;
  mockWorkConfig.fail = false;
  mockWorkConfig.saveFail = false;
  mockWorkConfig.now = () => NOW;
  resetMockWork();
});

async function visitsOf(businessId = HANBIT) {
  const res = await fetchVisits(businessId);
  assert.equal(res.ok, true);
  return res.data;
}

// ── 방문 작업 (B-23) ──

test("오늘 방문은 시간 순, 내일 확정 예약은 예정, 지난·취소는 따로 나눈다", async () => {
  const { today, upcoming, past } = groupVisits(await visitsOf(), NOW);
  assert.deepEqual(
    today.map((v) => v.id),
    ["v-106", "v-101"],
  );
  assert.deepEqual(
    upcoming.map((v) => v.id),
    ["v-201"],
  );
  assert.deepEqual(past.map((v) => v.id).sort(), ["v-107", "v-202"]);
  assert.equal(remainingToday(today, NOW), 2);
});

test("다른 업체의 방문 작업은 목록에도 상세에도 나오지 않는다", async () => {
  const ids = (await visitsOf()).map((v) => v.id);
  assert.equal(ids.includes("v-901"), false);
  assert.deepEqual(await fetchVisit(HANBIT, "v-901"), {
    ok: false,
    code: "NOT_FOUND",
  });
  assert.deepEqual(await fetchWorkNote(HANBIT, "v-901"), {
    ok: false,
    code: "NOT_FOUND",
  });
});

test("조회 실패를 빈 목록으로 바꾸지 않는다", async () => {
  mockWorkConfig.fail = true;
  assert.deepEqual(await fetchVisits(HANBIT), {
    ok: false,
    code: "LOAD_FAILED",
  });
});

// ── 사장님 전용 메모 (B-24) ──

test("메모를 저장하면 다시 열어도 남아 있고, 수정 시각만 바뀐다", async () => {
  const first = await fetchWorkNote(HANBIT, "v-201");
  assert.deepEqual(first, { ok: true, data: null });

  const saved = await saveWorkNote(HANBIT, "v-201", "  공구 챙기기  ");
  assert.equal(saved.ok, true);
  assert.equal(saved.data.content, "공구 챙기기");
  assert.equal(saved.data.createdAt, NOW);

  mockWorkConfig.now = () => NOW + 60_000;
  const edited = await saveWorkNote(HANBIT, "v-201", "공구·부품 챙기기");
  assert.equal(edited.data.createdAt, NOW);
  assert.equal(edited.data.updatedAt, NOW + 60_000);

  const reopened = await fetchWorkNote(HANBIT, "v-201");
  assert.equal(reopened.data.content, "공구·부품 챙기기");
});

test("메모 저장이 실패하면 저장된 내용이 바뀌지 않는다", async () => {
  mockWorkConfig.saveFail = true;
  assert.deepEqual(await saveWorkNote(HANBIT, "v-106", "새 메모"), {
    ok: false,
    code: "SAVE_FAILED",
  });
  mockWorkConfig.saveFail = false;
  const note = await fetchWorkNote(HANBIT, "v-106");
  assert.match(note.data.content, /주차/);
});

test("빈 메모와 너무 긴 메모는 막는다", async () => {
  assert.equal(noteError("   "), "메모 내용을 입력해 주세요.");
  assert.notEqual(noteError("가".repeat(2001)), null);
  assert.equal(noteError("정상 메모"), null);
  assert.deepEqual(await saveWorkNote(HANBIT, "v-106", ""), {
    ok: false,
    code: "INVALID",
  });
});

// ── 작업 완료·정정 (B-25) ──

test("작업을 완료하면 완료 시각과 이력이 남고, 다시 완료해도 한 번만 기록된다", async () => {
  const before = (await fetchVisit(HANBIT, "v-106")).data;
  assert.deepEqual(visitActionsOf(before), {
    canComplete: true,
    canCorrect: false,
  });

  const done = await completeVisit(HANBIT, "v-106", before.version);
  assert.equal(done.ok, true);
  assert.equal(done.data.status, "COMPLETED");
  assert.equal(done.data.completedAt, NOW);

  const again = await completeVisit(HANBIT, "v-106", before.version);
  assert.equal(again.ok, true);
  const after = (await fetchVisit(HANBIT, "v-106")).data;
  assert.equal(
    after.history.filter((h) => h.to === "COMPLETED").length,
    1,
    "완료 이력이 한 번만 있어야 합니다",
  );
  assert.equal(after.version, before.version + 1);
});

test("취소된 예약은 완료할 수 없다", async () => {
  const canceled = (await fetchVisit(HANBIT, "v-202")).data;
  assert.equal(visitActionsOf(canceled).canComplete, false);
  assert.match(visitActionsOf(canceled).blockedReason, /취소/);
  assert.deepEqual(await completeVisit(HANBIT, "v-202", canceled.version), {
    ok: false,
    code: "NOT_ALLOWED",
  });
});

test("다른 곳에서 먼저 바뀐 예약은 완료하지 않는다", async () => {
  assert.deepEqual(await completeVisit(HANBIT, "v-101", 99), {
    ok: false,
    code: "CONFLICT",
  });
});

test("완료 정정은 사유가 있어야 하고, 예약 확정으로 돌아가며 이력이 남는다", async () => {
  const done = (await fetchVisit(HANBIT, "v-107")).data;
  assert.equal(visitActionsOf(done).canCorrect, true);
  assert.equal(reasonError(" "), "정정 사유를 입력해 주세요.");
  assert.deepEqual(await correctCompletion(HANBIT, "v-107", done.version, ""), {
    ok: false,
    code: "INVALID",
  });

  const res = await correctCompletion(
    HANBIT,
    "v-107",
    done.version,
    "다른 예약을 눌렀어요",
  );
  assert.equal(res.ok, true);
  assert.equal(res.data.status, "CONFIRMED");
  assert.equal(res.data.completedAt, null);
  const last = res.data.history.at(-1);
  assert.deepEqual(
    { from: last.from, to: last.to, reason: last.reason },
    { from: "COMPLETED", to: "CONFIRMED", reason: "다른 예약을 눌렀어요" },
  );
  // 이전 완료 기록도 그대로 남습니다.
  assert.ok(res.data.history.some((h) => h.to === "COMPLETED"));
});

test("완료 처리가 실패하면 예약 상태가 바뀌지 않는다", async () => {
  mockWorkConfig.saveFail = true;
  assert.deepEqual(await completeVisit(HANBIT, "v-106", 1), {
    ok: false,
    code: "SAVE_FAILED",
  });
  mockWorkConfig.saveFail = false;
  assert.equal((await fetchVisit(HANBIT, "v-106")).data.status, "CONFIRMED");
});

// ── 알림 (B-26) ──

test("안전 확인 요청은 일반 알림과 따로 나누고, 다른 업체 알림은 보이지 않는다", async () => {
  const res = await fetchNotifications(HANBIT);
  assert.equal(res.ok, true);
  assert.equal(
    res.data.some((n) => n.id === "n-9"),
    false,
  );
  const { safety, general } = splitNotifications(res.data);
  assert.deepEqual(
    safety.map((n) => n.id),
    ["n-1"],
  );
  // 최신 알림이 위로 옵니다.
  assert.deepEqual(
    general.map((n) => n.id),
    ["n-2", "n-3", "n-4", "n-5"],
  );
  assert.equal(unreadCount(res.data), 3);
});

test("알림은 해당 문의·예약 상세로 이동한다", () => {
  assert.equal(
    notificationHref({ refType: "INQUIRY", refId: "inq-102" }),
    "/owner/inquiries/inq-102",
  );
  assert.equal(
    notificationHref({ refType: "RESERVATION", refId: "v-101" }),
    "/owner/visits/v-101",
  );
});

test("읽음 표시는 처음 읽은 시각을 유지하고 다른 업체 알림은 못 바꾼다", async () => {
  const first = await markNotificationRead(HANBIT, "n-2");
  assert.equal(first.data.readAt, NOW);
  mockWorkConfig.now = () => NOW + 5_000;
  const again = await markNotificationRead(HANBIT, "n-2");
  assert.equal(again.data.readAt, NOW);
  assert.deepEqual(await markNotificationRead(HANBIT, "n-9"), {
    ok: false,
    code: "NOT_FOUND",
  });
  const list = (await fetchNotifications(HANBIT)).data;
  assert.equal(unreadCount(list), 2);
});

// ── 알림 수신 설정 (B-27) ──

test("알림 설정을 저장하면 다시 불러와도 유지된다", async () => {
  assert.deepEqual((await fetchNotificationPrefs(HANBIT)).data, DEFAULT_PREFS);
  const next = { ...DEFAULT_PREFS, CHANGE: false };
  assert.equal((await saveNotificationPrefs(HANBIT, next)).ok, true);
  assert.deepEqual((await fetchNotificationPrefs(HANBIT)).data, next);
});

test("설정 저장이 실패하면 이전 설정이 그대로다", async () => {
  mockWorkConfig.saveFail = true;
  const res = await saveNotificationPrefs(HANBIT, {
    ...DEFAULT_PREFS,
    CANCEL: false,
  });
  assert.deepEqual(res, { ok: false, code: "SAVE_FAILED" });
  mockWorkConfig.saveFail = false;
  assert.deepEqual((await fetchNotificationPrefs(HANBIT)).data, DEFAULT_PREFS);
});

test("중요 알림(신규 예약·확인 필요)을 끄면 경고한다", () => {
  assert.equal(prefsWarning(DEFAULT_PREFS), null);
  assert.equal(prefsWarning({ ...DEFAULT_PREFS, CHANGE: false }), null);
  assert.match(
    prefsWarning({ ...DEFAULT_PREFS, NEEDS_CHECK: false }),
    /확인 필요 알림을 끄면/,
  );
});
