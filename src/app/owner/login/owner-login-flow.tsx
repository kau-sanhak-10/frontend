"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StatusPanel } from "../_components/status-panel";
import styles from "../_components/owner-auth.module.css";
import {
  authErrorMessage,
  blockStatusCopy,
  loginNoticeMessage,
} from "@/lib/owner-auth/messages";
import { requestVerificationCode, verifyCode } from "@/lib/owner-auth/mock-api";
import { ApiError } from "@/lib/api";
import {
  confirmOwnerVerification,
  requestOwnerVerification,
} from "@/lib/owner-auth/api";
import {
  formatPhone,
  formatSeconds,
  isValidPhone,
  normalizeCode,
  normalizePhone,
} from "@/lib/owner-auth/phone";
import { saveLiveSession, saveSession } from "@/lib/owner-auth/session";
import type { AccountBlockStatus, LoginNotice } from "@/lib/owner-auth/types";
import { useOwnerSession } from "@/lib/owner-auth/use-owner-session";

const HOME_PATH = "/owner";

type Blocked = { status: AccountBlockStatus; rejectReason?: string };

const blockedCodes: Record<string, AccountBlockStatus> = {
  OWNER_NOT_REGISTERED: "NOT_REGISTERED",
  OWNER_APPROVAL_PENDING: "APPROVAL_PENDING",
  OWNER_REJECTED: "APPROVAL_REJECTED",
  OWNER_RESTRICTED: "SUSPENDED",
  OWNER_WITHDRAWN: "SUSPENDED",
};

