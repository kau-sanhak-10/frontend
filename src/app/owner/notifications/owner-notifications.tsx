"use client";

// 업무 알림 확인 (B-26)
// - 안전 확인 요청은 일반 알림과 따로 맨 위에 보여 줍니다.
// - 알림을 누르면 읽음으로 바꾸고 해당 문의·예약 상세로 이동합니다.
// - 읽음은 업무 처리 완료가 아닙니다. 문의·예약 상태는 바뀌지 않습니다.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { OwnerGate } from "../_components/owner-gate";
import { OwnerTabBar } from "../_components/owner-tab-bar";
import { StatusPanel } from "../_components/status-panel";
import { useLoad } from "../_components/use-load";
import { WorkNotReady } from "../_components/work-not-ready";
import auth from "../_components/owner-auth.module.css";
import styles from "../_components/owner-inquiries.module.css";
import work from "../_components/owner-work.module.css";
import { DetailSkeleton } from "../inquiries/[id]/detail-states";
import { formatReceivedAt } from "@/lib/owner-inquiries/format";
import {
  NOTIFICATION_LABEL,
  notificationHref,
  splitNotifications,
  unreadCount,
} from "@/lib/owner-work/rules";
import {
  loadNotifications,
  readNotification,
  workSourceOf,
  type WorkSource,
} from "@/lib/owner-work/source";
import type { OwnerNotification } from "@/lib/owner-work/types";

export function OwnerNotifications() {
  return (
    <OwnerGate screenName="알림">
      {({ source }) => {
        const ws = workSourceOf(source);
        return (
          <main className={`${auth.page} ${styles.withTabBar}`}>
            <header className={styles.detailHeader}>
              <Link
                href="/owner"
                className={auth.backLink}
                aria-label="홈으로 돌아가기"
              >
                ‹
              </Link>
              <h1 className={auth.headerTitle}>알림</h1>
              <Link
                href="/owner/notifications/settings"
                className={styles.headerAction}
              >
                설정
              </Link>
            </header>
            {ws ? (
              <NotificationsBody source={ws} />
            ) : (
              <WorkNotReady what="알림" />
            )}
            <OwnerTabBar current="today" />
          </main>
        );
      }}
    </OwnerGate>
  );
}

function NotificationsBody({ source }: { source: WorkSource }) {
  const router = useRouter();
  const fetcher = useCallback(() => loadNotifications(source), [source]);
  const { result, loadedAt, reload } = useLoad(fetcher);
  // 이 화면에서 읽음 처리한 알림 (다시 불러오기 전까지 화면에 반영)
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());

  if (result === null) return <DetailSkeleton />;
  if (!result.ok) {
    return (
      <StatusPanel
        tone="error"
        title="알림을 불러오지 못했어요."
        body="확인 필요 문의는 접수함에서 그대로 볼 수 있어요."
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

  const list = result.data.map((n) =>
    readIds.has(n.id) && n.readAt === null ? { ...n, readAt: loadedAt } : n,
  );
  const { safety, general } = splitNotifications(list);

  async function open(n: OwnerNotification) {
    if (n.readAt === null) {
      setReadIds((prev) => new Set(prev).add(n.id));
      // 읽음 저장에 실패해도 이동은 막지 않습니다. 다음에 다시 열면 안 읽음으로 보여요.
      await readNotification(source, n.id);
    }
    router.push(notificationHref(n));
  }

  if (list.length === 0) {
    return (
      <StatusPanel
        title="새 알림이 없어요."
        body="신규 예약·확인 필요 문의·예약 변경·취소가 생기면 여기에 알려 드려요."
      />
    );
  }

  return (
    <div className={styles.groups}>
      <p className={auth.hint}>
        안 읽은 알림 {unreadCount(list)}건 · 읽음 표시는 업무 처리와 별개예요.
        실제 처리는 상세 화면에서 해 주세요.
      </p>
      {safety.length > 0 ? (
        <NotificationGroup
          title="안전 확인 요청"
          items={safety}
          now={loadedAt}
          onOpen={open}
        />
      ) : null}
      {general.length > 0 ? (
        <NotificationGroup
          title="업무 알림"
          items={general}
          now={loadedAt}
          onOpen={open}
        />
      ) : null}
    </div>
  );
}

function NotificationGroup({
  title,
  items,
  now,
  onOpen,
}: {
  title: string;
  items: OwnerNotification[];
  now: number;
  onOpen: (n: OwnerNotification) => void;
}) {
  return (
    <section className={auth.section} aria-label={title}>
      <div className={styles.groupHeader}>
        <h2 className={auth.sectionTitle}>{title}</h2>
        <span className={styles.groupCount}>{items.length}건</span>
      </div>
      <ul className={styles.cardList}>
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={`${work.notiButton} ${n.safety ? work.notiSafety : n.readAt === null ? work.notiUnread : ""}`}
              onClick={() => void onOpen(n)}
            >
              <span className={styles.cardTop}>
                <span className={styles.cardTitle}>
                  {n.readAt === null ? (
                    <>
                      <span className={work.unreadDot} aria-hidden="true" />{" "}
                      <span className={styles.srOnly}>안 읽음 · </span>
                    </>
                  ) : null}
                  {n.title}
                </span>
                <span
                  className={`${styles.badge} ${n.safety ? work.badgeSafety : ""}`}
                >
                  {n.safety ? "안전" : NOTIFICATION_LABEL[n.event]}
                </span>
              </span>
              <span className={styles.cardNote}>{n.body}</span>
              <span className={styles.cardTime}>
                {formatReceivedAt(n.createdAt, now)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
