// 사장님 업무 알림 실제 서버 응답(BE-14)을 화면 모양으로 바꿉니다. (FE-16 · B-26·B-27)
// 서버는 알림 문구를 보내지 않아서, eventType·refType으로 화면이 문구를 만듭니다.
import type {
  NotificationEvent,
  NotificationKind,
  NotificationPrefs,
  OwnerNotification,
  Visit,
  WorkNote,
} from "./types";

/** 서버 알림 유형 (NotificationEventType) */
export type ServerNotificationEvent =
  | "NEW_RESERVATION"
  | "NEEDS_CHECK"
  | "CHANGE"
  | "CANCEL"
  | "RESULT"
  | "RESERVATION_CONFIRMED"
  | "CHANGE_PROPOSED"
  | "CHANGE_APPLIED"
  | "RESERVATION_CANCELED";

/** GET /api/v1/owner/notifications 의 알림 한 건 */
export type ServerNotification = {
  notificationId: number;
  eventType: ServerNotificationEvent | string;
  refType: "INQUIRY" | "RESERVATION" | string;
  refId: number;
  createdAt: string;
  /** 안 읽었으면 null */
  readAt: string | null;
  safety?: boolean;
};

/** 목록 공통 형식 (page는 0부터) */
export type ServerNotificationPage = {
  content: ServerNotification[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  isLast: boolean;
};

/** 수신 설정 4종류 (NotifySettingType). 서버도 같은 이름을 씁니다. */
export const SETTING_TYPES: NotificationEvent[] = [
  "NEW_RESERVATION",
  "NEEDS_CHECK",
  "CHANGE",
  "CANCEL",
];

/** 서버 알림 유형 → 화면 종류 (수신 설정 4종류로 묶기) */
export function kindOf(eventType: string): NotificationKind {
  switch (eventType) {
    case "NEW_RESERVATION":
    case "RESERVATION_CONFIRMED":
      return "NEW_RESERVATION";
    case "NEEDS_CHECK":
      return "NEEDS_CHECK";
    case "CHANGE":
    case "CHANGE_PROPOSED":
    case "CHANGE_APPLIED":
      return "CHANGE";
    case "CANCEL":
    case "RESERVATION_CANCELED":
      return "CANCEL";
    default:
      return "OTHER";
  }
}

const TITLE: Record<string, string> = {
  NEW_RESERVATION: "새 방문 예약이 들어왔어요",
  RESERVATION_CONFIRMED: "고객이 방문 예약을 확정했어요",
  NEEDS_CHECK: "사장님 확인이 필요한 문의가 있어요",
  CHANGE: "방문시간 변경 요청이 있어요",
  CHANGE_PROPOSED: "방문시간 변경 제안이 있어요",
  CHANGE_APPLIED: "방문시간 변경이 확정됐어요",
  CANCEL: "고객이 예약을 취소했어요",
  RESERVATION_CANCELED: "예약이 취소됐어요",
  RESULT: "처리 결과 알림이 있어요",
};

/** 알림 제목. 모르는 유형이 와도 빈칸으로 두지 않습니다. */
export function notificationTitle(eventType: string): string {
  return TITLE[eventType] ?? "새 알림이 있어요";
}

/** 알림 부제. 고객 정보는 서버가 보내지 않으므로 어디로 이동하는지만 알려 줍니다. */
export function notificationBody(refType: string, refId: number): string {
  return refType === "RESERVATION"
    ? `예약 ${refId}번 · 눌러서 예약 내용을 확인하세요.`
    : `문의 ${refId}번 · 눌러서 문의 내용을 확인하세요.`;
}

function toTime(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** 서버 알림 한 건 → 화면 알림 */
export function mapNotification(n: ServerNotification): OwnerNotification {
  const refType = n.refType === "RESERVATION" ? "RESERVATION" : "INQUIRY";
  return {
    id: String(n.notificationId),
    // 서버가 로그인한 업체 알림만 돌려줘서 화면에서는 업체를 따로 구분하지 않습니다.
    businessId: "",
    event: kindOf(n.eventType),
    safety:
      n.refType === "INQUIRY" &&
      n.eventType === "NEEDS_CHECK" &&
      n.safety === true,
    refType,
    refId: String(n.refId),
    title: notificationTitle(n.eventType),
    body: notificationBody(refType, n.refId),
    createdAt: toTime(n.createdAt) ?? 0,
    readAt: toTime(n.readAt),
  };
}

/**
 * 서버 수신 설정 → 화면 설정.
 * 서버가 빠뜨린 종류는 켜짐으로 봅니다. (서버도 저장 전이면 모두 켜짐)
 */
export function mapPrefs(
  server: Partial<Record<string, boolean>>,
): NotificationPrefs {
  const prefs = {} as NotificationPrefs;
  for (const type of SETTING_TYPES) prefs[type] = server[type] !== false;
  return prefs;
}

/** 화면 설정 → 서버 요청 (4종류를 모두 보내야 합니다. 빠지면 서버가 400) */
export function prefsRequest(
  prefs: NotificationPrefs,
): Record<NotificationEvent, boolean> {
  const body = {} as Record<NotificationEvent, boolean>;
  for (const type of SETTING_TYPES) body[type] = Boolean(prefs[type]);
  return body;
}

// ── 방문 작업·메모·완료 (BE-13 · B-23~B-25) ─────────────────────────────

/** 서버 예약 상태 (ReservationStatus) */
export type ServerVisitStatus =
  "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELED";

/** 서버 작업 종류 (WorkCategory) */
export type ServerVisitWork = "INSPECTION" | "REPAIR" | "LEAK" | "REPLACEMENT";

const VISIT_WORK_LABEL: Record<ServerVisitWork, string> = {
  INSPECTION: "점검",
  REPAIR: "수리",
  LEAK: "누수",
  REPLACEMENT: "보일러 교체",
};

/** GET /api/v1/owner/schedule 의 방문 한 건 (OwnerScheduleResponse.Visit) */
export type ServerScheduleVisit = {
  reservationId: number;
  status: ServerVisitStatus;
  startAt: string;
  endAt: string;
  workMinutes: number;
  isManual: boolean;
  workCategory: ServerVisitWork | null;
  inquiryId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
};

export type ServerSchedule = {
  from: string;
  to: string;
  days: { date: string; visits: ServerScheduleVisit[] | null }[];
};

/** GET /api/v1/owner/reservations/{id} (OwnerReservationDetailResponse) */
export type ServerReservationDetail = ServerScheduleVisit & {
  version: number;
  addressDetail: string | null;
  accessNote: string | null;
  completedAt: string | null;
};

/** GET·PUT …/work-note (WorkNoteResponse) */
export type ServerWorkNote = {
  reservationId: number;
  content: string | null;
  updatedAt: string | null;
};

/** 고객 이름은 첫 글자만 보여 줍니다. (예: 김민수 → 김○○) */
function visitCustomerLabel(name: string | null): string {
  const first = name?.trim().at(0);
  return first ? `${first}○○` : "고객";
}

function visitWorkLabel(work: ServerVisitWork | null): string {
  return (work && VISIT_WORK_LABEL[work]) || "작업 종류 미정";
}

/** 일정 목록의 방문 → 화면 방문. 목록에는 버전·완료 시각이 없어 상세에서 다시 받습니다. */
export function mapScheduleVisit(v: ServerScheduleVisit): Visit {
  return {
    id: String(v.reservationId),
    businessId: "live",
    inquiryId: v.inquiryId == null ? null : String(v.inquiryId),
    customerLabel: visitCustomerLabel(v.customerName),
    contactPhone: v.customerPhone?.trim() || null,
    address: v.address?.trim() || "주소 없음",
    startAt: toTime(v.startAt) ?? 0,
    endAt: toTime(v.endAt) ?? 0,
    status: v.status,
    workType: visitWorkLabel(v.workCategory),
    completedAt: null,
    version: 0,
    history: [],
  };
}

/** 일정 응답의 날짜별 방문을 한 줄로 모읍니다. 같은 예약이 두 날에 걸쳐도 한 번만 둡니다. */
export function mapSchedule(res: ServerSchedule): Visit[] {
  const seen = new Set<string>();
  const visits: Visit[] = [];
  for (const day of res.days ?? []) {
    for (const v of day.visits ?? []) {
      const visit = mapScheduleVisit(v);
      if (seen.has(visit.id)) continue;
      seen.add(visit.id);
      visits.push(visit);
    }
  }
  return visits.sort((a, b) => a.startAt - b.startAt);
}

/** 방문 작업정보 → 화면 방문 (상세는 버전·완료 시각·출입 안내까지 있습니다) */
export function mapReservationDetail(d: ServerReservationDetail): Visit {
  return {
    ...mapScheduleVisit(d),
    version: d.version,
    completedAt: toTime(d.completedAt),
    addressDetail: d.addressDetail?.trim() || null,
    accessNote: d.accessNote?.trim() || null,
  };
}

/** 메모가 아직 없으면(빈 내용·저장 시각 없음) null */
export function mapWorkNote(n: ServerWorkNote): WorkNote | null {
  const updatedAt = toTime(n.updatedAt);
  if (updatedAt === null) return null;
  // 서버는 처음 쓴 시각을 따로 주지 않아 마지막 저장 시각을 함께 씁니다.
  return { content: n.content ?? "", createdAt: updatedAt, updatedAt };
}

const KST_OFFSET = 9 * 3_600_000;
const DAY_MS = 24 * 3_600_000;

/** 한국 날짜(YYYY-MM-DD) */
export function kstDate(time: number): string {
  return new Date(time + KST_OFFSET).toISOString().slice(0, 10);
}

/** 방문 일정 화면이 불러올 기간: 지난 7일 ~ 앞으로 23일 (서버는 한 번에 31일까지) */
export function visitRange(now: number): { from: string; to: string } {
  return { from: kstDate(now - 7 * DAY_MS), to: kstDate(now + 23 * DAY_MS) };
}
