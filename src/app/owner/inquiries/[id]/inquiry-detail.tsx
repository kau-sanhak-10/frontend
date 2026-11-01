"use client";

import Link from "next/link";
import { OwnerGate } from "../../_components/owner-gate";
import auth from "../../_components/owner-auth.module.css";
import styles from "../../_components/owner-inquiries.module.css";
import { DetailError, DetailSkeleton } from "./detail-states";
import { useInquiryDetail } from "./use-inquiry-detail";
import {
  OWNER_CHECK_REASON_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  displayValue,
  groupOf,
  needsOwnerCheck,
  splitSummary,
} from "@/lib/owner-inquiries/rules";
import {
  formatClock,
  formatReceivedAt,
  formatVisitRange,
} from "@/lib/owner-inquiries/format";
import type {
  InquiryDetail,
  InquiryPhoto,
  SummaryField,
} from "@/lib/owner-inquiries/types";

export function InquiryDetailView({ inquiryId }: { inquiryId: string }) {
  return (
    <OwnerGate screenName="접수 상세">
      {({ businessId }) => (
        <DetailBody businessId={businessId} inquiryId={inquiryId} />
      )}
    </OwnerGate>
  );
}

function DetailBody({
  businessId,
  inquiryId,
}: {
  businessId: string;
  inquiryId: string;
}) {
  const { result, loadedAt, reload } = useInquiryDetail(businessId, inquiryId);

  return (
    <main className={auth.page}>
      <header className={styles.detailHeader}>
        <Link
          href="/owner/inquiries"
          className={auth.backLink}
          aria-label="접수함으로 돌아가기"
        >
          ‹
        </Link>
        <h1 className={auth.headerTitle}>접수 상세</h1>
        {result?.ok ? (
          <Link
            href={`/owner/inquiries/${inquiryId}/chat`}
            className={styles.headerAction}
          >
            대화
          </Link>
        ) : null}
      </header>

      {result === null ? (
        <DetailSkeleton />
      ) : !result.ok ? (
        <DetailError code={result.code} onRetry={() => void reload()} />
      ) : (
        <DetailContent inquiry={result.data} now={loadedAt} />
      )}
    </main>
  );
}

function DetailContent({
  inquiry,
  now,
}: {
  inquiry: InquiryDetail;
  now: number;
}) {
  const { product, intake } = splitSummary(inquiry.summary);
  const group = groupOf(inquiry);
  const photoById = new Map(inquiry.photos.map((p) => [p.id, p]));

  return (
    <>
      <section className={styles.detailTitle}>
        <div className={styles.cardTop}>
          <h2 className={styles.detailName}>
            {inquiry.customerLabel} · {inquiry.title}
          </h2>
          <span
            className={`${styles.badge} ${group === "OWNER_CHECK" ? styles.badgeAttention : group === "RESERVED" ? styles.badgeSuccess : ""}`}
          >
            {STATUS_LABEL[group]}
          </span>
        </div>
        <p className={styles.cardTime}>
          {formatReceivedAt(inquiry.receivedAt, now)} 접수
        </p>
      </section>

      {needsOwnerCheck(inquiry) && inquiry.ownerCheckReason ? (
        <p className={auth.notice} role="status">
          <strong>
            {OWNER_CHECK_REASON_LABEL[inquiry.ownerCheckReason]}이 필요해요.
          </strong>{" "}
          {inquiry.note}
        </p>
      ) : null}

      {inquiry.summaryUpdatedAt === null ? (
        <p className={auth.info} role="status">
          접수 요약을 만들지 못했어요. 대화와 사진은 그대로 볼 수 있어요.
        </p>
      ) : (
        <>
          {product.length > 0 ? (
            <section className={styles.infoCard}>
              <h3 className={styles.infoCardTitle}>제품 정보</h3>
              <div className={styles.productRow}>
                <PhotoThumb photo={inquiry.photos[0]} />
                <dl className={styles.fieldList}>
                  {product.map((f) => (
                    <SummaryRow key={f.key} field={f} photoById={photoById} />
                  ))}
                </dl>
              </div>
            </section>
          ) : null}

          {intake.length > 0 ? (
            <section className={styles.infoCard}>
              <h3 className={styles.infoCardTitle}>접수 정보</h3>
              <dl className={styles.fieldList}>
                {intake.map((f) => (
                  <SummaryRow key={f.key} field={f} photoById={photoById} />
                ))}
              </dl>
            </section>
          ) : null}

          <p className={styles.cardTime}>
            요약 갱신 {formatClock(inquiry.summaryUpdatedAt)}
          </p>
        </>
      )}

      <section className={styles.quoteBlock}>
        <h3 className={styles.quoteLabel}>고객 설명</h3>
        <p className={styles.quote}>“{inquiry.customerDescription}”</p>
      </section>

      {inquiry.reservation ? (
        <section className={styles.infoCard}>
          <h3 className={styles.infoCardTitle}>방문 예약</h3>
          <dl className={styles.fieldList}>
            <div className={styles.field}>
              <dt className={styles.fieldLabel}>
                {inquiry.reservation.changeRequest ? "현재 예약" : "확정 시간"}
              </dt>
              <dd className={styles.fieldValue}>
                {formatVisitRange(
                  inquiry.reservation.startAt,
                  inquiry.reservation.endAt,
                  now,
                )}
              </dd>
            </div>
            {inquiry.reservation.changeRequest ? (
              <div className={styles.field}>
                <dt className={styles.fieldLabel}>고객 요청</dt>
                <dd className={`${styles.fieldValue} ${styles.unconfirmed}`}>
                  {inquiry.reservation.changeRequest.requestedLabel}
                </dd>
              </div>
            ) : null}
            <div className={styles.field}>
              <dt className={styles.fieldLabel}>주소</dt>
              <dd className={styles.fieldValue}>
                {inquiry.reservation.address}
              </dd>
            </div>
          </dl>
          <p className={auth.hint}>
            {inquiry.reservation.changeRequest
              ? "변경 시간이 확정되기 전까지 기존 예약은 유지돼요."
              : "예약은 확정됐어요."}
          </p>
        </section>
      ) : null}

      <div className={auth.footer}>
        <button
          type="button"
          className={`${auth.button} ${auth.primary} ${auth.full}`}
          disabled
          aria-describedby="edit-pending"
        >
          접수 정보 수정
        </button>
        <p id="edit-pending" className={auth.hint}>
          접수 정보 수정은 준비 중이에요.
        </p>
      </div>
    </>
  );
}

