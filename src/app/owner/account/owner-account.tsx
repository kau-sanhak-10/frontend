"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StatusPanel } from "../_components/status-panel";
import styles from "../_components/owner-auth.module.css";
import { formatPhone, maskPhone } from "@/lib/owner-auth/phone";
import {
  clearSession,
  updateSessionName,
  type OwnerSession,
} from "@/lib/owner-auth/session";
import { useOwnerSession } from "@/lib/owner-auth/use-owner-session";

const NAME_MAX = 20;

export function OwnerAccount() {
  const router = useRouter();
  const session = useOwnerSession();

  // 만료된 로그인은 재인증 화면으로 보냅니다.
  useEffect(() => {
    if (session.status === "expired") {
      router.replace("/owner/login?reason=expired");
    }
  }, [session.status, router]);

  if (session.status === "loading" || session.status === "expired") {
    return (
      <main className={styles.page}>
        <p className={styles.hint} aria-live="polite">
          로그인 상태를 확인하고 있어요…
        </p>
      </main>
    );
  }

  if (session.status === "none") {
    return (
      <main className={styles.page}>
        <StatusPanel
          title="로그인이 필요해요."
          body="계정 정보는 문자 인증으로 로그인한 뒤 볼 수 있어요."
        />
        <Link
          href="/owner/login"
          className={`${styles.button} ${styles.primary} ${styles.full}`}
        >
          로그인하러 가기
        </Link>
      </main>
    );
  }

  return (
    <AccountDetails
      key={session.session.loginPhone}
      session={session.session}
      onLogout={() => {
        clearSession();
        router.replace("/owner/login?reason=logout");
      }}
    />
  );
}

function AccountDetails({
  session,
  onLogout,
}: {
  session: OwnerSession;
  onLogout: () => void;
}) {
  const [name, setName] = useState(session.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const trimmed = name.trim();
  const changed = trimmed !== session.name;

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed) {
      setNameError("이름을 입력해 주세요.");
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setNameError(`이름은 ${NAME_MAX}자 이내로 입력해 주세요.`);
      return;
    }
    updateSessionName(session, trimmed);
    setName(trimmed);
    setSaved(true);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/owner" className={styles.backLink} aria-label="뒤로 가기">
          ‹
        </Link>
        <h1 className={styles.headerTitle}>내 계정</h1>
      </header>

      <form className={styles.section} onSubmit={handleSave} noValidate>
        <h2 className={styles.sectionTitle}>내 정보</h2>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="owner-name">
            이름
          </label>
          <input
            id="owner-name"
            className={styles.input}
            value={name}
            maxLength={NAME_MAX + 5}
            autoComplete="name"
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
              setSaved(false);
            }}
            aria-invalid={nameError ? true : undefined}
            aria-describedby="owner-name-help"
          />
          <div id="owner-name-help" aria-live="polite">
            {nameError ? (
              <p className={styles.error}>{nameError}</p>
            ) : saved ? (
              <p className={styles.hint}>이름을 저장했어요.</p>
            ) : null}
          </div>
        </div>
        <button
          type="submit"
          className={`${styles.button} ${styles.secondary} ${styles.full}`}
          disabled={!changed}
        >
          이름 저장
        </button>
      </form>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>로그인 번호</h2>
        <div className={styles.card}>
          <p className={styles.cardLabel}>문자 인증에 쓰는 개인 휴대전화번호</p>
          <p className={styles.cardValue}>{maskPhone(session.loginPhone)}</p>
        </div>
        <p className={styles.hint}>
          로그인 번호는 운영팀이 본인과 업체를 확인한 뒤 새 번호 인증을 거쳐
          바꿀 수 있어요. 변경 전까지는 지금 번호로 로그인해요.
        </p>
        <Link
          href="/owner/account/phone-change"
          className={`${styles.button} ${styles.secondary} ${styles.full}`}
        >
          로그인 번호 변경 요청
        </Link>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>연결된 업체</h2>
        <div className={styles.card}>
          <p className={styles.cardLabel}>업체명</p>
          <p className={styles.cardValue}>{session.businessName}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>
            업체 대표 연락처 (고객에게 보이는 번호)
          </p>
          <p className={styles.cardValue}>
            {formatPhone(session.businessPhone)}
          </p>
        </div>
        <p className={styles.hint}>
          업체 대표 연락처는 로그인 번호와 별개예요. 업체 정보에서 바꿔도 로그인
          번호는 바뀌지 않아요.
        </p>
      </section>

      <div className={styles.footer}>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary} ${styles.full}`}
          onClick={onLogout}
        >
          로그아웃
        </button>
      </div>
    </main>
  );
}
