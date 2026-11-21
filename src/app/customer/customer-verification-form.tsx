"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  confirmCustomerVerification,
  sendCustomerVerification,
  verificationIssue,
} from "@/lib/customer-verification";
import styles from "./intake.module.css";

type Target = Parameters<typeof sendCustomerVerification>[0];
type Result = Awaited<ReturnType<typeof confirmCustomerVerification>>;
type Challenge = Awaited<ReturnType<typeof sendCustomerVerification>>;

export default function CustomerVerificationForm({
  target,
  readPhone,
  onVerified,
}: {
  target: Target;
  readPhone?: (signal: AbortSignal) => Promise<string>;
  onVerified: (result: Result) => void;
}) {
  const [phone, setPhone] = useState<string | null>(readPhone ? null : "");
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!readPhone) return;
    const controller = new AbortController();
    void readPhone(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setPhone(value);
      },
      () => {
        if (!controller.signal.aborted) setLoadError(true);
      },
    );
    return () => controller.abort();
  }, [readPhone, loadAttempt]);
  useEffect(() => {
    if (!deadline && !challenge) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [deadline, challenge]);
  useEffect(() => {
    if (challenge) codeInput.current?.focus();
  }, [challenge]);
  const wait = Math.max(0, Math.ceil((deadline - now) / 1000));
  const expired = !!challenge && now >= Date.parse(challenge.expiresAt);

  async function act(sending: boolean) {
    if (
      phone === null ||
      pending.current ||
      (sending ? wait > 0 : !challenge || expired || code.length !== 6)
    )
      return;
    if (sending && !/^01[016789]\d{7,8}$/.test(phone.replace(/[ -]/g, ""))) {
      setError("휴대전화번호 형식을 확인해 주세요.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      if (sending) {
        const next = await sendCustomerVerification(
          target,
          phone,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setNow(Date.now());
        setDeadline(Date.parse(next.resendAvailableAt));
        setCode("");
        setChallenge(next);
      } else if (challenge) {
        const result = await confirmCustomerVerification(
          target,
          challenge.verificationId,
          code,
          controller.signal,
        );
        if (!controller.signal.aborted) onVerified(result);
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      const issue = verificationIssue(cause);
      setError(issue.message);
      if (issue.clear) {
        setChallenge(null);
        setCode("");
      }
      if (issue.wait) {
        const time = Date.now();
        setNow(time);
        setDeadline(time + issue.wait);
      }
      if (
        readPhone &&
        cause instanceof ApiError &&
        ["INVALID_INPUT", "VERIFICATION_PURPOSE_MISMATCH"].includes(cause.code)
      ) {
        try {
          const latest = await readPhone(controller.signal);
          if (controller.signal.aborted || latest === phone) return;
          setPhone(latest);
          setCode("");
          setChallenge(null);
          setDeadline(0);
          setError("방문 연락처가 바뀌었어요. 새 번호로 인증해 주세요.");
        } catch {
          if (!controller.signal.aborted) {
            setPhone(null);
            setChallenge(null);
            setCode("");
            setDeadline(0);
            setLoadError(true);
          }
        }
      }
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  if (loadError)
    return (
      <div role="alert" className={styles.error}>
        방문 연락처를 불러오지 못했어요.{" "}
        <button
          type="button"
          className={styles.textButton}
          onClick={() => {
            setLoadError(false);
            setError("");
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          연락처 다시 불러오기
        </button>
      </div>
    );
  if (phone === null)
    return <p role="status">방문 연락처를 확인하고 있어요.</p>;
  if (readPhone && !phone)
    return <p role="status">방문정보에서 휴대전화번호를 입력해 주세요.</p>;

  return (
    <form
      aria-label="휴대전화 인증"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void act(!challenge);
      }}
    >
      <label className={styles.field}>
        휴대전화번호
        <input
          required
          type="tel"
          autoComplete="tel"
          value={phone}
          readOnly={!!readPhone}
          disabled={busy || !!challenge}
          onChange={(event) => {
            setPhone(event.target.value);
            setError("");
          }}
        />
      </label>
      {challenge && (
        <label className={styles.field}>
          문자 인증번호
          <input
            required
            ref={codeInput}
            autoComplete="one-time-code"
            inputMode="numeric"
            value={code}
            disabled={busy || expired}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
          />
        </label>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!error && challenge && (
        <p role="status" className={styles.hint}>
          {expired
            ? "인증 시간이 지났어요. 새 번호를 받아 주세요."
            : "문자로 받은 6자리 번호를 입력해 주세요."}
        </p>
      )}
      <button
        className={styles.primary}
        disabled={
          busy ||
          (challenge ? expired || code.length !== 6 : wait > 0 || !phone.trim())
        }
      >
        {busy
          ? "확인 중…"
          : challenge
            ? "인증번호 확인"
            : wait
              ? `인증번호 받기 · ${wait}초 후`
              : "인증번호 받기"}
      </button>
      {challenge && (
        <button
          type="button"
          className={styles.textButton}
          disabled={busy || wait > 0}
          onClick={() => void act(true)}
        >
          {wait ? `인증번호 다시 받기 · ${wait}초 후` : "인증번호 다시 받기"}
        </button>
      )}
      {challenge && !readPhone && (
        <button
          type="button"
          className={styles.textButton}
          disabled={busy}
          onClick={() => {
            setChallenge(null);
            setCode("");
            setError("");
          }}
        >
          번호 다시 입력
        </button>
      )}
    </form>
  );
}
