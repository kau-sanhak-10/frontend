// 운영 업체·계정·웹 접수 링크 관리 (FE-19 · B-01, O-01~O-06)
// 서버 운영 API(BE-17)의 응답을 화면에서 쓰는 모양입니다.

/** 신청 심사 상태 (승인 대기·승인·거절) */
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

/** 업체 운영 상태 (심사 상태와 따로 관리합니다) */
export type OwnerStatus = "READY" | "ACTIVE" | "RESTRICTED" | "WITHDRAWN";

/** 운영자 역할. 로그인 번호 변경은 SUPER만 할 수 있습니다. */
export type AdminRole = "SUPER" | "STAFF";

/** 업체 목록 한 줄 */
export type AdminOwnerItem = {
  id: string;
  businessName: string;
  ownerName: string | null;
  /** 사장님 로그인 번호 (숫자만) */
  phone: string;
  approvalStatus: ApprovalStatus;
  status: OwnerStatus;
  createdAt: number;
  reviewedAt: number | null;
};

/** 업체 상세. 그 업체의 고객·예약·문의 내용은 담지 않습니다. */
export type AdminOwner = AdminOwnerItem & {
  /** 업체 대표 연락처 (로그인 번호와 별개) */
  contactPhone: string | null;
  address: string | null;
  serviceDescription: string | null;
  rejectionReason: string | null;
  reviewer: { id: string; name: string } | null;
  autoBookingEnabled: boolean;
  intakePaused: boolean;
  /** 고객 접수 링크가 살아 있는지 (주소는 발급 API가 돌려줍니다) */
  intakeLinkActive: boolean;
  updatedAt: number;
};

export type AdminOwnerPage = {
  items: AdminOwnerItem[];
  page: number;
  totalElements: number;
  isLast: boolean;
};

export type AdminOwnerFilter = {
  approvalStatus?: ApprovalStatus;
  status?: OwnerStatus;
  q?: string;
  page?: number;
};

/** 업체 신청 등록 입력 */
export type RegisterOwnerInput = {
  businessName: string;
  ownerName: string;
  /** 로그인 번호 (숫자만) */
  phone: string;
  /** 그 번호로 문자 확인을 마친 인증 번호 */
  phoneVerificationId: string;
  contactPhone: string;
  address: string;
  serviceDescription: string;
};

/** 발급한 접수 링크 */
export type IntakeLink = { url: string; businessName: string | null };

/** 문자 인증 요청 결과 */
export type VerificationSent = {
  verificationId: string;
  expiresAt: number;
  resendAvailableAt: number;
};

/**
 * 실패 종류
 * - EXPIRED: 운영자 로그인이 끝남 (401) → 다시 로그인
 * - FORBIDDEN: 운영자가 아님·권한 회수 (403)
 * - ROLE_REQUIRED: 최고 운영자만 할 수 있음
 * - NOT_FOUND: 업체 없음
 * - ALREADY_REVIEWED: 이미 승인·거절한 신청
 * - NOT_APPROVED: 승인 전이라 할 수 없음 (운영 상태 변경·링크 발급)
 * - PHONE_DUPLICATED: 같은 로그인 번호로 등록된 업체가 있음
 * - NOT_VERIFIED: 번호 문자 확인이 없거나 다른 번호의 확인
 * - INVALID: 입력값 오류
 * - CODE_MISMATCH·CODE_EXPIRED·ATTEMPT_LIMIT·SEND_LIMIT·SEND_FAILED: 문자 인증
 * - LOAD_FAILED·SAVE_FAILED: 네트워크·서버 문제
 */
export type AdminErrorCode =
  | "EXPIRED"
  | "FORBIDDEN"
  | "ROLE_REQUIRED"
  | "NOT_FOUND"
  | "ALREADY_REVIEWED"
  | "NOT_APPROVED"
  | "PHONE_DUPLICATED"
  | "NOT_VERIFIED"
  | "INVALID"
  | "CODE_MISMATCH"
  | "CODE_EXPIRED"
  | "ATTEMPT_LIMIT"
  | "SEND_LIMIT"
  | "SEND_FAILED"
  | "LOAD_FAILED"
  | "SAVE_FAILED";

export type AdminResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: AdminErrorCode;
      /** 입력 칸별 오류 (서버가 알려 준 것) */
      fields?: Record<string, string>;
    };
