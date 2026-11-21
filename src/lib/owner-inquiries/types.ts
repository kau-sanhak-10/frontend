// 사장님 홈·접수함·접수 상세(FE-06)에서 화면이 구분해야 하는 값입니다.
// 실제 API(FE-07) 연결 시 백엔드 응답과 이 값을 맞춥니다.

/**
 * 문의 처리 상태 (서버가 정한 값을 그대로 씁니다)
 * - AI_INTAKE: 덕구가 접수 중
 * - OWNER_CHECK: 사장님 확인 필요 (아래 OwnerCheckReason이 있을 때만)
 * - OWNER_HANDLING: 사장님이 직접 응대 중
 * - RESERVED: 방문 예약 확정
 * - COMPLETED: 처리 완료
 */
export type InquiryStatus =
  "AI_INTAKE" | "OWNER_CHECK" | "OWNER_HANDLING" | "RESERVED" | "COMPLETED";

/**
 * 사장님이 실제로 개입해야 하는 이유 (B-10 · 10/26 기준)
 * 참고정보 미확인(예: 모델명을 못 읽음)은 여기에 넣지 않습니다.
 */
export type OwnerCheckReason =
  | "REQUIRED_INFO_MISSING"
  | "SAFETY"
  | "CUSTOMER_REQUEST"
  | "SCHEDULE_CHANGE"
  /** 덕구(AI)가 판단이 불명확하거나 실패해서 사장님에게 넘김 (백엔드 AI_HANDOFF) */
  | "AI_HANDOFF";

/** 요약 항목의 출처 (B-13). NONE은 아직 아무도 알려 주지 않은 항목입니다. */
export type SummarySource = "CUSTOMER" | "PHOTO" | "OWNER" | "MANUAL" | "NONE";

/**
 * 요약 항목의 확인 상태
 * - CONFIRMED: 고객 설명·사진·사장님 확인으로 확인된 값
 * - UNCONFIRMED: 읽지 못했거나 아직 모르는 값 → '미확인' 표시
 * - INTERPRETATION: 매뉴얼을 참고한 해석 → 확인된 사실처럼 보이지 않게 표시
 */
export type SummaryState = "CONFIRMED" | "UNCONFIRMED" | "INTERPRETATION";

export type SummaryEvidence =
  | { type: "MESSAGE"; messageId: string; quote: string }
  | { type: "PHOTO"; photoId: string }
  | { type: "MANUAL"; title: string; location: string };

export type SummaryField = {
  key:
    | "manufacturer"
    | "model"
    | "controllerModel"
    | "boilerType"
    | "errorCode"
    | "symptom"
    | "address"
    | "preferredTime"
    | "expectedCause";
  label: string;
  value: string | null;
  source: SummarySource;
  state: SummaryState;
  /** 필수정보인지. 필수정보가 미확인이면 서버가 OWNER_CHECK로 이관합니다. */
  required: boolean;
  /** 미확인·해석일 때 사장님에게 보여 줄 이유 */
  reason?: string;
  evidence?: SummaryEvidence;
  conflict?: {
    value: string;
    source: "CUSTOMER" | "PHOTO" | "OWNER";
    evidence?: SummaryEvidence;
  }[];
  /** 이전 값 (오래된 것부터). 사장님이 고치면 고치기 전 값이 여기 남습니다. */
  history?: FieldHistoryItem[];
};

/** 항목의 이전 값 한 줄 (B-14 수정 이력) */
export type FieldHistoryItem = {
  value: string | null;
  source: SummarySource;
  changedAt: number;
};

/**
 * 사장님이 고칠 수 있는 항목 (B-14)
 * 백엔드 PATCH /api/v1/owner/inquiries/{id} 의 fieldKey와 맞춥니다.
 */
export type EditableFieldKey =
  "manufacturer" | "model" | "errorCode" | "symptom";

export type FieldChange = { key: EditableFieldKey; value: string };

export type InquiryPhoto = {
  id: string;
  /** 목업은 public/ 아래 예시 이미지 경로를 씁니다. 실제로는 서버가 준 주소입니다. */
  url: string;
  /** 실제 서버 주소는 5분 뒤 만료됩니다. 지나면 주소를 새로 받아야 합니다. (목업은 없음) */
  expiresAt?: number;
  alt: string;
};

export type InquiryMessage = {
  id: string;
  from: "CUSTOMER" | "DUKGU" | "OWNER";
  text?: string;
  photoId?: string;
  sentAt: number;
  /** 서버가 알려 준 전송 상태. FAILED면 보낸 것처럼 보이지 않게 표시합니다. (C-11) */
  delivery?: "PENDING" | "SENT" | "FAILED";
};

