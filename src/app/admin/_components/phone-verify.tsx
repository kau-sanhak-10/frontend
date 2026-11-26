"use client";

// 사장님 번호 문자 확인 (B-01 업체 등록 · O-03 로그인 번호 변경)
// 운영자가 그 번호로 인증번호를 보내고, 사장님이 불러 준 6자리를 넣어 번호가 문자를 받는지 확인합니다.
// 문자 확인만으로 업체 권한이 생기지 않습니다. (승인·연결은 운영자가 따로 확인)
// 번호가 바뀌면 부모가 key를 바꿔 이 칸을 처음 상태로 되돌립니다.
import { useState } from "react";
import auth from "../../owner/_components/owner-auth.module.css";
import admin from "./admin.module.css";
import { formatPhone, normalizeCode } from "@/lib/owner-auth/phone";
import { ADMIN_ERROR_MESSAGE, formatDateTime } from "@/lib/admin/rules";
import type { AdminSession } from "@/lib/admin/session";
import { confirmOwnerCode, sendOwnerCode } from "@/lib/admin/source";

export function PhoneVerify({
  session,
  phone,
  phoneValid,
  idPrefix,
  onVerified,
}: {
  session: AdminSession;
  /** 숫자만 */
  phone: string;
  phoneValid: boolean;
  idPrefix: string;
  onVerified: (verificationId: string | null) => void;
}) {
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<number | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await sendOwnerCode(session, phone);
    setBusy(false);
    if (!res.ok) {
      setError(ADMIN_ERROR_MESSAGE[res.code]);
      return;
    }
    setVerificationId(res.data.verificationId);
    setCode("");
  }

  async function confirm() {
    if (!verificationId) return;
    setBusy(true);
    setError(null);
    const res = await confirmOwnerCode(session, verificationId, code);
    setBusy(false);
    if (!res.ok) {
      setError(ADMIN_ERROR_MESSAGE[res.code]);
      return;
    }
    setVerifiedAt(res.data.verifiedAt);
    onVerified(verificationId);
  }

  if (verifiedAt !== null) {
    return (
      <p className={admin.okBox} role="status">
        ✓ {formatPhone(phone)} 번호 문자 확인 완료 ({formatDateTime(verifiedAt)}
        )
      </p>
    );
  }

  return (
    <div className={auth.field}>
      <button
        type="button"
        className={`${auth.button} ${auth.secondary} ${auth.full}`}
        disabled={!phoneValid || busy}
        onClick={() => void send()}
      >
        {busy && !verificationId
          ? "보내는 중…"
          : verificationId
            ? "인증번호 다시 보내기"
            : "이 번호로 확인 문자 보내기"}
      </button>
      {verificationId ? (
        <>
          <label className={auth.label} htmlFor={`${idPrefix}-code`}>
            사장님이 받은 인증번호 6자리
          </label>
          <div className={auth.row}>
            <div className={auth.inputWrap}>
              <input
                id={`${idPrefix}-code`}
                className={auth.input}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
              />
            </div>
            <button
              type="button"
              className={`${auth.button} ${auth.primary} ${auth.small}`}
              disabled={code.length !== 6 || busy}
              onClick={() => void confirm()}
            >
              {busy ? "확인 중…" : "확인"}
            </button>
          </div>
          <p className={auth.hint}>
            사장님께 전화로 인증번호를 받아 입력해요. 문자 확인만으로 업체
            권한이 생기지는 않아요.
          </p>
        </>
      ) : null}
      {error ? (
        <p className={auth.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
