// 방문 작업·메모·완료·알림 목업 (FE-13)
// 사장님용 예약·메모·알림 API가 아직 없어 화면 확인용으로 씁니다.
// 백엔드 테이블(reservation·reservation_history·work_note·notification) 규칙을 따릅니다.
// 브라우저 메모리에만 저장되고, 새로고침하면 처음 값으로 돌아갑니다.
//
// 개발 서버에서 주소 뒤에 붙여 상태를 확인할 수 있어요.
// - ?mock=empty : 방문·알림 없음
// - ?mock=fail : 조회 실패
// - ?mock=slow : 느린 응답 (불러오는 중 화면)
// - ?mock=savefail : 메모 저장·완료 처리·알림 설정 저장 실패
import type {
  NotificationPrefs,
  OwnerNotification,
  Visit,
  VisitHistoryItem,
  WorkLoadResult,
  WorkNote,
  WorkSaveResult,
} from "./types";
import { DEFAULT_PREFS, noteError, reasonError } from "./rules.ts";

type DevMode = "empty" | "fail" | "slow" | "savefail";

function devMode(): DevMode | null {
  if (process.env.NODE_ENV === "production") return null;
  if (typeof window === "undefined") return null;
  const mode = new URLSearchParams(window.location.search).get("mock");
  return mode === "empty" ||
    mode === "fail" ||
    mode === "slow" ||
    mode === "savefail"
    ? mode
    : null;
}

export const mockWorkConfig = {
  /** 응답 지연(ms). 테스트에서는 0으로 둡니다. */
  delayMs: 400,
  /** true면 조회가 실패합니다. */
  fail: false,
  /** true면 저장·처리가 실패합니다. */
  saveFail: false,
  now: () => Date.now(),
};

// 사장님 문의 목업과 같은 업체 구분값을 씁니다.
const HANBIT = "biz-hanbit";
const TEUNTEUN = "biz-teunteun";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MINUTE = 60_000;

function dayAt(offsetDays: number, h: number, m = 0) {
  const d = new Date(mockWorkConfig.now());
  d.setHours(h, m, 0, 0);
  return d.getTime() + offsetDays * DAY;
}

