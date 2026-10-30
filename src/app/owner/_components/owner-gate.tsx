"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { StatusPanel } from "./status-panel";
import styles from "./owner-auth.module.css";
import type { OwnerSession } from "@/lib/owner-auth/session";
import { useOwnerBusiness } from "@/lib/owner-inquiries/use-owner-business";

type OwnerGateProps = {
  /** 로그인 안내 문구에 쓸 화면 이름 (예: "접수함") */
  screenName: string;
  children: (ctx: {
    session: OwnerSession;
    businessId: string;
  }) => React.ReactNode;
};

/**
 * 사장님 업무 화면 공통 입구.
 * 로그인·업체 연결을 확인하고, 만료되면 로그인 화면으로 보냅니다.
 */
export function OwnerGate({ screenName, children }: OwnerGateProps) {
  const router = useRouter();
  const state = useOwnerBusiness();

  useEffect(() => {
    if (state.status === "expired") {
      router.replace("/owner/login?reason=expired");
    }
  }, [state.status, router]);

  if (state.status === "loading" || state.status === "expired") {
    return (
      <main className={styles.page}>
        <p className={styles.hint} aria-live="polite">
          로그인 상태를 확인하고 있어요…
        </p>
      </main>
    );
  }

  if (state.status === "none") {
    return (
      <main className={styles.page}>
        <StatusPanel
          title="로그인이 필요해요."
          body={`${screenName}은 문자 인증으로 로그인한 뒤 볼 수 있어요.`}
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

  if (state.status === "unlinked") {
    return (
      <main className={styles.page}>
        <StatusPanel
          title="연결된 업체를 찾지 못했어요."
          body={
            "운영팀이 업체 연결을 확인하고 있어요.\n잠시 후 다시 들어와 주세요."
          }
        />
      </main>
    );
  }

  return (
    <>{children({ session: state.session, businessId: state.businessId })}</>
  );
}