function SummaryRow({
  field,
  photoById,
}: {
  field: SummaryField;
  photoById: Map<string, InquiryPhoto>;
}) {
  const unconfirmed = field.state === "UNCONFIRMED" || field.value === null;
  const interpretation = field.state === "INTERPRETATION";

  return (
    <div className={styles.field}>
      <dt className={styles.fieldLabel}>
        {field.label} · {SOURCE_LABEL[field.source]}
      </dt>
      <dd
        className={`${styles.fieldValue} ${unconfirmed ? styles.unconfirmed : ""}`}
      >
        {displayValue(field)}
        {interpretation ? (
          <span className={styles.interpretTag}>매뉴얼 해석</span>
        ) : null}
      </dd>
      {field.reason || field.evidence ? (
        <dd className={styles.fieldNote}>
          {field.reason ? <span>{field.reason}</span> : null}
          {field.evidence ? (
            <details className={styles.evidence}>
              <summary>근거 보기</summary>
              <EvidenceText field={field} photoById={photoById} />
            </details>
          ) : null}
        </dd>
      ) : null}
    </div>
  );
}

function EvidenceText({
  field,
  photoById,
}: {
  field: SummaryField;
  photoById: Map<string, InquiryPhoto>;
}) {
  const ev = field.evidence;
  if (!ev) return null;
  if (ev.type === "MESSAGE") return <p>고객 메시지: “{ev.quote}”</p>;
  if (ev.type === "MANUAL") {
    return (
      <p>
        {ev.title} · {ev.location}
      </p>
    );
  }
  const photo = photoById.get(ev.photoId);
  return <p>고객 사진: {photo ? photo.alt : "사진을 찾을 수 없어요"}</p>;
}

function PhotoThumb({ photo }: { photo?: InquiryPhoto }) {
  if (!photo) {
    return (
      <div className={styles.photoThumb} aria-label="사진 없음">
        사진 없음
      </div>
    );
  }
  if (!photo.url) {
    // 목업에는 실제 사진이 없어서 자리만 보여 줍니다.
    return (
      <div className={styles.photoThumb} role="img" aria-label={photo.alt}>
        고객 사진
      </div>
    );
  }
  return (
    // 서버가 준 사진 주소를 그대로 씁니다. (외부 주소라 next/image 대신 img)
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.photoThumb} src={photo.url} alt={photo.alt} />
  );
}
