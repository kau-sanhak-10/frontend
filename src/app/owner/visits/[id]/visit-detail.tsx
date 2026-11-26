"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { OwnerGate } from "../../_components/owner-gate";
import { StatusPanel } from "../../_components/status-panel";
import { useLoad } from "../../_components/use-load";
import { WorkNotReady } from "../../_components/work-not-ready";
import auth from "../../_components/owner-auth.module.css";
import styles from "../../_components/owner-inquiries.module.css";
import work from "../../_components/owner-work.module.css";
import { DetailSkeleton } from "../../inquiries/[id]/detail-states";
import { VisitCompletion } from "./visit-completion";
import { VisitNote } from "./visit-note";
import { formatVisitRange } from "@/lib/owner-inquiries/format";
import {
  displayValue,
  splitSummary,
  SOURCE_LABEL,
} from "@/lib/owner-inquiries/rules";
import {
  loadInquiryDetail,
  type InquirySource,
} from "@/lib/owner-inquiries/source";
import { VISIT_STATUS_LABEL } from "@/lib/owner-work/rules";
import {
  loadVisit,
  workSourceOf,
  type WorkSource,
} from "@/lib/owner-work/source";
import type { Visit } from "@/lib/owner-work/types";

/** 방문 작업 상세 (B-23·B-24·B-25) */
export function VisitDetailView({ visitId }: { visitId: string }) {
  return (
    <OwnerGate screenName="방문 작업">
      {({ source }) => {
        const ws = workSourceOf(source);
        return (
          <main className={auth.page}>
            <header className={styles.detailHeader}>
              <Link
                href="/owner/visits"
                className={auth.backLink}
                aria-label="방문 일정으로 돌아가기"
              >
                ‹
              </Link>
              <h1 className={auth.headerTitle}>방문 작업</h1>
            </header>
            {ws ? (
              <VisitBody
                workSource={ws}
                inquirySource={source}
                visitId={visitId}
              />
            ) : (
              <WorkNotReady what="방문 작업" />
            )}
          </main>
        );
      }}
    </OwnerGate>
  );
}

