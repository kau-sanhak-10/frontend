"use client";

import type { InquirySource } from "@/lib/owner-inquiries/source";

import Link from "next/link";
import { OwnerGate } from "../../../_components/owner-gate";
import {
  OwnerPhoto,
  PhotoRefreshContext,
} from "../../../_components/owner-photo";
import auth from "../../../_components/owner-auth.module.css";
import styles from "../../../_components/owner-inquiries.module.css";
import { DetailError, DetailSkeleton } from "../detail-states";
import { useInquiryDetail } from "../use-inquiry-detail";
import { HandlingPanel } from "./handling-panel";
import { formatReceivedAt } from "@/lib/owner-inquiries/format";
import type { InquiryDetail } from "@/lib/owner-inquiries/types";

const SENDER_LABEL = { CUSTOMER: "고객", DUKGU: "덕구", OWNER: "사장님" };

/** B04 · 고객과 대화 + 직접 응대·답장·덕구 재개·문의 종료 (FE-10) */
export function InquiryChatView({ inquiryId }: { inquiryId: string }) {
  return (
    <OwnerGate screenName="고객과 대화">
      {({ source }) => <ChatBody source={source} inquiryId={inquiryId} />}
    </OwnerGate>
  );
}

function ChatBody({
  source,
  inquiryId,
}: {
  source: InquirySource;
  inquiryId: string;
}) {
  const { result, loadedAt, reload, refresh } = useInquiryDetail(
    source,
    inquiryId,
  );

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
        <PhotoRefreshContext.Provider value={() => void refresh()}>
          <ChatStatus inquiry={result.data} />
          <MessageList inquiry={result.data} now={loadedAt} />
          <HandlingPanel
            source={source}
            inquiry={result.data}
            now={loadedAt}
            refresh={refresh}
          />
        </PhotoRefreshContext.Provider>
      )}
    </main>
  );
}

/** 지금 누가 응대하는지와 고객의 사람 응대 요청 (B-15·C-10) */
function ChatStatus({ inquiry }: { inquiry: InquiryDetail }) {
  const handoff = inquiry.activeHandoff;
  const title = inquiry.closed
    ? "종료된 문의"
    : inquiry.handler === "OWNER"
      ? "사장님이 직접 응대 중"
      : inquiry.status === "OWNER_CHECK"
        ? "사장님 확인 필요"
        : "덕구가 응대 중";
  const note = inquiry.closed
    ? "덕구 응대를 멈췄어요. 대화 기록은 그대로 남아 있어요."
    : inquiry.handler === "OWNER"
      ? "덕구의 자동 답변과 자동 예약은 멈춰 있어요."
      : inquiry.status === "OWNER_CHECK"
        ? "덕구가 접수를 멈추고 사장님 확인을 기다리고 있어요."
        : "덕구가 고객에게 답하고 있어요.";

  return (
    <section className={styles.chatStatus} aria-live="polite">
      <p className={styles.cardTitle}>
        {inquiry.customerLabel} · {title}
      </p>
      <p className={styles.cardNote}>{note}</p>
      {handoff ? (
        <p className={styles.handoffNote}>
          {handoff.type === "CALLBACK" ? (
            <>
              고객이 전화 회신을 요청했어요
              {handoff.name ? ` · ${handoff.name}` : ""}
              {handoff.phone ? (
                <>
                  {" · "}
                  <a href={`tel:${handoff.phone}`}>{handoff.phone}</a>
                </>
              ) : null}
            </>
          ) : handoff.status === "WAITING" ? (
            "고객이 사장님과 직접 상담을 요청했어요."
          ) : (
            "고객의 직접 상담 요청을 처리하고 있어요."
          )}
        </p>
      ) : null}
    </section>
  );
}

function MessageList({
  inquiry,
  now,
}: {
  inquiry: InquiryDetail;
  now: number;
}) {
  const photoById = new Map(inquiry.photos.map((p) => [p.id, p]));

  return (
    <ol className={styles.messages} aria-label="대화 내용">
      {inquiry.messages.map((m) => {
        const photo = m.photoId ? photoById.get(m.photoId) : undefined;
        return (
          <li
            key={m.id}
            className={`${styles.message} ${m.from === "CUSTOMER" ? styles.fromCustomer : styles.fromUs}`}
          >
            <span className={styles.sender}>{SENDER_LABEL[m.from]}</span>
            {m.text ? (
              <p
                className={`${styles.bubble} ${m.from === "OWNER" ? styles.ownerBubble : ""}`}
              >
                {m.text}
              </p>
            ) : null}
            {photo ? (
              <OwnerPhoto key={photo.url} photo={photo} />
            ) : m.photoId ? (
              <p className={styles.bubble}>사진을 불러오지 못했어요.</p>
            ) : null}
            {m.delivery === "FAILED" ? (
              <span className={styles.sendFailed}>
                전송되지 않은 메시지예요.
              </span>
            ) : m.delivery === "PENDING" ? (
              <span className={styles.cardTime}>전송 중</span>
            ) : (
              <span className={styles.cardTime}>
                {formatReceivedAt(m.sentAt, now)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
