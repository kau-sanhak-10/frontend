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
  "REQUIRED_INFO_MISSING" | "SAFETY" | "CUSTOMER_REQUEST" | "SCHEDULE_CHANGE";

/** 요약 항목의 출처 (B-13) */
export type SummarySource = "CUSTOMER" | "PHOTO" | "OWNER" | "MANUAL";

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
};

export type InquiryPhoto = {
  id: string;
  /** 목업은 public/ 아래 예시 이미지 경로를 씁니다. 실제로는 서버가 준 주소입니다. */
  url: string;
  alt: string;
};

export type InquiryMessage = {
  id: string;
  from: "CUSTOMER" | "DUKGU" | "OWNER";
  text?: string;
  photoId?: string;
  sentAt: number;
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
  customerDescription: string;
  summary: SummaryField[];
  /** 요약 생성에 실패했으면 null. 대화·사진은 그대로 보여 줍니다. */
  summaryUpdatedAt: number | null;
  photos: InquiryPhoto[];
  messages: InquiryMessage[];
};

/** 업체 전용 접수 링크 (B-11, QR 제외) */
export type IntakeLink =
  | { status: "READY"; url: string; businessName: string }
  | { status: "NOT_ISSUED" }
  | { status: "ERROR" };

/** 조회 결과. 실패를 0건으로 바꾸지 않도록 성공/실패를 구분합니다. */
export type LoadResult<T> =
  { ok: true; data: T } | { ok: false; code: "LOAD_FAILED" | "NOT_FOUND" };
