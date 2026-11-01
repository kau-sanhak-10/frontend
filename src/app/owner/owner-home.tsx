"use client";

import Link from "next/link";
import { useCallback } from "react";
import { OwnerGate } from "./_components/owner-gate";
import { OwnerTabBar } from "./_components/owner-tab-bar";
import { StatusPanel } from "./_components/status-panel";
import { useLoad } from "./_components/use-load";
import auth from "./_components/owner-auth.module.css";
import styles from "./_components/owner-inquiries.module.css";
import { fetchInquiries } from "@/lib/owner-inquiries/mock-api";
import {
  OWNER_CHECK_REASON_LABEL,
  countByTab,
  filterByTab,
  todayVisits,
} from "@/lib/owner-inquiries/rules";
import {
  areaOf,
  formatClock,
  formatTodayHeader,
  formatVisitRange,
} from "@/lib/owner-inquiries/format";
import type { InquirySummary } from "@/lib/owner-inquiries/types";

/** 사장님 홈 (피그마 B01) */
export function OwnerHome() {
  return (
    <OwnerGate screenName="홈">
      {({ businessId, session }) => (
        <OwnerHomeBody
          businessId={businessId}
          businessName={session.businessName}
        />
      )}
    </OwnerGate>
  );
}

function OwnerHomeBody({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const fetcher = useCallback(() => fetchInquiries(businessId), [businessId]);
  const { result, loadedAt, reload } = useLoad(fetcher);

  return (
    <main className={`${auth.page} ${styles.withTabBar}`}>
      <header className={auth.header}>
        <p className={auth.brand}>일로</p>
        <span
          className={styles.headerAction}
          aria-disabled="true"
          title="알림은 준비 중이에요"
        >
          알림
        </span>
      </header>

      {result === null ? (
        <HomeSkeleton />
      ) : !result.ok ? (
        <StatusPanel
          tone="error"
          title="오늘 할 일을 불러오지 못했어요."
          body="잠시 후 다시 시도해 주세요. 접수 내용은 지워지지 않았어요."
        >
          <button
            type="button"
            className={`${auth.button} ${auth.secondary} ${auth.full}`}
            onClick={() => void reload()}
          >
            다시 시도
          </button>
        </StatusPanel>
      ) : (
        <HomeContent
          inquiries={result.data}
          businessName={businessName}
          now={loadedAt}
        />
      )}

      <OwnerTabBar current="today" />
    </main>
  );
}

function HomeContent({
  inquiries,
  businessName,
  now,
}: {
  inquiries: InquirySummary[];
  businessName: string;
  now: number;
}) {
  // 홈 건수와 접수함 '확인 필요' 탭 건수는 같은 함수로 셉니다.
  const counts = countByTab(inquiries);
  const checks = filterByTab(inquiries, "OWNER_CHECK");
  const visits = todayVisits(inquiries, now);
  const remaining = visits.filter((v) => v.reservation!.endAt > now).length;
  const intakeCount = inquiries.filter((i) => i.status === "AI_INTAKE").length;

  return (
    <>
      <div>
        <h1 className={auth.title}>{businessName}</h1>
        <p className={auth.description}>{formatTodayHeader(now)}</p>
      </div>

      <section className={auth.section} aria-labelledby="home-checks">
        <div className={styles.groupHeader}>
          <h2 id="home-checks" className={auth.sectionTitle}>
            확인할 일
          </h2>
          <Link href="/owner/inquiries" className={styles.groupCount}>
            {counts.OWNER_CHECK}건 · 전체 보기
          </Link>
        </div>
        {checks.length === 0 ? (
          <p className={auth.info}>
            지금 확인할 일은 없어요. 새 문의는 덕구가 먼저 접수해요.
          </p>
        ) : (
          <ul className={styles.cardList}>
            {checks.map((inquiry) => (
              <li key={inquiry.id}>
                <CheckCard inquiry={inquiry} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={auth.section} aria-labelledby="home-visits">
        <div className={styles.groupHeader}>
          <h2 id="home-visits" className={auth.sectionTitle}>
            오늘 방문
          </h2>
          <span className={styles.groupCount}>
            {visits.length === 0
              ? "없음"
              : remaining === 0
                ? "오늘 방문 끝"
                : `남은 ${remaining}곳`}
          </span>
        </div>
        {visits.length === 0 ? (
          <p className={auth.info}>오늘 잡힌 방문은 없어요.</p>
        ) : (
          <ul className={styles.cardList}>
            {visits.map((visit) => (
              <li key={visit.id}>
                <Link
                  href={`/owner/inquiries/${visit.id}`}
                  className={styles.inquiryCard}
                >
                  <span className={styles.cardTop}>
                    <span className={styles.cardTitle}>
                      {formatClock(visit.reservation!.startAt)} ·{" "}
                      {visit.customerLabel}
                    </span>
                    <span
                      className={`${styles.badge} ${
                        visit.reservation!.changeRequest
                          ? styles.badgeAttention
                          : styles.badgeSuccess
                      }`}
                    >
                      {visit.reservation!.changeRequest
                        ? "변경 요청 · 예약 유지"
                        : "예약 확정"}
                    </span>
                  </span>
                  <span className={styles.cardNote}>
                    {areaOf(visit.reservation!.address)} · {visit.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/owner/inquiries"
        className={`${auth.card} ${styles.plainLink}`}
      >
        <span className={auth.cardLabel}>덕구가 접수 중</span>
        <span className={auth.cardValue}>
          {intakeCount === 0
            ? "지금 접수 중인 문의는 없어요"
            : `${intakeCount}건 · 고객에게 사진과 증상을 받고 있어요`}
        </span>
      </Link>

      <Link href="/owner/link" className={`${auth.card} ${styles.plainLink}`}>
        <span className={auth.cardLabel}>우리 업체 문의 링크</span>
        <span className={auth.cardValue}>고객에게 링크 보내기 ›</span>
      </Link>
    </>
  );
}

function CheckCard({ inquiry, now }: { inquiry: InquirySummary; now: number }) {
  const reason = inquiry.ownerCheckReason!;
  const change = inquiry.reservation?.changeRequest;

  return (
    <div className={`${styles.inquiryCard} ${styles.attention}`}>
      <span className={styles.cardTop}>
        <span className={styles.cardTitle}>
          {inquiry.customerLabel} · {inquiry.title}
        </span>
        <span className={`${styles.badge} ${styles.badgeAttention}`}>
          {OWNER_CHECK_REASON_LABEL[reason]}
        </span>
      </span>
      {reason === "SCHEDULE_CHANGE" && inquiry.reservation && change ? (
        <span className={styles.cardNote}>
          현재{" "}
          {formatVisitRange(
            inquiry.reservation.startAt,
            inquiry.reservation.endAt,
            now,
          )}{" "}
          → 요청 {change.requestedLabel}
        </span>
      ) : (
        <span className={styles.cardNote}>{inquiry.note}</span>
      )}
      <Link
        href={`/owner/inquiries/${inquiry.id}`}
        className={styles.cardLink}
        aria-label={`${inquiry.customerLabel} 문의 확인하기`}
      >
        확인하기 ›
      </Link>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" className={styles.groups}>
      <span className={styles.srOnly}>오늘 할 일을 불러오는 중이에요.</span>
      {[0, 1, 2].map((n) => (
        <div key={n} className={styles.skeletonCard} aria-hidden="true">
          <span className={`${styles.skeleton} ${styles.skeletonShort}`} />
          <span className={`${styles.skeleton} ${styles.skeletonMid}`} />
          <span className={styles.skeleton} />
        </div>
      ))}
    </div>
  );
}
