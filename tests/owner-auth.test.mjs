import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  formatPhone,
  formatSeconds,
  isValidPhone,
  maskPhone,
  normalizeCode,
  normalizePhone,
} from "../src/lib/owner-auth/phone.ts";
import {
  authErrorMessage,
  blockStatusCopy,
  loginNoticeMessage,
} from "../src/lib/owner-auth/messages.ts";
import {
  CODE_TTL_SEC,
  MAX_ATTEMPTS,
  MAX_SENDS,
  MAX_DAILY_SENDS,
  MOCK_VERIFICATION_CODE,
  RESEND_COOLDOWN_SEC,
  mockConfig,
  requestLoginPhoneChange,
  requestVerificationCode,
  resetMockAuth,
  verifyCode,
} from "../src/lib/owner-auth/mock-api.ts";
import { parseSession, SESSION_TTL_MS } from "../src/lib/owner-auth/session.ts";

let now = 1_000_000;
beforeEach(() => {
  now = 1_000_000;
  mockConfig.delayMs = 0;
  mockConfig.now = () => now;
  resetMockAuth();
});

const ACTIVE = "01011112222";

test("승인한 인증·세션 정책 수치를 사용한다", () => {
  assert.equal(CODE_TTL_SEC, 300);
  assert.equal(RESEND_COOLDOWN_SEC, 60);
  assert.equal(MAX_ATTEMPTS, 5);
  assert.equal(SESSION_TTL_MS, 7 * 24 * 60 * 60 * 1000);
});

test("휴대전화번호를 숫자만 남기고 형식을 검사한다", () => {
  assert.equal(normalizePhone("010-1234-5678 "), "01012345678");
  assert.equal(normalizePhone("0101234567899"), "01012345678");
  assert.equal(isValidPhone("01012345678"), true);
  assert.equal(isValidPhone("0101234567"), true);
  assert.equal(isValidPhone("01212345678"), false);
  assert.equal(isValidPhone("010123"), false);
  assert.equal(formatPhone("0101234"), "010-1234");
  assert.equal(formatPhone("01012345678"), "010-1234-5678");
  assert.equal(maskPhone("01012345678"), "010-••••-5678");
  assert.equal(normalizeCode("12a3 4567"), "123456");
  assert.equal(formatSeconds(179), "2:59");
});

test("등록·승인·연결된 번호는 인증 후 로그인된다", async () => {
  const sent = await requestVerificationCode(ACTIVE);
  assert.deepEqual(sent, {
    ok: true,
    expiresInSec: CODE_TTL_SEC,
    resendAfterSec: RESEND_COOLDOWN_SEC,
  });
  const res = await verifyCode(ACTIVE, MOCK_VERIFICATION_CODE);
  assert.equal(res.result, "SIGNED_IN");
  assert.equal(res.profile.businessName, "한빛 보일러");
});

test("인증번호는 한 번만 쓸 수 있다", async () => {
  await requestVerificationCode(ACTIVE);
  await verifyCode(ACTIVE, MOCK_VERIFICATION_CODE);
  const again = await verifyCode(ACTIVE, MOCK_VERIFICATION_CODE);
  assert.equal(again.result, "ERROR");
  assert.equal(again.code, "CODE_EXPIRED");
});

test("불일치는 남은 횟수를 알려주고 한도를 넘으면 잠근다", async () => {
  await requestVerificationCode(ACTIVE);
  const first = await verifyCode(ACTIVE, "000001");
  assert.equal(first.code, "CODE_MISMATCH");
  assert.equal(first.remainingAttempts, MAX_ATTEMPTS - 1);
  for (let i = 2; i < MAX_ATTEMPTS; i += 1) await verifyCode(ACTIVE, "000001");
  const locked = await verifyCode(ACTIVE, "000001");
  assert.equal(locked.code, "ATTEMPT_LIMIT");
  assert.equal(locked.retryAfterSec, RESEND_COOLDOWN_SEC);
  // 기존 코드는 재사용할 수 없고, 재발송은 마지막 발송에서 60초 후 가능하다
  const stillLocked = await verifyCode(ACTIVE, MOCK_VERIFICATION_CODE);
  assert.equal(stillLocked.code, "ATTEMPT_LIMIT");
  now += RESEND_COOLDOWN_SEC * 1000;
  const resend = await requestVerificationCode(ACTIVE);
  assert.equal(resend.ok, true);
});

test("유효시간이 지난 인증번호는 만료로 처리한다", async () => {
  await requestVerificationCode(ACTIVE);
  now += CODE_TTL_SEC * 1000;
  const res = await verifyCode(ACTIVE, MOCK_VERIFICATION_CODE);
  assert.equal(res.code, "CODE_EXPIRED");
});

