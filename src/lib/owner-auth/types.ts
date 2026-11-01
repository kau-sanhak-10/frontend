// 사장님 문자 인증 로그인에서 화면이 구분해야 하는 상태 값입니다.
// 실제 API(FE-07) 연결 시 백엔드 응답 코드와 이 값을 맞춥니다.

/** 인증번호 발송·확인 단계의 오류 */
export type AuthErrorCode =
  | "INVALID_PHONE"
  | "SEND_FAILED"
  | "SEND_LIMIT"
  | "CODE_MISMATCH"
  | "CODE_EXPIRED"
  | "ATTEMPT_LIMIT";

/** 업체 업무 화면에 들어갈 수 없는 계정 상태 */
export type AccountBlockStatus =
  | "NOT_REGISTERED"
  | "APPROVAL_PENDING"
  | "APPROVAL_REJECTED"
  | "BUSINESS_UNLINKED"
  | "SUSPENDED";

/** 로그인 화면 상단 안내 */
export type LoginNotice = "SESSION_EXPIRED" | "LOGGED_OUT";

export type OwnerProfile = {
  name: string;
  /** 로그인용 개인 휴대전화번호 (숫자만) */
  loginPhone: string;
  businessName: string;
  /** 업체 대표 연락처. 로그인 번호와 별개입니다. */
  businessPhone: string;
};

export type SendCodeResult =
  | { ok: true; expiresInSec: number; resendAfterSec: number }
  | {
      ok: false;
      result: "BLOCKED";
      status: AccountBlockStatus;
      rejectReason?: string;
    }
  | {
      ok: false;
      code: "INVALID_PHONE" | "SEND_FAILED" | "SEND_LIMIT";
      retryAfterSec?: number;
    };

export type VerifyCodeResult =
  | { result: "SIGNED_IN"; profile: OwnerProfile }
  | { result: "BLOCKED"; status: AccountBlockStatus; rejectReason?: string }
  | {
      result: "ERROR";
      code: "CODE_MISMATCH" | "CODE_EXPIRED" | "ATTEMPT_LIMIT";
      remainingAttempts?: number;
      retryAfterSec?: number;
    };

export type PhoneChangeRequest = {
  newPhone: string;
  businessName: string;
  memo?: string;
};
