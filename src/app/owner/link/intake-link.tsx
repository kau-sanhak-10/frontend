"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { OwnerGate } from "../_components/owner-gate";
import { StatusPanel } from "../_components/status-panel";
import { useLoad } from "../_components/use-load";
import auth from "../_components/owner-auth.module.css";
import styles from "../_components/owner-inquiries.module.css";
import { fetchIntakeLink } from "@/lib/owner-inquiries/mock-api";
import {
  browserShareTools,
  copyLink,
  shareLink,
  type ShareOutcome,
} from "@/lib/owner-inquiries/share";
import type { IntakeLink } from "@/lib/owner-inquiries/types";

/** 우리 업체 문의 링크 (피그마 B16). QR은 10/30 회의에서 제외했습니다. */
export function IntakeLinkScreen() {
  return (
    <OwnerGate screenName="문의 링크">
      {({ businessId }) => <IntakeLinkBody businessId={businessId} />}
    </OwnerGate>
  );
}

const OUTCOME_MESSAGE: Record<ShareOutcome, string | null> = {
  COPIED: "링크를 복사했어요. 문자나 카카오톡에 붙여 넣어 보내 주세요.",
  SHARED: "링크를 보냈어요.",
  CANCELLED: null,
  FAILED: "복사하지 못했어요. 주소를 길게 눌러 직접 복사해 주세요.",
};

function IntakeLinkBody({ businessId }: { businessId: string }) {
  const fetcher = useCallback(() => fetchIntakeLink(businessId), [businessId]);
  const { result, reload } = useLoad(fetcher);
  return (
    <main className={auth.page}>
      <header className={auth.header}>
        <Link
          href="/owner"
          className={auth.backLink}
          aria-label="홈으로 돌아가기"
        >
          ‹
        </Link>
        <h1 className={auth.headerTitle}>우리 업체 문의 링크</h1>
      </header>

      {result === null ? (
        <div aria-busy="true" className={styles.skeletonCard}>
          <span className={styles.srOnly}>문의 링크를 불러오는 중이에요.</span>
          <span className={`${styles.skeleton} ${styles.skeletonShort}`} />
          <span className={styles.skeleton} />
          <span className={`${styles.skeleton} ${styles.skeletonMid}`} />
        </div>
      ) : !result.ok || result.data.status === "ERROR" ? (
        <StatusPanel
          tone="error"
          title="문의 링크를 불러오지 못했어요."
          body={
            "잠시 후 다시 시도해 주세요.\n계속 안 되면 운영팀에 알려 주세요."
          }
        >
          <button
            type="button"
            className={`${auth.button} ${auth.secondary} ${auth.full}`}
            onClick={() => void reload()}
          >
            다시 시도
          </button>
        </StatusPanel>
      ) : result.data.status === "NOT_ISSUED" ? (
        <StatusPanel
          title="아직 문의 링크가 없어요."
          body={
            "운영팀이 업체 연결을 마치면 이곳에 링크가 생겨요.\n운영 확인이 필요해요."
          }
        />
      ) : (
        <ReadyLink link={result.data} />
      )}
    </main>
  );
}

type ReadyIntakeLink = Extract<IntakeLink, { status: "READY" }>;

function ReadyLink({ link }: { link: ReadyIntakeLink }) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);

  async function onCopy(url: string) {
    setOutcome(await copyLink(url, browserShareTools()));
  }

  async function onShare(url: string, businessName: string) {
    setOutcome(await shareLink(url, businessName, browserShareTools()));
  }

  const message = outcome ? OUTCOME_MESSAGE[outcome] : null;

  return (
    <>
      <div>
        <h2 className={auth.title}>고객에게 문의 링크 보내기</h2>
        <p className={auth.description}>
          고객은 앱 설치 없이 사진과 설명을 남길 수 있어요.
        </p>
      </div>

      <section className={styles.infoCard} aria-label="문의 링크">
        <div>
          <h3 className={styles.infoCardTitle}>
            {link.businessName} · 고객 문의
          </h3>
          <p className={auth.cardLabel}>
            {link.isExample
              ? "화면 확인용 예시 주소"
              : "운영팀이 연결한 업체 전용 주소"}
          </p>
        </div>
        <p className={styles.linkUrl}>{link.url}</p>
      </section>

      {link.isExample ? (
        <p className={auth.info}>
          예시 링크예요. 실제 문의 링크가 발급되면 복사·공유·고객 화면
          미리보기를 사용할 수 있어요.
        </p>
      ) : null}

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={`${auth.button} ${auth.secondary}`}
          onClick={() => void onCopy(link.url)}
          disabled={link.isExample}
        >
          링크 복사
        </button>
        <button
          type="button"
          className={`${auth.button} ${auth.primary}`}
          onClick={() => void onShare(link.url, link.businessName)}
          disabled={link.isExample}
        >
          링크 공유
        </button>
      </div>

      <p
        className={`${styles.toast} ${outcome === "FAILED" ? styles.toastError : ""}`}
        role="status"
      >
        {message}
      </p>

      {link.isExample ? (
        <button
          type="button"
          className={`${auth.button} ${auth.secondary} ${auth.full}`}
          disabled
        >
          고객 화면 미리보기
        </button>
      ) : (
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className={`${auth.button} ${auth.secondary} ${auth.full} ${styles.plainLink}`}
        >
          고객 화면 미리보기
        </a>
      )}

      <p className={auth.hint}>채널 연결과 오류는 운영팀이 관리합니다.</p>
    </>
  );
}