function VisitBody({
  workSource,
  inquirySource,
  visitId,
}: {
  workSource: WorkSource;
  inquirySource: InquirySource;
  visitId: string;
}) {
  const fetcher = useCallback(
    () => loadVisit(workSource, visitId),
    [workSource, visitId],
  );
  const { result, loadedAt, reload } = useLoad(fetcher);
  // 완료·정정 후 서버가 돌려준 최신 예약 (다시 불러오면 비웁니다)
  const [updated, setUpdated] = useState<Visit | null>(null);

  if (result === null) return <DetailSkeleton />;
  if (!result.ok) {
    return result.code === "NOT_FOUND" ? (
      <StatusPanel
        title="방문 작업을 찾을 수 없어요."
        body="취소됐거나 볼 수 있는 권한이 없는 예약이에요."
      >
        <Link
          href="/owner/visits"
          className={`${auth.button} ${auth.secondary} ${auth.full}`}
        >
          방문 일정으로 돌아가기
        </Link>
      </StatusPanel>
    ) : (
      <StatusPanel
        tone="error"
        title="방문 작업을 불러오지 못했어요."
        body="잠시 후 다시 시도해 주세요."
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

  const visit = updated?.id === result.data.id ? updated : result.data;

  return (
    <div className={styles.groups}>
      <section className={auth.section} aria-labelledby="visit-info">
        <div className={styles.cardTop}>
          <h2 id="visit-info" className={styles.detailTitle}>
            {visit.customerLabel} · {visit.workType}
          </h2>
          <span
            className={`${styles.badge} ${visit.status === "CONFIRMED" ? styles.badgeSuccess : ""}`}
          >
            {VISIT_STATUS_LABEL[visit.status]}
          </span>
        </div>
        <dl className={styles.fieldList}>
          <div className={styles.field}>
            <dt className={styles.fieldLabel}>방문 시간</dt>
            <dd className={styles.fieldValue}>
              {formatVisitRange(visit.startAt, visit.endAt, loadedAt)}
            </dd>
          </div>
          <div className={styles.field}>
            <dt className={styles.fieldLabel}>주소</dt>
            <dd className={styles.fieldValue}>
              {visit.address}
              <span className={work.blockNote}>
                주소가 틀렸다면 예약 변경 절차로 고쳐 주세요.
              </span>
            </dd>
          </div>
          <div className={styles.field}>
            <dt className={styles.fieldLabel}>연락처</dt>
            <dd className={styles.fieldValue}>
              {visit.contactPhone ? (
                <a href={`tel:${visit.contactPhone.replaceAll("-", "")}`}>
                  {visit.contactPhone}
                </a>
              ) : (
                "아직 없음"
              )}
            </dd>
          </div>
        </dl>
      </section>

      {visit.inquiryId ? (
        <InquiryInfo source={inquirySource} inquiryId={visit.inquiryId} />
      ) : (
        <p className={auth.info}>
          사장님이 직접 등록한 예약이라 연결된 고객 문의가 없어요.
        </p>
      )}

      <VisitNote source={workSource} visitId={visit.id} />

      <VisitCompletion
        source={workSource}
        visit={visit}
        onChanged={setUpdated}
      />
    </div>
  );
}

/**
 * 고객 문의의 증상·제품정보·사진 (B-23 ②)
 * 접수 상세와 같은 데이터를 불러와서, 문의에서 고친 최신 정보가 그대로 보입니다.
 */
function InquiryInfo({
  source,
  inquiryId,
}: {
  source: InquirySource;
  inquiryId: string;
}) {
  const fetcher = useCallback(
    () => loadInquiryDetail(source, inquiryId),
    [source, inquiryId],
  );
  const { result, reload } = useLoad(fetcher);

  if (result === null) {
    return (
      <p className={auth.info} aria-busy="true">
        고객 문의를 불러오는 중이에요…
      </p>
    );
  }
  if (!result.ok) {
    // 문의를 못 불러와도 방문 정보·메모·완료 처리는 그대로 쓸 수 있게 둡니다.
    return (
      <div className={auth.notice} role="alert">
        고객 문의를 불러오지 못했어요.{" "}
        <button
          type="button"
          className={`${auth.button} ${auth.secondary} ${auth.small}`}
          onClick={() => void reload()}
        >
          다시 시도
        </button>
      </div>
    );
  }

  const inquiry = result.data;
  const { product } = splitSummary(inquiry.summary);
  const symptom = inquiry.summary.find((f) => f.key === "symptom");

  return (
    <section className={styles.infoCard} aria-labelledby="visit-inquiry">
      <div className={styles.cardTop}>
        <h2 id="visit-inquiry" className={styles.infoCardTitle}>
          고객 문의
        </h2>
        <Link
          href={`/owner/inquiries/${encodeURIComponent(inquiry.id)}`}
          className={styles.headerAction}
        >
          접수 상세
        </Link>
      </div>
      <dl className={styles.fieldList}>
        <div className={styles.field}>
          <dt className={styles.fieldLabel}>증상</dt>
          <dd className={styles.fieldValue}>
            {symptom ? displayValue(symptom) : inquiry.customerDescription}
          </dd>
        </div>
        {product.map((f) => {
          const unconfirmed = f.state === "UNCONFIRMED" || f.value === null;
          return (
            <div key={f.key} className={styles.field}>
              <dt className={styles.fieldLabel}>
                {f.label} · {SOURCE_LABEL[f.source]}
              </dt>
              <dd
                className={`${styles.fieldValue} ${unconfirmed ? styles.unconfirmed : ""}`}
              >
                {displayValue(f)}
                {f.state === "INTERPRETATION" ? (
                  <span className={styles.interpretTag}>추정 · 확정 아님</span>
                ) : null}
              </dd>
            </div>
          );
        })}
        <div className={styles.field}>
          <dt className={styles.fieldLabel}>사진</dt>
          <dd className={styles.fieldValue}>
            {inquiry.photos.length > 0 ? (
              <Link href={`/owner/inquiries/${encodeURIComponent(inquiry.id)}`}>
                {inquiry.photos.length}장 · 접수 상세에서 보기
              </Link>
            ) : (
              "없음"
            )}
          </dd>
        </div>
      </dl>
      <p className={styles.fieldNote}>
        접수 정보에서 고친 최신 내용이에요. 확인되지 않은 값은 미확인으로
        보여요.
      </p>
    </section>
  );
}
