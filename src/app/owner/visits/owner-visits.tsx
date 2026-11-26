"use client";

import Link from "next/link";
import { useCallback } from "react";
import { OwnerGate } from "../_components/owner-gate";
import { OwnerTabBar } from "../_components/owner-tab-bar";
import { StatusPanel } from "../_components/status-panel";
import { useLoad } from "../_components/use-load";
import { WorkNotReady } from "../_components/work-not-ready";
import auth from "../_components/owner-auth.module.css";
import styles from "../_components/owner-inquiries.module.css";
import work from "../_components/owner-work.module.css";
import { DetailSkeleton } from "../inquiries/[id]/detail-states";
import {
  formatClock,
  formatMonthDay,
  formatTodayHeader,
} from "@/lib/owner-inquiries/format";
import {
  VISIT_STATUS_LABEL,
  groupVisits,
  remainingToday,
} from "@/lib/owner-work/rules";
import {
  loadVisits,
  workSourceOf,
  type WorkSource,
} from "@/lib/owner-work/source";
import type { Visit } from "@/lib/owner-work/types";

/** 방문 일정 (B-23 ①) · 오늘 방문 순서와 예정 방문 */
export function OwnerVisits() {
  return (
    <OwnerGate screenName="방문 일정">
      {({ source }) => {
        const ws = workSourceOf(source);
        return (
          <main className={`${auth.page} ${styles.withTabBar}`}>
            <header className={auth.header}>
              <h1 className={auth.headerTitle}>방문 일정</h1>
            </header>
            {ws ? (
              <VisitsBody source={ws} />
            ) : (
              <WorkNotReady what="방문 일정" />
            )}
            <OwnerTabBar current="schedule" />
          </main>
        );
      }}
    </OwnerGate>
  );
}

function VisitsBody({ source }: { source: WorkSource }) {
  const fetcher = useCallback(() => loadVisits(source), [source]);
  const { result, loadedAt, reload } = useLoad(fetcher);

  if (result === null) return <DetailSkeleton />;
  if (!result.ok) {
    return (
      <StatusPanel
        tone="error"
        title="방문 일정을 불러오지 못했어요."
        body="잠시 후 다시 시도해 주세요. 예약은 지워지지 않았어요."
      >
        <button
          type="button"
          className={`${auth.button} ${auth.secondary} ${auth.full}`}
          onClick={() => void reload()}
        >
          다시 시도
        </button>
      </StatusPanel>
    );
  }

  const { today, upcoming, past } = groupVisits(result.data, loadedAt);
  const remaining = remainingToday(today, loadedAt);

  return (
    <div className={styles.groups}>
      <section className={auth.section} aria-labelledby="visits-today">
        <div className={styles.groupHeader}>
          <h2 id="visits-today" className={auth.sectionTitle}>
            {formatTodayHeader(loadedAt)}
          </h2>
          <span className={styles.groupCount}>
            {today.length === 0
              ? "없음"
              : remaining === 0
                ? "오늘 방문 끝"
                : `남은 ${remaining}곳`}
          </span>
        </div>
        {today.length === 0 ? (
          <p className={auth.info}>오늘 잡힌 방문은 없어요.</p>
        ) : (
          <VisitList visits={today} showDate={false} />
        )}
      </section>

      <section className={auth.section} aria-labelledby="visits-upcoming">
        <div className={styles.groupHeader}>
          <h2 id="visits-upcoming" className={auth.sectionTitle}>
            다가오는 방문
          </h2>
          <span className={styles.groupCount}>{upcoming.length}건</span>
        </div>
        {upcoming.length === 0 ? (
          <p className={auth.info}>예정된 방문이 없어요.</p>
        ) : (
          <VisitList visits={upcoming} showDate />
        )}
      </section>

      {past.length > 0 ? (
        <section className={auth.section} aria-labelledby="visits-past">
          <div className={styles.groupHeader}>
            <h2 id="visits-past" className={auth.sectionTitle}>
              지난 방문·취소
            </h2>
            <span className={styles.groupCount}>{past.length}건</span>
          </div>
          <VisitList visits={past} showDate />
        </section>
      ) : null}
    </div>
  );
}

function VisitList({
  visits,
  showDate,
}: {
  visits: Visit[];
  showDate: boolean;
}) {
  return (
    <ul className={styles.cardList}>
      {visits.map((v) => (
        <li key={v.id}>
          <Link
            href={`/owner/visits/${encodeURIComponent(v.id)}`}
            className={`${styles.inquiryCard} ${v.status === "CANCELED" ? work.dimmed : ""}`}
          >
            <span className={styles.cardTop}>
              <span className={styles.cardTitle}>
                {showDate ? `${formatMonthDay(v.startAt)} ` : ""}
                {formatClock(v.startAt)}~{formatClock(v.endAt)} ·{" "}
                {v.customerLabel}
              </span>
              <span
                className={`${styles.badge} ${
                  v.status === "CONFIRMED"
                    ? styles.badgeSuccess
                    : v.status === "REQUESTED"
                      ? styles.badgeAttention
                      : ""
                }`}
              >
                {VISIT_STATUS_LABEL[v.status]}
              </span>
            </span>
            <span className={styles.cardNote}>
              {v.address} · {v.workType}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
