"use client";

import Link from "next/link";
import { useState } from "react";
import { StatusPanel } from "../../_components/status-panel";
import styles from "../../_components/owner-auth.module.css";
import { requestLoginPhoneChange } from "@/lib/owner-auth/mock-api";
import {
  formatPhone,
  isValidPhone,
  normalizePhone,
} from "@/lib/owner-auth/phone";

/** 로그인 번호 변경·분실 지원 요청. 번호를 잃어버린 사장님도 쓸 수 있도록 로그인 없이 엽니다. */
export function PhoneChangeRequestForm() {
  const [newPhone, setNewPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [memo, setMemo] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phoneOk = isValidPhone(newPhone);
    const businessOk = businessName.trim().length > 0;
    setPhoneError(phoneOk ? null : "새 휴대전화번호를 정확히 입력해 주세요.");
    setBusinessError(
      businessOk ? null : "업체명 또는 기존 번호를 입력해 주세요.",
    );
    if (!phoneOk || !businessOk) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await requestLoginPhoneChange({
        newPhone,
        businessName: businessName.trim(),
        memo: memo.trim() || undefined,
      });
      if (res.ok) setDone(true);
      else setPhoneError("새 휴대전화번호를 정확히 입력해 주세요.");
    } catch {
      setSubmitError(
        "요청을 보내지 못했어요. 입력한 내용은 그대로 있어요. 다시 시도해 주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.headerTitle}>요청 접수</h1>
        </header>
        <StatusPanel
          title="운영팀에 요청을 전달했어요."
          body={
            "운영팀이 본인·업체 관계를 확인한 뒤 새 번호로 문자 인증을 진행해요.\n처리 전까지는 기존 로그인 번호가 유지돼요."
          }
        />
        <div className={styles.footer}>
          <Link
            href="/owner/login"
            className={`${styles.button} ${styles.primary} ${styles.full}`}
          >
            로그인 화면으로
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link
          href="/owner/login"
          className={styles.backLink}
          aria-label="뒤로 가기"
        >
          ‹
        </Link>
        <h1 className={styles.headerTitle}>로그인 번호 변경 요청</h1>
      </header>

      <p className={styles.description}>
        로그인 번호는 운영팀이 본인과 업체를 확인한 뒤 바꿔 드려요. 번호를
        입력하는 것만으로는 바로 바뀌지 않아요.
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="new-phone">
            새 휴대전화번호
          </label>
          <input
            id="new-phone"
            className={styles.input}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="010-0000-0000"
            value={formatPhone(newPhone)}
            onChange={(e) => {
              setNewPhone(normalizePhone(e.target.value));
              setPhoneError(null);
            }}
            aria-invalid={phoneError ? true : undefined}
            aria-describedby={phoneError ? "new-phone-error" : undefined}
          />
          {phoneError && (
            <p id="new-phone-error" className={styles.error} role="alert">
              {phoneError}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="business-check">
            업체 확인 정보
          </label>
          <input
            id="business-check"
            className={styles.input}
            placeholder="업체명 또는 기존 번호"
            value={businessName}
            onChange={(e) => {
              setBusinessName(e.target.value);
              setBusinessError(null);
            }}
            aria-invalid={businessError ? true : undefined}
            aria-describedby={
              businessError ? "business-check-error" : undefined
            }
          />
          {businessError && (
            <p id="business-check-error" className={styles.error} role="alert">
              {businessError}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="change-memo">
            요청 사항 (선택)
          </label>
          <input
            id="change-memo"
            className={styles.input}
            placeholder="예: 휴대폰을 바꿔서 번호가 달라졌어요."
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>

        {submitError && (
          <p className={styles.error} role="alert">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          className={`${styles.button} ${styles.primary} ${styles.full} ${submitting ? styles.loading : ""}`}
          disabled={submitting}
          aria-busy={submitting || undefined}
        >
          {submitting ? "보내는 중…" : "변경 요청 보내기"}
        </button>
      </form>
    </main>
  );
}