test("재발송 대기시간과 발송 횟수를 제한한다", async () => {
  await requestVerificationCode(ACTIVE);
  const tooSoon = await requestVerificationCode(ACTIVE);
  assert.equal(tooSoon.code, "SEND_LIMIT");
  assert.equal(tooSoon.retryAfterSec, RESEND_COOLDOWN_SEC);
  for (let i = 1; i < MAX_SENDS; i += 1) {
    now += RESEND_COOLDOWN_SEC * 1000;
    assert.equal((await requestVerificationCode(ACTIVE)).ok, true);
  }
  now += RESEND_COOLDOWN_SEC * 1000;
  const limited = await requestVerificationCode(ACTIVE);
  assert.equal(limited.code, "SEND_LIMIT");
  assert.equal(limited.retryAfterSec, 3600 - MAX_SENDS * RESEND_COOLDOWN_SEC);
});

test("인증 성공 후에도 번호별 최근 24시간 발송 한도는 유지된다", async () => {
  for (let i = 0; i < MAX_DAILY_SENDS; i += 1) {
    assert.equal((await requestVerificationCode(ACTIVE)).ok, true);
    assert.equal(
      (await verifyCode(ACTIVE, MOCK_VERIFICATION_CODE)).result,
      "SIGNED_IN",
    );
    now += 3_600_000;
  }
  const limited = await requestVerificationCode(ACTIVE);
  assert.equal(limited.ok, false);
  assert.equal(limited.code, "SEND_LIMIT");
  now += 86_400_000;
  assert.equal((await requestVerificationCode(ACTIVE)).ok, true);
});

test("인증 성공 후에도 재발송 60초 간격을 유지한다", async () => {
  await requestVerificationCode(ACTIVE);
  await verifyCode(ACTIVE, MOCK_VERIFICATION_CODE);
  assert.equal((await requestVerificationCode(ACTIVE)).code, "SEND_LIMIT");
  now += RESEND_COOLDOWN_SEC * 1000;
  assert.equal((await requestVerificationCode(ACTIVE)).ok, true);
});

test("발송 실패와 잘못된 번호를 구분한다", async () => {
  assert.equal(
    (await requestVerificationCode("01000000000")).code,
    "SEND_FAILED",
  );
  assert.equal((await requestVerificationCode("123")).code, "INVALID_PHONE");
});

test("승인 대기·거절·미연결·이용 제한·미등록 계정은 로그인하지 않는다", async () => {
  const cases = {
    "01033334444": "APPROVAL_PENDING",
    "01055556666": "APPROVAL_REJECTED",
    "01077778888": "BUSINESS_UNLINKED",
    "01099990000": "SUSPENDED",
    "01012345678": "NOT_REGISTERED",
  };
  for (const [phone, status] of Object.entries(cases)) {
    await requestVerificationCode(phone);
    const res = await verifyCode(phone, MOCK_VERIFICATION_CODE);
    assert.equal(res.result, "BLOCKED", phone);
    assert.equal(res.status, status, phone);
  }
  now += RESEND_COOLDOWN_SEC * 1000;
  await requestVerificationCode("01055556666");
  const rejected = await verifyCode("01055556666", MOCK_VERIFICATION_CODE);
  assert.ok(rejected.rejectReason);
});

test("모든 상태에 안내 문구가 있다", () => {
  for (const code of [
    "INVALID_PHONE",
    "SEND_FAILED",
    "SEND_LIMIT",
    "CODE_MISMATCH",
    "CODE_EXPIRED",
    "ATTEMPT_LIMIT",
  ]) {
    assert.ok(authErrorMessage(code).length > 0, code);
  }
  for (const status of [
    "NOT_REGISTERED",
    "APPROVAL_PENDING",
    "APPROVAL_REJECTED",
    "BUSINESS_UNLINKED",
    "SUSPENDED",
  ]) {
    const copy = blockStatusCopy(status, "사유");
    assert.ok(copy.title && copy.body, status);
  }
  assert.match(
    blockStatusCopy("APPROVAL_REJECTED", "서류 확인").body,
    /서류 확인/,
  );
  assert.ok(loginNoticeMessage("SESSION_EXPIRED"));
  assert.ok(loginNoticeMessage("LOGGED_OUT"));
});

test("저장된 로그인은 만료 시각 전까지만 유효하다", () => {
  const session = {
    name: "김사장",
    loginPhone: ACTIVE,
    businessName: "한빛 보일러",
    businessPhone: "0319001234",
    expiresAt: 2_000,
  };
  const raw = JSON.stringify(session);
  assert.equal(parseSession(raw, 1_000).status, "active");
  assert.equal(parseSession(raw, 2_000).status, "expired");
  assert.equal(parseSession(null, 0).status, "none");
  assert.equal(parseSession("{broken", 0).status, "none");
  assert.equal(
    parseSession(JSON.stringify({ expiresAt: 5 }), 0).status,
    "none",
  );
});

test("로그인 번호 변경 요청은 새 번호 형식을 확인한다", async () => {
  assert.deepEqual(
    await requestLoginPhoneChange({
      newPhone: "01022223333",
      businessName: "한빛",
    }),
    { ok: true },
  );
  assert.equal(
    (await requestLoginPhoneChange({ newPhone: "12", businessName: "한빛" }))
      .ok,
    false,
  );
});
