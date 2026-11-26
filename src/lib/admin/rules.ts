// 운영 화면 규칙·문구 (FE-19)
import type {
  AdminErrorCode,
  AdminOwner,
  ApprovalStatus,
  OwnerStatus,
  RegisterOwnerInput,
} from "./types";

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인",
  REJECTED: "거절",
};

export const OWNER_STATUS_LABEL: Record<OwnerStatus, string> = {
  READY: "준비 중",
  ACTIVE: "운영 중",
  RESTRICTED: "이용 제한",
  WITHDRAWN: "탈퇴",
};

/** 운영자가 고를 수 있는 운영 상태 (탈퇴는 사장님 탈퇴 요청으로만) */
export const CHANGEABLE_STATUSES: OwnerStatus[] = [
  "READY",
  "ACTIVE",
  "RESTRICTED",
];

export const STATUS_HINT: Record<OwnerStatus, string> = {
  READY:
    "영업·예약 기준을 설정하는 중이에요. 사장님은 로그인해 설정할 수 있어요.",
  ACTIVE: "고객 접수와 업무를 쓰고 있어요.",
  RESTRICTED:
    "사장님 로그인이 막혀요. 이미 잡힌 예약과 고객 조회는 지워지지 않아요.",
  WITHDRAWN: "사장님이 탈퇴했어요. 기존 문의·예약은 보존돼요.",
};

export const MAX_REASON_LENGTH = 255;

/** 거절 사유 검사. 문제가 없으면 null */
export function rejectReasonError(reason: string): string | null {
  const v = reason.trim();
  if (!v)
    return "거절 사유를 입력해 주세요. 사장님이 로그인할 때 이 사유를 봐요.";
  if (v.length > MAX_REASON_LENGTH)
    return `${MAX_REASON_LENGTH}자까지 쓸 수 있어요.`;
  return null;
}

/** 업체 등록 입력 검사. 칸별 오류를 돌려줍니다. (비어 있으면 통과) */
export function registerErrors(
  input: Omit<RegisterOwnerInput, "phoneVerificationId">,
): Partial<Record<keyof RegisterOwnerInput, string>> {
  const errors: Partial<Record<keyof RegisterOwnerInput, string>> = {};
  const name = input.businessName.trim();
  if (!name) errors.businessName = "업체명을 입력해 주세요.";
  else if (name.length > 100) errors.businessName = "100자까지 쓸 수 있어요.";
  if (input.ownerName.trim().length > 50)
    errors.ownerName = "50자까지 쓸 수 있어요.";
  if (!/^01[016789]\d{7,8}$/.test(input.phone))
    errors.phone = "사장님 휴대전화번호를 확인해 주세요.";
  const contact = input.contactPhone.replace(/\D/g, "");
  if (input.contactPhone.trim() && !/^0\d{8,10}$/.test(contact))
    errors.contactPhone = "대표 연락처 형식을 확인해 주세요.";
  if (input.address.trim().length > 255)
    errors.address = "255자까지 쓸 수 있어요.";
  if (input.serviceDescription.trim().length > 255)
    errors.serviceDescription = "255자까지 쓸 수 있어요.";
  return errors;
}

/** 업체 상세에서 할 수 있는 일 */
export function ownerActionsOf(owner: AdminOwner) {
  const approved = owner.approvalStatus === "APPROVED";
  const withdrawn = owner.status === "WITHDRAWN";
  return {
    canReview: owner.approvalStatus === "PENDING",
    canChangeStatus: approved && !withdrawn,
    canIssueLink: approved && !withdrawn,
    canChangePhone: !withdrawn,
  };
}

/** 실패 안내 문구 */
export const ADMIN_ERROR_MESSAGE: Record<AdminErrorCode, string> = {
  EXPIRED: "운영자 로그인이 끝났어요. 다시 로그인해 주세요.",
  FORBIDDEN: "운영 권한이 없는 계정이에요.",
  ROLE_REQUIRED: "최고 운영자만 할 수 있는 작업이에요.",
  NOT_FOUND: "업체를 찾을 수 없어요.",
  ALREADY_REVIEWED:
    "이미 심사를 마친 신청이에요. 화면을 새로고침해 최신 상태를 확인해 주세요.",
  NOT_APPROVED: "승인된 업체에만 할 수 있어요.",
  PHONE_DUPLICATED:
    "같은 로그인 번호로 등록된 업체가 있어요. 업체를 합치지 말고 기존 업체를 확인해 주세요.",
  NOT_VERIFIED: "번호 문자 확인을 다시 해 주세요.",
  INVALID: "입력한 내용을 확인해 주세요.",
  CODE_MISMATCH: "인증번호가 맞지 않아요.",
  CODE_EXPIRED: "인증 시간이 지났어요. 인증번호를 다시 받아 주세요.",
  ATTEMPT_LIMIT: "입력 횟수를 넘었어요. 인증번호를 다시 받아 주세요.",
  SEND_LIMIT: "인증번호 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  SEND_FAILED: "인증번호 문자를 보내지 못했어요. 다시 시도해 주세요.",
  LOAD_FAILED: "불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
  SAVE_FAILED: "처리하지 못했어요. 바뀐 것은 없어요. 다시 시도해 주세요.",
};

/** 표시용 날짜·시각 (한국 시간) */
const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateOnly = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
export const formatDateTime = (t: number) => dateTime.format(t);
export const formatDate = (t: number) => dateOnly.format(t);
