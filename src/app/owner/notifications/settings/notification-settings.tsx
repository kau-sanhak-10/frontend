"use client";

// 알림 수신 설정 (B-27)
// - 이 브라우저가 Web Push를 지원하는지, 권한이 어떤 상태인지 보여 줍니다.
// - 알림 종류별로 외부 알림을 켜고 끕니다. 중요 알림을 끄면 경고합니다.
// - 외부 알림을 꺼도 앱 안의 확인 필요 목록과 알림 목록은 그대로 보입니다.
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
import {
  IMPORTANT_EVENTS,
  NOTIFICATION_LABEL,
  prefsWarning,
} from "@/lib/owner-work/rules";
import {
  loadPrefs,
  savePrefs,
  workSourceOf,
  type WorkSource,
} from "@/lib/owner-work/source";
import type {
  NotificationEvent,
  NotificationPrefs,
} from "@/lib/owner-work/types";

const EVENTS: { event: NotificationEvent; hint: string }[] = [
  { event: "NEW_RESERVATION", hint: "고객이 방문 예약을 확정했을 때" },
  {
    event: "NEEDS_CHECK",
    hint: "안전 신호·필수정보 부족·직접 상담 요청이 있을 때",
  },
  { event: "CHANGE", hint: "고객이 방문시간 변경을 요청했을 때" },
  { event: "CANCEL", hint: "고객이 예약을 취소했을 때" },
];

/** 이 브라우저의 알림 지원·권한 상태 */
type PushState =
  "UNSUPPORTED" | "NEEDS_INSTALL" | "default" | "granted" | "denied";

function detectPush(): PushState {
  if (typeof window === "undefined") return "UNSUPPORTED";
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // iPhone·iPad는 홈 화면에 추가한 앱에서만 Web Push를 받을 수 있어요.
  if (ios && !standalone) return "NEEDS_INSTALL";
  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return "UNSUPPORTED";
  }
  return Notification.permission;
}

export function NotificationSettings() {
  return (
    <OwnerGate screenName="알림 설정">
      {({ source }) => {
        const ws = workSourceOf(source);
        return (
          <main className={auth.page}>
            <header className={styles.detailHeader}>
              <Link
                href="/owner/notifications"
                className={auth.backLink}
                aria-label="알림으로 돌아가기"
              >
                ‹
              </Link>
              <h1 className={auth.headerTitle}>알림 설정</h1>
            </header>
            <DevicePermission />
            {ws ? (
              <PrefsSection source={ws} />
            ) : (
              <WorkNotReady what="알림 종류 설정" />
            )}
          </main>
        );
      }}
    </OwnerGate>
  );
}

/** 이 기기 브라우저의 알림 권한 (B-27 ①) */
function DevicePermission() {
  const [state, setState] = useState<PushState>(() => detectPush());
  const [asking, setAsking] = useState(false);

  async function ask() {
    setAsking(true);
    try {
      setState(await Notification.requestPermission());
    } finally {
      setAsking(false);
    }
  }

  return (
    <section className={auth.section} aria-labelledby="device-permission">
      <h2 id="device-permission" className={auth.sectionTitle}>
        이 기기 알림
      </h2>
      {state === "granted" ? (
        <p className={work.okBox}>이 브라우저에서 알림을 받을 수 있어요.</p>
      ) : state === "denied" ? (
        <p className={work.failBox}>
          알림이 차단돼 있어요. 브라우저 주소창 왼쪽의 자물쇠(사이트 설정)에서
          알림을 &lsquo;허용&rsquo;으로 바꿔 주세요.
        </p>
      ) : state === "NEEDS_INSTALL" ? (
        <p className={auth.info}>
          iPhone·iPad는 Safari 공유 버튼에서 &lsquo;홈 화면에 추가&rsquo;한 뒤,
          홈 화면의 일로 앱에서 알림을 켤 수 있어요.
        </p>
      ) : state === "UNSUPPORTED" ? (
        <p className={auth.info}>
          이 브라우저는 외부 알림을 지원하지 않아요. 홈 화면 상단의
          &lsquo;알림&rsquo;에서 새 업무를 확인해 주세요.
        </p>
      ) : (
        <>
          <p className={auth.info}>
            알림을 허용하면 새 예약·확인 필요 문의를 바로 알려 드려요.
          </p>
          <button
            type="button"
            className={`${auth.button} ${auth.primary} ${auth.full}`}
            disabled={asking}
            onClick={() => void ask()}
          >
            {asking ? "권한을 묻는 중…" : "이 기기에서 알림 허용"}
          </button>
        </>
      )}
      <p className={auth.hint}>
        외부 알림 발송은 서버 연결 후 시작돼요. 지금은 앱 안 알림 목록으로
        확인해 주세요.
      </p>
    </section>
  );
}