/** 지금 누가 고객에게 답하는지 (B-15·B-16) */
export type Handler = "AI" | "OWNER";

/**
 * 고객이 남긴 사람 응대 요청 중 아직 끝나지 않은 것 (C-10·C-18)
 * - DIRECT_CHAT: 사장님과 직접 상담하고 싶어요
 * - CALLBACK: 전화로 연락 주세요 (이름·번호가 함께 옵니다)
 */
export type HandoffRequestInfo = {
  id: string;
  type: "DIRECT_CHAT" | "CALLBACK";
  status: "WAITING" | "IN_PROGRESS";
  name?: string;
  phone?: string;
};

/** 덕구에게 다시 맡길 수 없는 이유 (서버 AI_RESUME_BLOCKED) */
export type ResumeBlocker = "SAFETY" | "REQUIRED_FIELD";

/**
 * 응대 전환·답장·종료 결과. 실패를 성공처럼 보이지 않게 이유를 나눕니다.
 * - FAILED: 네트워크·서버 문제 → 다시 시도
 * - CLOSED: 이미 종료된 문의
 * - NOT_OWNER_MODE: 직접 응대를 시작하지 않아 답장을 보낼 수 없음
 * - RESUME_BLOCKED: 안전·필수정보가 남아 덕구에게 다시 맡길 수 없음 (blockers에 이유)
 * - NOT_FOUND: 없거나 다른 업체 문의
 */
export type HandlingResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code:
        "FAILED" | "CLOSED" | "NOT_OWNER_MODE" | "RESUME_BLOCKED" | "NOT_FOUND";
      blockers?: ResumeBlocker[];
    };

export type Reservation = {
  startAt: number;
  endAt: number;
  address: string;
  /** 고객이 시간 변경을 요청했다면 요청 내용 */
  changeRequest?: { requestedLabel: string };
};

/** 접수함 목록에 쓰는 요약 정보 */
export type InquirySummary = {
  id: string;
  businessId: string;
  customerLabel: string;
  title: string;
  receivedAt: number;
  status: InquiryStatus;
  ownerCheckReason?: OwnerCheckReason;
  /** 목록 카드에 한 줄로 보여 줄 안내 */
  note: string;
  /** 참고정보 중 미확인인 항목 이름 (표시만 하고 확인 필요로 보내지 않음) */
  unconfirmedLabels: string[];
  thumbnailPhotoId?: string;
  reservation?: Reservation;
};

/** 접수 상세 */
export type InquiryDetail = InquirySummary & {
  visitAddress?: string;
  customerDescription: string;
  summary: SummaryField[];
  /** 요약 생성에 실패했으면 null. 대화·사진은 그대로 보여 줍니다. */
  summaryUpdatedAt: number | null;
  photos: InquiryPhoto[];
  messages: InquiryMessage[];
  /** 수정할 때 그대로 돌려보내는 버전. 그 사이 다른 곳에서 바뀌면 저장이 거절됩니다. */
  version: number;
  /**
   * 지금 고객에게 답하는 쪽. 상태(status)와 따로 봅니다.
   * 사장님이 넘겨받아도 '확인 필요' 단계는 그대로일 수 있어요. (서버 takeOver는 단계를 바꾸지 않음)
   */
  handler: Handler;
  /** 문의 종료 여부. 종료돼도 대화 기록과 예약은 남습니다. (B-16) */
  closed: boolean;
  /** 안전 신호가 있으면 덕구에게 다시 맡길 수 없습니다. */
  safetyFlag: boolean;
  /** 아직 끝나지 않은 고객의 사람 응대 요청 */
  activeHandoff?: HandoffRequestInfo;
};

/** 업체 전용 접수 링크 (B-11, QR 제외) */
export type IntakeLink =
  | { status: "READY"; url: string; businessName: string; isExample?: boolean }
  | { status: "NOT_ISSUED" }
  | { status: "ERROR" };

/** 조회 결과. 실패를 0건으로 바꾸지 않도록 성공/실패를 구분합니다. */
export type LoadResult<T> =
  { ok: true; data: T } | { ok: false; code: "LOAD_FAILED" | "NOT_FOUND" };

/**
 * 저장 결과. 실패를 성공처럼 보이지 않게 이유를 구분합니다.
 * - SAVE_FAILED: 네트워크·서버 문제로 저장 못 함 → 다시 시도
 * - CONFLICT: 화면을 연 뒤 다른 곳에서 먼저 바뀜 → 최신 내용 다시 불러오기
 * - INVALID: 빈 값이나 너무 긴 값
 * - NOT_FOUND: 없거나 다른 업체 문의
 */
export type SaveResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "SAVE_FAILED" | "CONFLICT" | "INVALID" | "NOT_FOUND" };
