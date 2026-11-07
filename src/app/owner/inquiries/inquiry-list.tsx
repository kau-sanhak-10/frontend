"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { OwnerGate } from "../_components/owner-gate";
import { OwnerTabBar } from "../_components/owner-tab-bar";
import { StatusPanel } from "../_components/status-panel";
import auth from "../_components/owner-auth.module.css";
import styles from "../_components/owner-inquiries.module.css";
import { fetchInquiries } from "@/lib/owner-inquiries/mock-api";
import {
  OWNER_CHECK_REASON_LABEL,
  STATUS_LABEL,
  countByTab,
  filterByTab,
  groupOf,
  type InquiryGroup,
  type InquiryTab,
} from "@/lib/owner-inquiries/rules";
import {
  formatReceivedAt,
  formatVisitRange,
} from "@/lib/owner-inquiries/format";
import type { InquirySummary, LoadResult } from "@/lib/owner-inquiries/types";

const TAB_LABEL: Record<InquiryTab, string> = {
  ALL: "전체",
  OWNER_CHECK: "확인 필요",
  IN_PROGRESS: "처리 중",
};

const GROUP_ORDER: { key: InquiryGroup; title: string }[] = [
  { key: "OWNER_CHECK", title: "사장님 확인" },
  { key: "AI_INTAKE", title: "덕구가 접수 중" },
  { key: "OWNER_HANDLING", title: "직접 응대 중" },
  { key: "RESERVED", title: "예약 확정" },
  { key: "COMPLETED", title: "처리 완료" },
];

export function InquiryList() {
  return (
    <OwnerGate screenName="접수함">
      {({ businessId }) => <InquiryListBody businessId={businessId} />}
    </OwnerGate>
  );
}

function InquiryListBody({ businessId }: { businessId: string }) {
  const [tab, setTab] = useState<InquiryTab>("ALL");
  const [result, setResult] = useState<LoadResult<InquirySummary[]> | null>(
    null,
  );
  // 화면의 '오늘·어제' 기준 시각. 불러온 시점으로 고정합니다.
  const [loadedAt, setLoadedAt] = useState(0);
  // 늦게 도착한 이전 조회 결과가 최신 결과를 덮지 않게 합니다.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setResult(null);
    const res = await fetchInquiries(businessId);
    if (id === requestId.current) {
      setLoadedAt(Date.now());
      setResult(res);
    }
  }, [businessId]);

  useEffect(() => {
    // 화면에 들어오면 한 번 불러옵니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  return (
    <main className={`${auth.page} ${styles.withTabBar}`}>
      <header className={auth.header}>
        <h1 className={auth.headerTitle}>접수함</h1>
      </header>

      {result === null ? (
        <ListSkeleton />
      ) : !result.ok ? (
        <StatusPanel
          tone="error"
          title="접수 목록을 불러오지 못했어요."
          body="잠시 후 다시 시도해 주세요. 접수 내용은 지워지지 않았어요."
        >
          <button
            type="button"
            className={`${auth.button} ${auth.secondary} ${auth.full}`}
            onClick={() => void load()}
          >
            다시 시도
          </button>
        </StatusPanel>
      ) : result.data.length === 0 ? (
        <EmptyInbox />
      ) : (
        <InquiryTabs
          inquiries={result.data}
          tab={tab}
          now={loadedAt}
          onTabChange={setTab}
        />
      )}

      <OwnerTabBar current="inquiries" />
    </main>
  );
}