function wait() {
  const ms = devMode() === "slow" ? 2500 : mockWorkConfig.delayMs;
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

const loadFails = () => mockWorkConfig.fail || devMode() === "fail";
const saveFails = () => mockWorkConfig.saveFail || devMode() === "savefail";

/** 예시 연락처. 실제 고객 번호가 아닙니다. */
const examplePhone = (tail: string) => `010-0000-${tail}`;

function baseVisits(): Visit[] {
  const created = (at: number): VisitHistoryItem[] => [
    { from: null, to: "CONFIRMED", by: "SYSTEM", at },
  ];
  return [
    {
      id: "v-106",
      businessId: HANBIT,
      // 문의 목업 inq-106의 방문 예약과 같은 예약입니다.
      inquiryId: "inq-106",
      customerLabel: "김○○",
      contactPhone: examplePhone("1061"),
      address: "화정동 ○○아파트 102동",
      startAt: dayAt(0, 14),
      endAt: dayAt(0, 15),
      status: "CONFIRMED",
      workType: "온수 고장 수리",
      completedAt: null,
      version: 1,
      history: created(dayAt(0, 9, 50)),
    },
    {
      id: "v-101",
      businessId: HANBIT,
      inquiryId: "inq-101",
      customerLabel: "박○○",
      contactPhone: examplePhone("1011"),
      address: "행신동 ○○빌라 3층",
      startAt: dayAt(0, 16),
      endAt: dayAt(0, 17),
      status: "CONFIRMED",
      workType: "정기 점검",
      completedAt: null,
      version: 1,
      history: created(dayAt(-1, 18)),
    },
    {
      id: "v-201",
      businessId: HANBIT,
      // 사장님이 전화로 받아 직접 등록한 예약 (연결된 문의 없음)
      inquiryId: null,
      customerLabel: "서○○",
      contactPhone: examplePhone("2011"),
      address: "능곡동 ○○주택 1층",
      startAt: dayAt(1, 10),
      endAt: dayAt(1, 11),
      status: "CONFIRMED",
      workType: "배관 점검",
      completedAt: null,
      version: 1,
      history: created(dayAt(-1, 11)),
    },
    {
      id: "v-202",
      businessId: HANBIT,
      inquiryId: null,
      customerLabel: "문○○",
      contactPhone: examplePhone("2021"),
      address: "주엽동 ○○오피스텔",
      startAt: dayAt(1, 15),
      endAt: dayAt(1, 16),
      status: "CANCELED",
      workType: "난방 점검",
      completedAt: null,
      version: 2,
      history: [
        ...created(dayAt(-2, 10)),
        {
          from: "CONFIRMED",
          to: "CANCELED",
          by: "CUSTOMER",
          at: dayAt(-1, 20),
        },
      ],
    },
    {
      id: "v-107",
      businessId: HANBIT,
      inquiryId: "inq-107",
      customerLabel: "한○○",
      contactPhone: examplePhone("1071"),
      address: "원당동 ○○아파트 5동",
      startAt: dayAt(-3, 11),
      endAt: dayAt(-3, 12),
      status: "COMPLETED",
      workType: "보일러 교체 상담",
      completedAt: dayAt(-3, 12, 10),
      version: 2,
      history: [
        ...created(dayAt(-4, 15)),
        {
          from: "CONFIRMED",
          to: "COMPLETED",
          by: "OWNER",
          at: dayAt(-3, 12, 10),
        },
      ],
    },
    {
      id: "v-901",
      businessId: TEUNTEUN,
      inquiryId: "inq-901",
      customerLabel: "오○○",
      contactPhone: examplePhone("9011"),
      address: "다른 업체 주소",
      startAt: dayAt(0, 11),
      endAt: dayAt(0, 12),
      status: "CONFIRMED",
      workType: "점검",
      completedAt: null,
      version: 1,
      history: created(dayAt(-1, 9)),
    },
  ];
}

function baseNotes(): Record<string, WorkNote> {
  const at = dayAt(0, 9, 55);
  return {
    "v-106": {
      content: "지하 2층 주차. 도착 10분 전 경비실에 연락하기.",
      createdAt: at,
      updatedAt: at,
    },
  };
}

function baseNotifications(): OwnerNotification[] {
  const now = mockWorkConfig.now();
  return [
    {
      id: "n-1",
      businessId: HANBIT,
      event: "NEEDS_CHECK",
      safety: true,
      refType: "INQUIRY",
      refId: "inq-102",
      title: "안전 확인이 필요한 문의",
      body: "윤○○ 고객이 가스 냄새가 난다고 했어요. 덕구가 응대를 멈췄어요.",
      createdAt: now - 25 * MINUTE,
      readAt: null,
    },
    {
      id: "n-2",
      businessId: HANBIT,
      event: "CHANGE",
      safety: false,
      refType: "RESERVATION",
      refId: "v-101",
      title: "방문시간 변경 요청",
      body: "박○○ 고객이 내일 오후로 변경을 요청했어요. 확정 전까지 기존 예약은 유지돼요.",
      createdAt: now - 1 * HOUR,
      readAt: null,
    },
    {
      id: "n-3",
      businessId: HANBIT,
      event: "NEW_RESERVATION",
      safety: false,
      refType: "RESERVATION",
      refId: "v-106",
      title: "새 방문 예약",
      body: "김○○ 고객 · 오늘 14:00 · 화정동",
      createdAt: now - 3 * HOUR,
      readAt: null,
    },
    {
      id: "n-4",
      businessId: HANBIT,
      event: "CANCEL",
      safety: false,
      refType: "RESERVATION",
      refId: "v-202",
      title: "예약 취소",
      body: "문○○ 고객이 내일 15:00 방문을 취소했어요.",
      createdAt: now - 14 * HOUR,
      readAt: now - 13 * HOUR,
    },
    {
      id: "n-5",
      businessId: HANBIT,
      event: "NEEDS_CHECK",
      safety: false,
      refType: "INQUIRY",
      refId: "inq-105",
      title: "고객이 직접 상담을 요청했어요",
      body: "정○○ 고객이 사장님과 직접 이야기하고 싶어 해요.",
      createdAt: now - 26 * HOUR,
      readAt: now - 25 * HOUR,
    },
    {
      id: "n-9",
      businessId: TEUNTEUN,
      event: "NEW_RESERVATION",
      safety: false,
      refType: "RESERVATION",
      refId: "v-901",
      title: "다른 업체 알림",
      body: "다른 업체 알림",
      createdAt: now - HOUR,
      readAt: null,
    },
  ];
}

// ── 화면에서 바뀐 값 (메모리) ─────────────────────────────

const visitPatches = new Map<string, Partial<Visit>>();
const notes = new Map<string, WorkNote | null>();
const readAts = new Map<string, number>();
const prefsByBusiness = new Map<string, NotificationPrefs>();

/** 테스트끼리 값이 섞이지 않게 비웁니다. */
export function resetMockWork() {
  visitPatches.clear();
  notes.clear();
  readAts.clear();
  prefsByBusiness.clear();
}

function allVisits(): Visit[] {
  return baseVisits().map((v) => ({ ...v, ...visitPatches.get(v.id) }));
}

function findVisit(businessId: string, visitId: string) {
  return allVisits().find(
    (v) => v.id === visitId && v.businessId === businessId,
  );
}

// ── 방문 작업 (B-23) ─────────────────────────────

/** 업체의 방문 목록. 다른 업체 예약은 빠집니다. */
export async function fetchVisits(
  businessId: string,
): Promise<WorkLoadResult<Visit[]>> {
  await wait();
  if (loadFails()) return { ok: false, code: "LOAD_FAILED" };
  if (devMode() === "empty") return { ok: true, data: [] };
  return {
    ok: true,
    data: allVisits().filter((v) => v.businessId === businessId),
  };
}

/** 방문 상세. 다른 업체 예약은 없는 예약처럼 다룹니다. */
export async function fetchVisit(
  businessId: string,
  visitId: string,
): Promise<WorkLoadResult<Visit>> {
  await wait();
  if (loadFails()) return { ok: false, code: "LOAD_FAILED" };
  const visit = findVisit(businessId, visitId);
  return visit ? { ok: true, data: visit } : { ok: false, code: "NOT_FOUND" };
}

// ── 사장님 전용 메모 (B-24) ─────────────────────────────

export async function fetchWorkNote(
  businessId: string,
  visitId: string,
): Promise<WorkLoadResult<WorkNote | null>> {
  await wait();
  if (loadFails()) return { ok: false, code: "LOAD_FAILED" };
  if (!findVisit(businessId, visitId)) return { ok: false, code: "NOT_FOUND" };
  const saved = notes.has(visitId) ? notes.get(visitId)! : baseNotes()[visitId];
  return { ok: true, data: saved ?? null };
}

/** 메모 저장. 처음이면 작성 시각, 이후에는 수정 시각만 바뀝니다. */
export async function saveWorkNote(
  businessId: string,
  visitId: string,
  content: string,
): Promise<WorkSaveResult<WorkNote>> {
  await wait();
  if (saveFails()) return { ok: false, code: "SAVE_FAILED" };
  if (!findVisit(businessId, visitId)) return { ok: false, code: "NOT_FOUND" };
  if (noteError(content)) return { ok: false, code: "INVALID" };
  const before = notes.has(visitId) ? notes.get(visitId) : baseNotes()[visitId];
  const now = mockWorkConfig.now();
  const saved: WorkNote = {
    content: content.trim(),
    createdAt: before?.createdAt ?? now,
    updatedAt: now,
  };
  notes.set(visitId, saved);
  return { ok: true, data: saved };
}

// ── 작업 완료·정정 (B-25) ─────────────────────────────

/**
 * 작업 완료. 이미 완료된 예약을 다시 완료해도 새로 기록하지 않고 그대로 돌려줍니다.
 * 취소·대기 예약은 완료할 수 없습니다. 화면이 본 버전과 다르면 거절합니다.
 */
export async function completeVisit(
  businessId: string,
  visitId: string,
  version: number,
): Promise<WorkSaveResult<Visit>> {
  await wait();
  if (saveFails()) return { ok: false, code: "SAVE_FAILED" };
  const visit = findVisit(businessId, visitId);
  if (!visit) return { ok: false, code: "NOT_FOUND" };
  if (visit.status === "COMPLETED") return { ok: true, data: visit };
  if (visit.status !== "CONFIRMED") return { ok: false, code: "NOT_ALLOWED" };
  if (visit.version !== version) return { ok: false, code: "CONFLICT" };
  const now = mockWorkConfig.now();
  const updated: Partial<Visit> = {
    status: "COMPLETED",
    completedAt: now,
    version: visit.version + 1,
    history: [
      ...visit.history,
      { from: "CONFIRMED", to: "COMPLETED", by: "OWNER", at: now },
    ],
  };
  visitPatches.set(visitId, { ...visitPatches.get(visitId), ...updated });
  return { ok: true, data: { ...visit, ...updated } };
}

/**
 * 완료 정정. 사유를 꼭 받고 예약 확정 상태로 되돌립니다.
 * 이전 완료와 정정 사유는 이력에 남기며, 예약 취소로 처리하지 않습니다.
 */
export async function correctCompletion(
  businessId: string,
  visitId: string,
  version: number,
  reason: string,
): Promise<WorkSaveResult<Visit>> {
  await wait();
  if (saveFails()) return { ok: false, code: "SAVE_FAILED" };
  const visit = findVisit(businessId, visitId);
  if (!visit) return { ok: false, code: "NOT_FOUND" };
  if (reasonError(reason)) return { ok: false, code: "INVALID" };
  if (visit.status !== "COMPLETED") return { ok: false, code: "NOT_ALLOWED" };
  if (visit.version !== version) return { ok: false, code: "CONFLICT" };
  const now = mockWorkConfig.now();
  const updated: Partial<Visit> = {
    status: "CONFIRMED",
    completedAt: null,
    version: visit.version + 1,
    history: [
      ...visit.history,
      {
        from: "COMPLETED",
        to: "CONFIRMED",
        by: "OWNER",
        reason: reason.trim(),
        at: now,
      },
    ],
  };
  visitPatches.set(visitId, { ...visitPatches.get(visitId), ...updated });
  return { ok: true, data: { ...visit, ...updated } };
}

// ── 알림 (B-26) ─────────────────────────────

function allNotifications(): OwnerNotification[] {
  return baseNotifications().map((n) =>
    readAts.has(n.id) && n.readAt === null
      ? { ...n, readAt: readAts.get(n.id)! }
      : n,
  );
}

export async function fetchNotifications(
  businessId: string,
): Promise<WorkLoadResult<OwnerNotification[]>> {
  await wait();
  if (loadFails()) return { ok: false, code: "LOAD_FAILED" };
  if (devMode() === "empty") return { ok: true, data: [] };
  return {
    ok: true,
    data: allNotifications().filter((n) => n.businessId === businessId),
  };
}

/** 읽음 표시. 여러 번 눌러도 처음 읽은 시각을 유지합니다. 문의·예약 상태는 바꾸지 않습니다. */
export async function markNotificationRead(
  businessId: string,
  notificationId: string,
): Promise<WorkSaveResult<OwnerNotification>> {
  // 읽음 표시는 화면 이동을 막지 않도록 지연 없이 처리합니다.
  if (saveFails()) return { ok: false, code: "SAVE_FAILED" };
  const found = allNotifications().find(
    (n) => n.id === notificationId && n.businessId === businessId,
  );
  if (!found) return { ok: false, code: "NOT_FOUND" };
  if (found.readAt !== null) return { ok: true, data: found };
  const at = mockWorkConfig.now();
  readAts.set(notificationId, at);
  return { ok: true, data: { ...found, readAt: at } };
}

// ── 알림 수신 설정 (B-27) ─────────────────────────────

export async function fetchNotificationPrefs(
  businessId: string,
): Promise<WorkLoadResult<NotificationPrefs>> {
  await wait();
  if (loadFails()) return { ok: false, code: "LOAD_FAILED" };
  return {
    ok: true,
    data: { ...(prefsByBusiness.get(businessId) ?? DEFAULT_PREFS) },
  };
}

export async function saveNotificationPrefs(
  businessId: string,
  prefs: NotificationPrefs,
): Promise<WorkSaveResult<NotificationPrefs>> {
  await wait();
  if (saveFails()) return { ok: false, code: "SAVE_FAILED" };
  prefsByBusiness.set(businessId, { ...prefs });
  return { ok: true, data: { ...prefs } };
}