/** 알림 종류별 수신 여부 (B-27 ②·③) */
function PrefsSection({ source }: { source: WorkSource }) {
  const fetcher = useCallback(() => loadPrefs(source), [source]);
  const { result, loadedAt, reload } = useLoad(fetcher);

  if (result === null) return <DetailSkeleton />;
  if (!result.ok) {
    return (
      <StatusPanel
        tone="error"
        title="알림 설정을 불러오지 못했어요."
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
  return <PrefsForm key={loadedAt} source={source} initial={result.data} />;
}

function PrefsForm({
  source,
  initial,
}: {
  source: WorkSource;
  initial: NotificationPrefs;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">(
    "idle",
  );
  const changed = EVENTS.some(({ event }) => draft[event] !== saved[event]);
  const warning = prefsWarning(draft);

  async function save() {
    setState("saving");
    const res = await savePrefs(source, draft);
    if (!res.ok) {
      // 바꾼 선택은 그대로 두고 다시 저장할 수 있게 합니다.
      setState("failed");
      return;
    }
    setSaved(res.data);
    setDraft(res.data);
    setState("saved");
  }

  return (
    <section className={auth.section} aria-labelledby="noti-types">
      <h2 id="noti-types" className={auth.sectionTitle}>
        받을 알림
      </h2>
      <div>
        {EVENTS.map(({ event, hint }) => (
          <label key={event} className={work.toggleRow}>
            <span className={work.toggleText}>
              <span className={styles.cardTitle}>
                {NOTIFICATION_LABEL[event]}
                {IMPORTANT_EVENTS.includes(event) ? " · 중요" : ""}
              </span>
              <span className={work.toggleHint}>{hint}</span>
            </span>
            <input
              type="checkbox"
              checked={draft[event]}
              onChange={(e) => {
                setDraft({ ...draft, [event]: e.target.checked });
                if (state === "saved") setState("idle");
              }}
            />
          </label>
        ))}
      </div>
      {warning ? (
        <p className={work.failBox} role="status">
          {warning}
        </p>
      ) : null}
      <p className={auth.hint}>
        외부 알림을 꺼도 앱 안의 확인 필요 목록과 알림 목록은 그대로 보여요.
      </p>
      {state === "failed" ? (
        <p className={work.failBox} role="alert">
          설정을 저장하지 못했어요. 선택한 내용은 그대로 있어요. 다시 시도해
          주세요.
        </p>
      ) : null}
      {state === "saved" ? (
        <p className={work.okBox} role="status">
          알림 설정을 저장했어요. 다음 알림부터 적용돼요.
        </p>
      ) : null}
      <button
        type="button"
        className={`${auth.button} ${auth.primary} ${auth.full}`}
        disabled={!changed || state === "saving"}
        onClick={() => void save()}
      >
        {state === "saving"
          ? "저장하는 중…"
          : state === "failed"
            ? "다시 저장"
            : "설정 저장"}
      </button>
    </section>
  );
}
