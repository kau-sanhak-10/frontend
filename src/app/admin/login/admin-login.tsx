"use client";

// 운영자 로그인 (O-01)
// 사장님 로그인과 같은 문자 인증 화면 구성을 쓰고, 운영 권한은 서버가 확인합니다.
// 운영자로 등록되지 않은 번호(사장님·고객 번호)는 인증번호를 보내지 않습니다.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import auth from "../../owner/_components/owner-auth.module.css";
import { ADMIN_ERROR_MESSAGE } from "@/lib/admin/rules";
import { confirmAdminLogin, sendAdminLoginCode } from "@/lib/admin/live-api";
import {
  confirmAdminLoginMock,
  sendAdminLoginCodeMock,
} from "@/lib/admin/mock-api";
import { saveAdminSession } from "@/lib/admin/session";
import { useAdminSession } from "@/lib/admin/use-admin-session";
import type { AdminErrorCode } from "@/lib/admin/types";
import {
  formatPhone,
  isValidPhone,
  normalizeCode,
  normalizePhone,
} from "@/lib/owner-auth/phone";

const LOGIN_ERROR: Partial<Record<AdminErrorCode, string>> = {
  FORBIDDEN:
    "운영 권한이 있는 번호가 아니에요. 사장님은 사장님 로그인을 이용해 주세요.",
  INVALID: "휴대전화번호 형식을 확인해 주세요.",
};

export function AdminLogin({
  notice,
  preview,
}: {
  notice?: string;
  preview: boolean;
}) {
  const router = useRouter();
  const state = useAdminSession();
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signedIn = state.status === "active";
  useEffect(() => {
    if (signedIn) router.replace("/admin");
  }, [signedIn, router]);

  async function send() {
    if (!isValidPhone(phone) || busy) return;
    setBusy(true);
    setError(null);
    const res = preview
      ? await sendAdminLoginCodeMock(phone)
      : await sendAdminLoginCode(phone);
    setBusy(false);
    if (!res.ok) {
      setError(LOGIN_ERROR[res.code] ?? ADMIN_ERROR_MESSAGE[res.code]);
      return;
    }
    setSentTo(phone);
    setVerificationId(res.data.verificationId);
    setCode("");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!verificationId || !sentTo || code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    if (preview) {
      const res = await confirmAdminLoginMock(verificationId, code);
      setBusy(false);
      if (!res.ok) return setError(ADMIN_ERROR_MESSAGE[res.code]);
      saveAdminSession({ mode: "mock", phone: sentTo, ...res.data });
    } else {
      const res = await confirmAdminLogin(verificationId, code);
      setBusy(false);
      if (!res.ok)
        return setError(LOGIN_ERROR[res.code] ?? ADMIN_ERROR_MESSAGE[res.code]);
      saveAdminSession({
        mode: "live",
        token: res.data.token,
        name: res.data.name,
        role: res.data.role,
        expiresAt: res.data.expiresAt,
        phone: sentTo,
      });
    }
    router.replace("/admin");
  }

  if (state.status === "loading" || signedIn) {
    return (
      <main className={auth.page}>
        <p className={auth.hint} aria-live="polite">
          로그인 상태를 확인하고 있어요…
        </p>
      </main>
    );
  }

  return (
    <main className={auth.page}>
      <header>
        {preview ? (
          <p className={auth.previewNotice}>
            화면 확인용 · 문자는 발송하지 않아요. 인증번호는 123456
          </p>
        ) : null}
        <p className={auth.brand}>일로 · 운영 관리</p>
        <h1 className={auth.title}>운영자 로그인</h1>
        <p className={auth.description}>
          운영 권한을 받은 휴대전화번호로 문자 인증을 해 주세요. 로그인은 최대
          12시간 유지돼요.
        </p>
      </header>
      {notice ? (
        <p className={auth.notice} role="status">
          {notice}
        </p>
      ) : null}
      <form className={auth.form} onSubmit={verify} noValidate>
        <div className={auth.field}>
          <label className={auth.label} htmlFor="admin-phone">
            휴대전화번호
          </label>
          <div className={auth.row}>
            <div className={auth.inputWrap}>
              <input
                id="admin-phone"
                className={auth.input}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="010-0000-0000"
                value={formatPhone(phone)}
                disabled={busy}
                onChange={(e) => {
                  const next = normalizePhone(e.target.value);
                  setPhone(next);
                  if (next !== sentTo) {
                    setSentTo(null);
                    setVerificationId(null);
                    setCode("");
                  }
                  setError(null);
                }}
              />
            </div>
            <button
              type="button"
              className={`${auth.button} ${auth.secondary} ${auth.small}`}
              disabled={busy || !isValidPhone(phone)}
              onClick={() => void send()}
            >
              {busy && !sentTo
                ? "보내는 중…"
                : sentTo
                  ? "다시 받기"
                  : "인증번호 받기"}
            </button>
          </div>
        </div>
        {sentTo ? (
          <div className={auth.field}>
            <label className={auth.label} htmlFor="admin-code">
              문자 인증번호
            </label>
            <div className={auth.inputWrap}>
              <input
                id="admin-code"
                className={auth.input}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="숫자 6자리"
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
              />
            </div>
          </div>
        ) : null}
        {error ? (
          <p className={auth.error} role="alert">
            {error}
          </p>
        ) : null}
        {sentTo ? (
          <button
            type="submit"
            className={`${auth.button} ${auth.primary} ${auth.full}`}
            disabled={busy || code.length !== 6}
          >
            {busy ? "확인 중…" : "로그인"}
          </button>
        ) : null}
      </form>
      <p className={auth.hint}>
        사장님이신가요? <Link href="/owner/login">사장님 로그인</Link>
      </p>
    </main>
  );
}
