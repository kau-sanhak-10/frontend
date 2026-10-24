// 상태별 안내 문구. 문구 기준은 피그마 "예외 상태와 화면 설계 기준"(S09~S12, A05~A08)을 따릅니다.
import type { AccountBlockStatus, AuthErrorCode, LoginNotice } from "./types";

function minutesText(sec?: number): string {
  if (!sec || sec <= 0) return "잠시";
  const min = Math.ceil(sec / 60);
  return min <= 1 ? "1분" : `${min}분`;
}

/** 입력칸 아래에 보여줄 인증 오류 문구 */
export function authErrorMessage(
  code: AuthErrorCode,
  detail: { remainingAttempts?: number; retryAfterSec?: number } = {},
): string {
  switch (code) {
    case "INVALID_PHONE":
      return "휴대전화번호를 정확히 입력해 주세요.";
    case "SEND_FAILED":
      return "인증번호를 보내지 못했어요. 번호를 확인한 뒤 다시 받아 주세요.";
    case "SEND_LIMIT":
      return `인증번호를 너무 자주 요청했어요. ${minutesText(detail.retryAfterSec)} 후에 다시 받아 주세요.`;
    case "CODE_MISMATCH":
      return detail.remainingAttempts !== undefined
        ? `인증번호가 일치하지 않아요. 남은 시도 ${detail.remainingAttempts}회`
        : "인증번호가 일치하지 않아요.";
    case "CODE_EXPIRED":
      return "인증번호 유효시간이 지났어요. 새 인증번호를 받아 주세요.";
    case "ATTEMPT_LIMIT":
      return `입력 횟수를 넘었어요. ${minutesText(detail.retryAfterSec)} 후에 새 인증번호를 받아 주세요.`;
  }
}

export type PanelCopy = { title: string; body: string };

/** 인증 후 업체 화면에 들어갈 수 없을 때 보여줄 안내 */
export function blockStatusCopy(
  status: AccountBlockStatus,
  rejectReason?: string,
): PanelCopy {
  switch (status) {
    case "NOT_REGISTERED":
      return {
        title: "등록된 사장님 계정이 아니에요.",
        body: "일로는 운영팀이 업체를 등록한 뒤 이용할 수 있어요. 별도 회원가입 없이 운영팀에 업체 등록을 요청해 주세요.",
      };
    case "APPROVAL_PENDING":
      return {
        title: "업체 승인을 기다리고 있어요.",
        body: "운영팀이 업체 정보를 확인하고 있어요. 승인이 끝나면 이 번호로 다시 로그인해 주세요.",
      };
    case "APPROVAL_REJECTED":
      return {
        title: "업체 등록이 승인되지 않았어요.",
        body: `${rejectReason ? `사유: ${rejectReason}\n` : ""}자세한 내용은 운영팀에 문의해 주세요.`,
      };
    case "BUSINESS_UNLINKED":
      return {
        title: "연결된 업체가 없어요.",
        body: "인증은 완료됐지만 이 계정에 연결된 업체가 없어요. 운영팀이 업체를 연결하면 이용할 수 있어요.",
      };
    case "SUSPENDED":
      return {
        title: "이용이 제한된 계정이에요.",
        body: "지금은 접수·예약 정보를 볼 수 없어요. 운영팀에 문의해 주세요.",
      };
  }
}

/** 로그인 화면 상단 안내 */
export function loginNoticeMessage(notice: LoginNotice): string {
  switch (notice) {
    case "SESSION_EXPIRED":
      return "로그인이 만료됐어요. 다시 인증해 주세요.";
    case "LOGGED_OUT":
      return "로그아웃했어요.";
  }
}
