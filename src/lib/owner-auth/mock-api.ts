// ⚠️ 개발용 가짜 API입니다. 실제 문자 발송·인증·세션 발급은 백엔드가 처리하며,
// FE-07에서 이 파일의 함수를 requestApi() 호출로 교체합니다.
// 함수 이름과 반환 형태를 유지하면 화면 코드는 바꾸지 않아도 됩니다.
//
// 개발용 테스트 번호 (인증번호는 모두 MOCK_VERIFICATION_CODE)
// - 010-1111-2222 : 승인·업체 연결 완료 → 로그인 성공
// - 010-3333-4444 : 업체 승인 대기
// - 010-5555-6666 : 업체 등록 거절
// - 010-7777-8888 : 업체 미연결
// - 010-9999-0000 : 이용 제한
// - 010-0000-0000 : 문자 발송 실패
// - 그 밖의 번호  : 등록되지 않은 계정
import type {
  AccountBlockStatus,
  OwnerProfile,
  PhoneChangeRequest,
  SendCodeResult,
  VerifyCodeResult,
} from "./types";

export const MOCK_VERIFICATION_CODE = "123456";
export const CODE_TTL_SEC = 180;
export const RESEND_COOLDOWN_SEC = 30;
export const MAX_SENDS = 5;
export const MAX_ATTEMPTS = 5;
export const LOCK_SEC = 600;

const SEND_FAIL_PHONE = "01000000000";

type MockAccount =
  | { status: "ACTIVE"; profile: OwnerProfile }
  | { status: AccountBlockStatus; rejectReason?: string };

const accounts: Record<string, MockAccount> = {
  "01011112222": {
    status: "ACTIVE",
    profile: {
      name: "김사장",
      loginPhone: "01011112222",
      businessName: "한빛 보일러",
      businessPhone: "0319001234",
    },
  },
  "01033334444": { status: "APPROVAL_PENDING" },
  "01055556666": {
    status: "APPROVAL_REJECTED",
    rejectReason: "사업자 정보 확인이 필요해요.",
  },
  "01077778888": { status: "BUSINESS_UNLINKED" },
  "01099990000": { status: "SUSPENDED" },
};

type Challenge = {
  expiresAt: number;
  attempts: number;
  sends: number;
  lastSentAt: number;
  lockedUntil: number;
};

const challenges = new Map<string, Challenge>();

export const mockConfig = {
  /** 응답 지연(ms). 로딩 상태 확인용이며 테스트에서는 0으로 둡니다. */
  delayMs: 400,
  now: () => Date.now(),
};

function wait() {
  return new Promise((resolve) => setTimeout(resolve, mockConfig.delayMs));
}

function secondsUntil(time: number) {
  return Math.max(1, Math.ceil((time - mockConfig.now()) / 1000));
}

/** 휴대전화번호로 6자리 인증번호를 보냅니다. phone은 숫자만 받습니다. */
export async function requestVerificationCode(
  phone: string,
): Promise<SendCodeResult> {
  await wait();
  if (!/^01\d{8,9}$/.test(phone)) return { ok: false, code: "INVALID_PHONE" };
  if (phone === SEND_FAIL_PHONE) return { ok: false, code: "SEND_FAILED" };

  const now = mockConfig.now();
  const prev = challenges.get(phone);
  if (prev) {
    if (prev.lockedUntil > now) {
      return {
        ok: false,
        code: "SEND_LIMIT",
        retryAfterSec: secondsUntil(prev.lockedUntil),
      };
    }
    const cooldownEnds = prev.lastSentAt + RESEND_COOLDOWN_SEC * 1000;
    if (cooldownEnds > now) {
      return {
        ok: false,
        code: "SEND_LIMIT",
        retryAfterSec: secondsUntil(cooldownEnds),
      };
    }
    if (prev.sends >= MAX_SENDS) {
      prev.lockedUntil = now + LOCK_SEC * 1000;
      prev.sends = 0;
      return { ok: false, code: "SEND_LIMIT", retryAfterSec: LOCK_SEC };
    }
  }

  challenges.set(phone, {
    expiresAt: now + CODE_TTL_SEC * 1000,
    attempts: 0,
    sends: (prev?.sends ?? 0) + 1,
    lastSentAt: now,
    lockedUntil: 0,
  });
  return {
    ok: true,
    expiresInSec: CODE_TTL_SEC,
    resendAfterSec: RESEND_COOLDOWN_SEC,
  };
}

/** 인증번호를 확인하고 계정 상태에 따라 로그인 결과를 돌려줍니다. */
export async function verifyCode(
  phone: string,
  code: string,
): Promise<VerifyCodeResult> {
  await wait();
  const now = mockConfig.now();
  const challenge = challenges.get(phone);
  if (!challenge) return { result: "ERROR", code: "CODE_EXPIRED" };
  // 잠금을 먼저 확인해야 잠긴 동안 "만료"로 잘못 안내하지 않습니다.
  if (challenge.lockedUntil > now) {
    return {
      result: "ERROR",
      code: "ATTEMPT_LIMIT",
      retryAfterSec: secondsUntil(challenge.lockedUntil),
    };
  }
  if (challenge.expiresAt <= now) {
    return { result: "ERROR", code: "CODE_EXPIRED" };
  }
  if (code !== MOCK_VERIFICATION_CODE) {
    challenge.attempts += 1;
    if (challenge.attempts >= MAX_ATTEMPTS) {
      challenge.lockedUntil = now + LOCK_SEC * 1000;
      challenge.expiresAt = 0;
      return {
        result: "ERROR",
        code: "ATTEMPT_LIMIT",
        retryAfterSec: LOCK_SEC,
      };
    }
    return {
      result: "ERROR",
      code: "CODE_MISMATCH",
      remainingAttempts: MAX_ATTEMPTS - challenge.attempts,
    };
  }

  // 인증번호는 한 번만 사용할 수 있습니다.
  challenges.delete(phone);
  const account = accounts[phone];
  if (!account) return { result: "BLOCKED", status: "NOT_REGISTERED" };
  if (account.status !== "ACTIVE") {
    return {
      result: "BLOCKED",
      status: account.status,
      rejectReason: account.rejectReason,
    };
  }
  return { result: "SIGNED_IN", profile: { ...account.profile } };
}

/** 로그인 번호 변경·분실 지원 요청을 운영팀에 접수합니다. */
export async function requestLoginPhoneChange(
  request: PhoneChangeRequest,
): Promise<{ ok: true } | { ok: false; code: "INVALID_PHONE" }> {
  await wait();
  if (!/^01\d{8,9}$/.test(request.newPhone)) {
    return { ok: false, code: "INVALID_PHONE" };
  }
  return { ok: true };
}

/** 테스트용: 가짜 API 상태를 초기화합니다. */
export function resetMockAuth() {
  challenges.clear();
}
