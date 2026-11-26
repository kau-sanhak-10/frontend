"use client";

// 계정·업체 연결 지원: 사장님 로그인 번호 변경 (O-03)
// 상세 패널에서 대상·본인/업체 확인 근거·새 번호 문자 확인·처리 결과를 차례로 확인합니다.
// - 최고 운영자만 할 수 있어요.
// - 확인이 안 되면 바꾸지 않아요. 비슷한 업체를 합치거나 고객·예약을 옮기지 않아요.
// - 바꾸면 기존 사장님 로그인은 모두 끊기고, 계정·업체·예약은 그대로예요.
import { useState } from "react";
import { PhoneVerify } from "../../_components/phone-verify";
import admin from "../../_components/admin.module.css";
import auth from "../../../owner/_components/owner-auth.module.css";
import styles from "../../../owner/_components/owner-inquiries.module.css";
import { ADMIN_ERROR_MESSAGE } from "@/lib/admin/rules";
import type { AdminSession } from "@/lib/admin/session";
import { changeLoginPhone } from "@/lib/admin/source";
import type { AdminOwner } from "@/lib/admin/types";
import {
  formatPhone,
  isValidPhone,
  normalizePhone,
} from "@/lib/owner-auth/phone";

export function LoginPhoneSection({
  session,
  owner,
  canChange,
  onChanged,
}: {
  session: AdminSession;
  owner: AdminOwner;
  canChange: boolean;
  onChanged: (o: AdminOwner, okText: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [evidence, setEvidence] = useState("");
  const [checked, setChecked] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    tone: "ok" | "fail";
    text: string;
  } | null>(null);

  const isSuper = session.role === "SUPER";
  const samePhone = phone === owner.phone;
  const ready =
    isValidPhone(phone) &&
    !samePhone &&
    evidence.trim().length > 0 &&
    checked &&
    verificationId !== null;

  function reset() {
    setPhone("");
    setEvidence("");
    setChecked(false);
    setVerificationId(null);
  }

  async function submit() {
    if (!ready || !verificationId) return;
    setBusy(true);
    setResult(null);
    const before = owner.phone;
    const res = await changeLoginPhone(
      session,
      owner.id,
      phone,
      verificationId,
    );
    setBusy(false);
    if (!res.ok) {
      if (res.code === "NOT_VERIFIED") setVerificationId(null);
      setResult({
        tone: "fail",
        text: `${ADMIN_ERROR_MESSAGE[res.code]} 로그인 번호는 그대로예요.`,
      });
      return;
    }
    setResult(null);
    onChanged(
      res.data,
      `로그인 번호를 ${formatPhone(before)} → ${formatPhone(res.data.phone)}(으)로 바꿨어요. 기존 사장님 로그인은 모두 끊겼고, 업체·고객·예약 정보는 그대로예요. 사장님께 새 번호로 로그인하라고 안내해 주세요.`,
    );
    reset();
    setOpen(false);
  }

  return (
    <section className={auth.section} aria-labelledby="owner-phone">
      <h2 id="owner-phone" className={auth.sectionTitle}>
        계정·업체 연결 지원
      </h2>
      {result ? (
        <p
          className={result.tone === "ok" ? admin.okBox : admin.failBox}
          role={result.tone === "ok" ? "status" : "alert"}
        >
          {result.text}
        </p>
      ) : null}
      <p className={auth.info}>
        번호 변경·분실 등으로 사장님 로그인 번호를 바꿀 때 써요. 계정과 업체
        연결은 그대로 두고 번호만 바꿔요.
      </p>
      {!canChange ? (
        <p className={auth.hint}>탈퇴한 업체는 로그인 번호를 바꿀 수 없어요.</p>
      ) : !isSuper ? (
        <p className={auth.hint}>
          로그인 번호 변경은 최고 운영자만 할 수 있어요.
        </p>
      ) : !open ? (
        <button
          type="button"
          className={`${auth.button} ${auth.secondary} ${auth.full}`}
          onClick={() => {
            setResult(null);
            setOpen(true);
          }}
        >
          로그인 번호 변경 요청 처리
        </button>
      ) : (
        <div className={admin.panel} role="group" aria-label="로그인 번호 변경">
          <dl className={styles.fieldList}>
            <div className={styles.field}>
              <dt className={styles.fieldLabel}>① 대상</dt>
              <dd className={styles.fieldValue}>
                {owner.businessName} · 현재 번호 {formatPhone(owner.phone)}
              </dd>
            </div>
          </dl>

          <label className={auth.label} htmlFor="phone-evidence">
            ② 본인·업체 확인 근거 (필수)
          </label>
          <textarea
            id="phone-evidence"
            className={admin.textarea}
            value={evidence}
            maxLength={500}
            placeholder="예: 11/26 대표번호로 통화, 사업자등록증 사본 확인"
            onChange={(e) => setEvidence(e.target.value)}
          />
          <p className={auth.hint}>
            서버에는 처리자·시각만 남아요. 확인 근거는 운영 기록에도 함께 적어
            주세요.
          </p>
          <label className={admin.checkRow}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            요청한 사람이 이 업체의 사장님 본인인 것을 직접 확인했어요.
          </label>

          <label className={auth.label} htmlFor="new-phone">
            ③ 새 로그인 번호 · 문자 확인
          </label>
          <input
            id="new-phone"
            className={auth.input}
            type="tel"
            inputMode="numeric"
            placeholder="010-0000-0000"
            value={formatPhone(phone)}
            onChange={(e) => {
              setPhone(normalizePhone(e.target.value));
              setVerificationId(null);
            }}
          />
          {samePhone && phone ? (
            <p className={auth.error}>지금 번호와 같아요.</p>
          ) : null}
          <PhoneVerify
            key={phone}
            session={session}
            phone={phone}
            phoneValid={isValidPhone(phone) && !samePhone}
            idPrefix="change"
            onVerified={setVerificationId}
          />

          <p className={auth.label}>④ 처리</p>
          <ul className={admin.steps}>
            <li>기존 사장님 로그인은 모두 끊겨요.</li>
            <li>업체·고객·예약 정보는 옮기거나 지우지 않아요.</li>
          </ul>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={`${auth.button} ${auth.secondary}`}
              disabled={busy}
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              취소
            </button>
            <button
              type="button"
              className={`${auth.button} ${auth.primary}`}
              disabled={!ready || busy}
              onClick={() => void submit()}
            >
              {busy ? "바꾸는 중…" : "로그인 번호 바꾸기"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