function InquiryTabs({
  inquiries,
  tab,
  now,
  onTabChange,
}: {
  inquiries: InquirySummary[];
  tab: InquiryTab;
  now: number;
  onTabChange: (tab: InquiryTab) => void;
}) {
  const counts = countByTab(inquiries);
  const visible = filterByTab(inquiries, tab);

  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="접수 구분">
        {(Object.keys(TAB_LABEL) as InquiryTab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls="inquiry-tabpanel"
            className={styles.tab}
            onClick={() => onTabChange(key)}
          >
            {TAB_LABEL[key]} {counts[key]}
          </button>
        ))}
      </div>

      <div
        id="inquiry-tabpanel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className={styles.groups}
      >
        {visible.length === 0 ? (
          <p className={auth.info}>
            {tab === "OWNER_CHECK"
              ? "지금 사장님이 확인할 접수는 없어요."
              : "지금 처리 중인 접수는 없어요."}
          </p>
        ) : (
          GROUP_ORDER.map(({ key, title }) => {
            const items = visible.filter((i) => groupOf(i) === key);
            if (items.length === 0) return null;
            return (
              <section key={key} className={styles.group}>
                <div className={styles.groupHeader}>
                  <h2 className={auth.sectionTitle}>{title}</h2>
                  <span className={styles.groupCount}>{items.length}건</span>
                </div>
                <ul className={styles.cardList}>
                  {items.map((inquiry) => (
                    <li key={inquiry.id}>
                      <InquiryCard inquiry={inquiry} now={now} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </>
  );
}

function InquiryCard({
  inquiry,
  now,
}: {
  inquiry: InquirySummary;
  now: number;
}) {
  const group = groupOf(inquiry);
  const badge =
    group === "OWNER_CHECK" && inquiry.ownerCheckReason
      ? OWNER_CHECK_REASON_LABEL[inquiry.ownerCheckReason]
      : STATUS_LABEL[group];

  return (
    <Link
      href={`/owner/inquiries/${inquiry.id}`}
      className={`${styles.inquiryCard} ${group === "OWNER_CHECK" ? styles.attention : ""}`}
    >
      <span className={styles.cardTop}>
        <span className={styles.cardTitle}>
          {inquiry.customerLabel} · {inquiry.title}
        </span>
        <span
          className={`${styles.badge} ${group === "OWNER_CHECK" ? styles.badgeAttention : group === "RESERVED" ? styles.badgeSuccess : ""}`}
        >
          {badge}
        </span>
      </span>
      <span className={styles.cardNote}>{inquiry.note}</span>
      {inquiry.reservation ? (
        <span className={styles.cardMeta}>
          방문{" "}
          {formatVisitRange(
            inquiry.reservation.startAt,
            inquiry.reservation.endAt,
            now,
          )}
          {inquiry.reservation.changeRequest
            ? ` → 요청 ${inquiry.reservation.changeRequest.requestedLabel}`
            : ""}
        </span>
      ) : null}
      {inquiry.unconfirmedLabels.length > 0 ? (
        <span className={styles.unconfirmed}>
          {inquiry.unconfirmedLabels.join(", ")} 미확인
        </span>
      ) : null}
      <span className={styles.cardTime}>
        {formatReceivedAt(inquiry.receivedAt, now)} 접수
      </span>
    </Link>
  );
}

/** B17 · 접수함 · 새 접수 없음 */
function EmptyInbox() {
  return (
    <StatusPanel
      title="아직 새 접수가 없어요."
      body="문의 링크를 보내면 덕구가 사진과 증상을 받아 둘게요."
    >
      <Link
        href="/owner/link"
        className={`${auth.button} ${auth.primary} ${auth.full}`}
      >
        우리 업체 문의 링크
      </Link>
    </StatusPanel>
  );
}

/** 불러오는 중 (피그마 B01-L과 같은 스켈레톤) */
function ListSkeleton() {
  return (
    <div className={styles.groups} aria-busy="true" aria-live="polite">
      <span className={styles.srOnly}>불러오는 중이에요…</span>
      {[0, 1, 2].map((n) => (
        <div key={n} className={styles.skeletonCard} aria-hidden="true">
          <span className={`${styles.skeleton} ${styles.skeletonShort}`} />
          <span className={styles.skeleton} />
          <span className={`${styles.skeleton} ${styles.skeletonMid}`} />
        </div>
      ))}
    </div>
  );
}
