// 방문 작업·메모·완료·알림 화면 규칙 (FE-13). 화면은 이 규칙만 보고 표시합니다.
import type {
  NotificationEvent,
  NotificationKind,
  NotificationPrefs,
  OwnerNotification,
  Visit,
  VisitStatus,
} from "./types";

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  REQUESTED: "확정 대기",
  CONFIRMED: "예약 확정",
  COMPLETED: "작업 완료",
  CANCELED: "예약 취소",
};

/** 메모 최대 글자 수 */
export const MAX_NOTE_LENGTH = 2000;
/** 완료 정정 사유 최대 글자 수 (reservation_history.reason) */
export const MAX_REASON_LENGTH = 255;

const DAY = 86_400_000;

function startOfDay(time: number) {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type VisitGroups = {
  today: Visit[];
  upcoming: Visit[];
  /** 지난 방문과 완료·취소 (최근 것부터) */
  past: Visit[];
};

/**
 * 방문 목록 나누기 (B-23 ①)
 * - 오늘: 오늘 날짜의 방문을 시간 순으로 (완료·취소도 오늘이면 여기서 보여 줌)
 * - 예정: 내일 이후 확정·대기 예약
 * - 지난 방문: 그 밖의 것
 */
export function groupVisits(visits: Visit[], now: number): VisitGroups {
  const today0 = startOfDay(now);
  const tomorrow0 = today0 + DAY;
  const byTime = [...visits].sort((a, b) => a.startAt - b.startAt);
  return {
    today: byTime.filter((v) => v.startAt >= today0 && v.startAt < tomorrow0),
    upcoming: byTime.filter(
      (v) =>
        v.startAt >= tomorrow0 &&
        (v.status === "CONFIRMED" || v.status === "REQUESTED"),
    ),
    past: byTime
      .filter(
        (v) =>
          v.startAt < today0 ||
          (v.startAt >= tomorrow0 &&
            (v.status === "COMPLETED" || v.status === "CANCELED")),
      )
      .reverse(),
  };
}

/** 오늘 아직 남은 방문 수 (확정 예약 중 끝나지 않은 것) */
export function remainingToday(today: Visit[], now: number): number {
  return today.filter((v) => v.status === "CONFIRMED" && v.endAt > now).length;
}

export type VisitActions = {
  canComplete: boolean;
  canCorrect: boolean;
  /** 완료할 수 없는 이유 (화면 안내용) */
  blockedReason?: string;
};

/** 완료·정정 가능 여부 (B-25) */
export function visitActionsOf(visit: Visit): VisitActions {
  switch (visit.status) {
    case "CONFIRMED":
      return { canComplete: true, canCorrect: false };
    case "COMPLETED":
      return { canComplete: false, canCorrect: true };
    case "CANCELED":
      return {
        canComplete: false,
        canCorrect: false,
        blockedReason: "취소된 예약은 완료로 바꿀 수 없어요.",
      };
    case "REQUESTED":
      return {
        canComplete: false,
        canCorrect: false,
        blockedReason: "아직 확정되지 않은 예약이라 완료할 수 없어요.",
      };
  }
}

/** 메모 입력 확인. 문제가 없으면 null */
export function noteError(content: string): string | null {
  if (!content.trim()) return "메모 내용을 입력해 주세요.";
  if (content.length > MAX_NOTE_LENGTH) {
    return `${MAX_NOTE_LENGTH}자까지 쓸 수 있어요.`;
  }
  return null;
}

/** 완료 정정 사유 확인 (사유 필수). 문제가 없으면 null */
export function reasonError(reason: string): string | null {
  if (!reason.trim()) return "정정 사유를 입력해 주세요.";
  if (reason.length > MAX_REASON_LENGTH) {
    return `${MAX_REASON_LENGTH}자까지 쓸 수 있어요.`;
  }
  return null;
}

// ── 알림 (B-26·B-27) ─────────────────────────────

export const NOTIFICATION_LABEL: Record<NotificationEvent, string> = {
  NEW_RESERVATION: "신규 예약",
  NEEDS_CHECK: "확인 필요",
  CHANGE: "예약 변경",
  CANCEL: "예약 취소",
};

/** 알림 목록 배지 (서버의 처리 결과 등 묶이지 않는 알림은 '알림') */
export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  ...NOTIFICATION_LABEL,
  OTHER: "알림",
};

/** 끄면 업무를 놓칠 수 있는 알림 (B-27 ③) */
export const IMPORTANT_EVENTS: NotificationEvent[] = [
  "NEW_RESERVATION",
  "NEEDS_CHECK",
];

export const DEFAULT_PREFS: NotificationPrefs = {
  NEW_RESERVATION: true,
  NEEDS_CHECK: true,
  CHANGE: true,
  CANCEL: true,
};

/** 알림을 누르면 갈 상세 화면 (B-26 ②) */
export function notificationHref(n: OwnerNotification): string {
  return n.refType === "RESERVATION"
    ? `/owner/visits/${encodeURIComponent(n.refId)}`
    : `/owner/inquiries/${encodeURIComponent(n.refId)}`;
}

/** 안전 확인 요청과 일반 알림을 나눕니다. 각각 최신 것부터 (B-26 ③) */
export function splitNotifications(list: OwnerNotification[]): {
  safety: OwnerNotification[];
  general: OwnerNotification[];
} {
  const recent = [...list].sort((a, b) => b.createdAt - a.createdAt);
  return {
    safety: recent.filter((n) => n.safety),
    general: recent.filter((n) => !n.safety),
  };
}

export function unreadCount(list: OwnerNotification[]): number {
  return list.filter((n) => n.readAt === null).length;
}

/** 중요 알림을 끈 경우 보여 줄 경고. 없으면 null */
export function prefsWarning(prefs: NotificationPrefs): string | null {
  const off = IMPORTANT_EVENTS.filter((e) => !prefs[e]);
  if (!off.length) return null;
  return `${off.map((e) => NOTIFICATION_LABEL[e]).join("·")} 알림을 끄면 업무를 놓칠 수 있어요. 앱의 확인 필요 목록은 그대로 보여요.`;
}