export function OwnerLoginFlow({
  notice,
  preview,
}: {
  notice?: LoginNotice;
  preview: boolean;
}) {
  const router = useRouter();
  const session = useOwnerSession();

  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [clock, setClock] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const expiresIn = Math.max(0, Math.ceil((expiresAt - clock) / 1000));
  const cooldown = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  // 요청마다 번호표를 붙여, 응답이 오기 전에 번호 변경·재발송·초기화가 있었으면
  // 늦게 온 응답(성공·오류 모두)은 화면에 적용하지 않습니다.
  const requestId = useRef(0);
  const verificationId = useRef<number | null>(null);
  const busy = sending || verifying;
  const signedIn =
    session.status === "active" &&
    Boolean(session.session.accessToken) !== preview;

  // 유효한 로그인이 있으면 다시 인증하지 않고 홈으로 보냅니다.
  useEffect(() => {
    if (signedIn) router.replace(HOME_PATH);
  }, [signedIn, router]);

  // 인증번호 유효시간·재발송 대기시간 카운트다운
  const ticking = expiresIn > 0 || cooldown > 0;
  useEffect(() => {
    if (!ticking) return;
    const update = () => setClock(Date.now());
    const id = window.setInterval(update, 1000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", update);
    };
  }, [ticking]);

  const codeSent = sentTo !== null;
  const codeExpired = codeSent && !locked && expiresIn === 0;
  const topNotice: LoginNotice | undefined =
    session.status === "expired" ? "SESSION_EXPIRED" : notice;

  function handlePhoneChange(value: string) {
    if (busy) return;
    const digits = normalizePhone(value);
    if (digits !== phone) requestId.current += 1;
    setPhone(digits);
    setPhoneError(null);
    // 번호를 바꾸면 이전 인증은 다시 쓰지 않습니다.
    if (sentTo !== null && digits !== sentTo) {
      setSentTo(null);
      setCode("");
      setCodeError(null);
      setLocked(false);
      verificationId.current = null;
      setExpiresAt(0);
      // 재발송 제한은 번호별로 서버가 판단하므로 새 번호는 바로 요청할 수 있습니다.
      setResendAt(0);
    }
  }

  function updateRetryTime(seconds: number) {
    const now = Date.now();
    setClock(now);
    setResendAt(now + seconds * 1000);
  }

  function handleLiveError(error: unknown, stage: "send" | "verify") {
    const code = error instanceof ApiError ? error.code : "";
    const details =
      error instanceof ApiError &&
      error.result &&
      typeof error.result === "object"
        ? (error.result as Record<string, unknown>)
        : {};
    if (Object.hasOwn(blockedCodes, code)) {
      setBlocked({
        status: blockedCodes[code],
        rejectReason:
          typeof details.rejectionReason === "string"
            ? details.rejectionReason
            : undefined,
      });
      return;
    }
    const retry =
      typeof details.retryAfterSeconds === "number" &&
      Number.isFinite(details.retryAfterSeconds) &&
      details.retryAfterSeconds > 0
        ? details.retryAfterSeconds
        : undefined;
    if (retry) updateRetryTime(retry);
    if (stage === "send") {
      setPhoneError(
        authErrorMessage(
          code === "VERIFICATION_RESEND_TOO_SOON" ||
            code === "VERIFICATION_SEND_LIMITED" ||
            code === "TOO_MANY_REQUESTS"
            ? "SEND_LIMIT"
            : "SEND_FAILED",
          { retryAfterSec: retry },
        ),
      );
      return;
    }
    if (code === "VERIFICATION_CODE_MISMATCH") {
      setCodeError(
        authErrorMessage("CODE_MISMATCH", {
          remainingAttempts:
            typeof details.attemptsLeft === "number"
              ? details.attemptsLeft
              : undefined,
        }),
      );
    } else if (code === "VERIFICATION_ATTEMPTS_EXCEEDED") {
      setLocked(true);
      setExpiresAt(0);
      setCodeError(authErrorMessage("ATTEMPT_LIMIT", { retryAfterSec: retry }));
    } else if (
      [
        "VERIFICATION_EXPIRED",
        "VERIFICATION_ALREADY_USED",
        "VERIFICATION_NOT_FOUND",
      ].includes(code)
    ) {
      setExpiresAt(0);
      setCodeError(authErrorMessage("CODE_EXPIRED"));
    } else {
      setCodeError("로그인하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.");
    }
  }

  async function handleSend() {
    if (!isValidPhone(phone)) {
      setPhoneError(authErrorMessage("INVALID_PHONE"));
      return;
    }
    if (busy) return;
    const requested = phone;
    const id = ++requestId.current;
    setSending(true);
    setPhoneError(null);
    try {
      if (!preview) {
        const result = await requestOwnerVerification(requested);
        if (id !== requestId.current) return;
        verificationId.current = result.verificationId;
        setSentTo(requested);
        setCode("");
        setCodeError(null);
        setLocked(false);
        setClock(Date.now());
        setExpiresAt(Date.parse(result.expiresAt));
        setResendAt(Date.parse(result.resendAvailableAt));
        return;
      }
      const res = await requestVerificationCode(requested);
      if (id !== requestId.current) return;
      if (res.ok) {
        setSentTo(requested);
        setCode("");
        setCodeError(null);
        setLocked(false);
        const now = Date.now();
        setClock(now);
        setExpiresAt(now + res.expiresInSec * 1000);
        setResendAt(now + res.resendAfterSec * 1000);
      } else if ("status" in res) {
        setBlocked({ status: res.status, rejectReason: res.rejectReason });
      } else {
        setPhoneError(
          authErrorMessage(res.code, { retryAfterSec: res.retryAfterSec }),
        );
        if (res.code === "SEND_LIMIT" && res.retryAfterSec) {
          updateRetryTime(res.retryAfterSec);
        }
      }
    } catch (error) {
      if (id === requestId.current) {
        if (preview) setPhoneError(authErrorMessage("SEND_FAILED"));
        else handleLiveError(error, "send");
      }
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sentTo || code.length !== 6 || codeExpired || locked || busy) return;
    const id = requestId.current;
    setVerifying(true);
    setCodeError(null);
    try {
      if (!preview) {
        if (verificationId.current === null) return;
        const result = await confirmOwnerVerification(
          verificationId.current,
          code,
        );
        if (id !== requestId.current) return;
        saveLiveSession({
          accessToken: result.accessToken,
          expiresAt: Date.parse(result.expiresAt),
          businessName: result.owner.businessName,
          loginPhone: sentTo,
          name: "",
          businessPhone: "",
        });
        router.replace(HOME_PATH);
        return;
      }
      const res = await verifyCode(sentTo, code);
      if (id !== requestId.current) return;
      if (res.result === "SIGNED_IN") {
        saveSession(res.profile);
        router.replace(HOME_PATH);
        return;
      }
      if (res.result === "BLOCKED") {
        setBlocked({ status: res.status, rejectReason: res.rejectReason });
        return;
      }
      setCodeError(
        authErrorMessage(res.code, {
          remainingAttempts: res.remainingAttempts,
          retryAfterSec: res.retryAfterSec,
        }),
      );
      if (res.code === "ATTEMPT_LIMIT") {
        setLocked(true);
        setExpiresAt(0);
        if (res.retryAfterSec) updateRetryTime(res.retryAfterSec);
      }
      if (res.code === "CODE_EXPIRED") setExpiresAt(0);
    } catch (error) {
      if (id === requestId.current) {
        if (preview) setCodeError("연결을 확인한 뒤 다시 시도해 주세요.");
        else handleLiveError(error, "verify");
      }
    } finally {
      setVerifying(false);
    }
  }

  function resetToStart() {
    requestId.current += 1;
    setBlocked(null);
    setPhone("");
    setSentTo(null);
    setCode("");
    setCodeError(null);
    setPhoneError(null);
    setLocked(false);
    verificationId.current = null;
    setExpiresAt(0);
    setResendAt(0);
  }

  if (session.status === "loading" || signedIn) {
    return (
      <main className={styles.page}>
        <p className={styles.hint} aria-live="polite">
          로그인 상태를 확인하고 있어요…
        </p>
      </main>
    );
  }

  if (blocked) {
    const copy = blockStatusCopy(blocked.status, blocked.rejectReason);
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.brand}>일로 · 사장님</p>
        </header>
        <StatusPanel
          title={copy.title}
          body={copy.body}
          tone={
            blocked.status === "APPROVAL_REJECTED" ||
            blocked.status === "SUSPENDED"
              ? "error"
              : "info"
          }
        />
        <p className={styles.info}>
          업체 등록·연결·이용 상태는 운영팀이 확인해요. 고객·예약 정보는 승인과
          업체 연결이 끝난 뒤에 볼 수 있어요.
        </p>
        <div className={styles.footer}>
          <button
            type="button"
            className={`${styles.button} ${styles.secondary} ${styles.full}`}
            onClick={resetToStart}
          >
            다른 번호로 로그인
          </button>
        </div>
      </main>
    );
  }

  const phoneErrorId = "owner-phone-error";
  const codeHelpId = "owner-code-help";

  return (
    <main className={styles.page}>
      <header>
        {preview && (
          <p className={styles.previewNotice}>
            화면 확인용 · 문자는 발송하지 않아요.
          </p>
        )}
        <p className={styles.brand}>일로 · 현장비서 덕구</p>
        <h1 className={styles.title}>사장님 로그인</h1>
        <p className={styles.description}>
          등록된 휴대전화번호로 문자 인증을 하면 바로 시작할 수 있어요.
        </p>
      </header>

      {topNotice && (
        <p className={styles.notice} role="status">
          {loginNoticeMessage(topNotice)}
        </p>
      )}

      <form className={styles.form} onSubmit={handleVerify} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="owner-phone">
            휴대전화번호
          </label>
          <div className={styles.row}>
            <div className={styles.inputWrap}>
              <input
                id="owner-phone"
                className={styles.input}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="010-0000-0000"
                value={formatPhone(phone)}
                onChange={(e) => handlePhoneChange(e.target.value)}
                disabled={busy}
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneError ? phoneErrorId : undefined}
              />
            </div>
            <button
              type="button"
              className={`${styles.button} ${styles.secondary} ${styles.small}`}
              onClick={handleSend}
              disabled={busy || cooldown > 0 || phone.length < 10}
            >
              {sending
                ? "보내는 중…"
                : cooldown > 0
                  ? `다시 받기 ${formatSeconds(cooldown)}`
                  : codeSent
                    ? "다시 받기"
                    : "인증번호 받기"}
            </button>
          </div>
          {phoneError && (
            <p id={phoneErrorId} className={styles.error} role="alert">
              {phoneError}
            </p>
          )}
        </div>

        {codeSent && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="owner-code">
              문자 인증번호
            </label>
            <div className={styles.inputWrap}>
              <input
                id="owner-code"
                className={styles.input}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6자리 입력"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(normalizeCode(e.target.value));
                  setCodeError(null);
                }}
                disabled={locked || codeExpired || verifying}
                aria-invalid={codeError || codeExpired ? true : undefined}
                aria-describedby={codeHelpId}
              />
              {expiresIn > 0 && (
                <span className={styles.timer} aria-hidden="true">
                  {formatSeconds(expiresIn)}
                </span>
              )}
            </div>
            <div id={codeHelpId} aria-live="polite">
              {codeError ? (
                <p className={styles.error}>{codeError}</p>
              ) : codeExpired ? (
                <p className={styles.error}>
                  {authErrorMessage("CODE_EXPIRED")}
                </p>
              ) : (
                <p className={styles.hint}>
                  {formatPhone(sentTo)}로 보낸 6자리 번호를 입력해 주세요.
                  번호를 바꾸면 다시 인증해야 해요.
                </p>
              )}
            </div>
          </div>
        )}

        <button
          type="submit"
          className={`${styles.button} ${styles.primary} ${styles.full} ${verifying ? styles.loading : ""}`}
          disabled={
            !codeSent || code.length !== 6 || codeExpired || locked || verifying
          }
          aria-busy={verifying || undefined}
        >
          {verifying ? "확인하고 있어요…" : "로그인"}
        </button>
      </form>

      <p className={styles.info}>
        아직 업체가 등록되지 않았나요? 일로는 별도 회원가입 없이 운영팀이 업체를
        등록한 뒤 이용할 수 있어요. 업체 등록은 운영팀에 문의해 주세요.
      </p>

      <nav className={styles.links} aria-label="로그인 도움">
        <Link href="/owner/account/phone-change">
          휴대전화번호를 바꿨거나 잃어버렸나요?
        </Link>
      </nav>
    </main>
  );
}
