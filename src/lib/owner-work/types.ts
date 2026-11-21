// 사장님 방문 작업·메모·완료·알림 (FE-13 · B-23~B-27)
// 백엔드 테이블(reservation, reservation_history, work_note, notification) 구조에 맞춥니다.
// 사장님용 API가 아직 없어서 지금은 목업(mock-api.ts)으로 동작합니다.

/** 예약 상태 (reservation.status) */
export type VisitStatus = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELED";

/** 예약 상태 변경 이력 한 줄 (reservation_history) */
export type VisitHistoryItem = {
  from: VisitStatus | null;
  to: VisitStatus;
  by: "CUSTOMER" | "OWNER" | "SYSTEM";
  /** 완료 정정·업체 사유 취소 때 남기는 사유 */
  reason?: string;
  at: number;
};

/** 방문 작업 한 건 (B-23) */
export type Visit = {
  id: string;
  businessId: string;
  /** 사장님이 직접 등록한 예약이면 null */
  inquiryId: string | null;
  customerLabel: string;
  /** 방문할 때 연락할 번호. 고객 접수 때 받은 번호입니다. */
  contactPhone: string | null;
  address: string;
  startAt: number;
  endAt: number;
  status: VisitStatus;
  workType: string;
  completedAt: number | null;
  /** 동시 처리 방지용 버전 (reservation.version) */
  version: number;
  history: VisitHistoryItem[];
};

/**
 * 사장님 전용 작업 메모 (B-24 · work_note)
 * 고객 화면·알림·접수 요약에 절대 노출하지 않습니다.
 */
export type WorkNote = {
  content: string;
  createdAt: number;
  updatedAt: number;
};

/** 알림 종류 (notification.event_type 중 사장님이 받는 것) */
export type NotificationEvent =
  "NEW_RESERVATION" | "NEEDS_CHECK" | "CHANGE" | "CANCEL";

/** 사장님 알림 한 건 (B-26 · notification, recipient = OWNER) */
export type OwnerNotification = {
  id: string;
  businessId: string;
  event: NotificationEvent;
  /** 안전 관련 확인 요청이면 일반 알림과 따로 보여 줍니다. */
  safety: boolean;
  refType: "INQUIRY" | "RESERVATION";
  refId: string;
  title: string;
  body: string;
  createdAt: number;
  /** 읽은 시각. 읽음은 업무 처리 완료가 아닙니다. */
  readAt: number | null;
};

/** 알림 종류별 외부 수신 여부 (B-27) */
export type NotificationPrefs = Record<NotificationEvent, boolean>;

/** 조회 결과. 실패를 0건처럼 보이지 않게 구분합니다. */
export type WorkLoadResult<T> =
  { ok: true; data: T } | { ok: false; code: "LOAD_FAILED" | "NOT_FOUND" };

/**
 * 저장·처리 결과
 * - SAVE_FAILED: 네트워크·서버 문제 → 입력을 그대로 두고 다시 시도
 * - CONFLICT: 화면을 연 뒤 다른 곳에서 먼저 바뀜 → 최신 내용 다시 불러오기
 * - NOT_ALLOWED: 지금 상태에서는 할 수 없음 (예: 취소된 예약 완료)
 * - INVALID: 빈 값·너무 긴 값·사유 없음
 * - NOT_FOUND: 없거나 다른 업체 것
 */
export type WorkSaveResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code:
        "SAVE_FAILED" | "CONFLICT" | "NOT_ALLOWED" | "INVALID" | "NOT_FOUND";
    };
