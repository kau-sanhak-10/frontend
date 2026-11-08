"use client";

import Link from "next/link";
import { OwnerGate } from "../../../_components/owner-gate";
import { OwnerPhoto } from "../../../_components/owner-photo";
import auth from "../../../_components/owner-auth.module.css";
import styles from "../../../_components/owner-inquiries.module.css";
import { DetailError, DetailSkeleton } from "../detail-states";
import { useInquiryDetail } from "../use-inquiry-detail";
import { formatReceivedAt } from "@/lib/owner-inquiries/format";
import type { InquiryDetail } from "@/lib/owner-inquiries/types";

const SENDER_LABEL = { CUSTOMER: "고객", DUKGU: "덕구", OWNER: "사장님" };

/** B04 · 고객과 대화 (이번 작업은 보기만. 메시지 보내기는 다른 작업) */
export function InquiryChatView({ inquiryId }: { inquiryId: string }) {
  return (
    <OwnerGate screenName="고객과 대화">
      {({ businessId }) => (
        <ChatBody businessId={businessId} inquiryId={inquiryId} />
      )}
    </OwnerGate>
  );
}

function ChatBody({
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
          href={`/owner/inquiries/${inquiryId}`}
          className={auth.backLink}
          aria-label="접수 상세로 돌아가기"
        >
          ‹
        </Link>
        <h1 className={auth.headerTitle}>고객과 대화</h1>
        {result?.ok ? (
          <Link
            href={`/owner/inquiries/${inquiryId}`}
            className={styles.headerAction}
          >
            접수
          </Link>
        ) : null}
      </header>

      {result === null ? (
        <DetailSkeleton />
      ) : !result.ok ? (
        <DetailError code={result.code} onRetry={() => void reload()} />
      ) : (
        <ChatContent inquiry={result.data} now={loadedAt} />
      )}
    </main>
  );
}

function ChatContent({
  inquiry,
  now,
}: {
  inquiry: InquiryDetail;
  now: number;
}) {
  const photoById = new Map(inquiry.photos.map((p) => [p.id, p]));

  return (
    <>
      <section className={styles.chatStatus}>
        <p className={styles.cardTitle}>
          {inquiry.customerLabel} ·{" "}
          {inquiry.status === "OWNER_HANDLING"
            ? "사장님이 응대 중"
            : inquiry.status === "AI_INTAKE"
              ? "덕구가 접수 중"
              : "대화 기록"}
        </p>
        <p className={styles.cardNote}>
          {inquiry.status === "OWNER_HANDLING"
            ? "덕구의 자동 답변은 잠시 멈췄어요."
            : "고객과 덕구가 나눈 대화예요."}
        </p>
      </section>

      <ol className={styles.messages} aria-label="대화 내용">
        {inquiry.messages.map((m) => {
          const photo = m.photoId ? photoById.get(m.photoId) : undefined;
          return (
            <li
              key={m.id}
              className={`${styles.message} ${m.from === "CUSTOMER" ? styles.fromCustomer : styles.fromUs}`}
            >
              <span className={styles.sender}>{SENDER_LABEL[m.from]}</span>
              {m.text ? <p className={styles.bubble}>{m.text}</p> : null}
              {photo ? (
                <OwnerPhoto key={photo.url} photo={photo} />
              ) : m.photoId ? (
                <p className={styles.bubble}>사진을 불러오지 못했어요.</p>
              ) : null}
              <span className={styles.cardTime}>
                {formatReceivedAt(m.sentAt, now)}
              </span>
            </li>
          );
        })}
      </ol>

      <p className={auth.info}>
        메시지 보내기와 덕구에게 다시 맡기기는 준비 중이에요. 지금은 대화 내용만
        볼 수 있어요.
      </p>
    </>
  );
}
