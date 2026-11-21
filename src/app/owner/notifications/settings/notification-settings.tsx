"use client";

// 알림 수신 설정 (B-27)
// - 이 브라우저가 Web Push를 지원하는지, 권한이 어떤 상태인지 보여 줍니다.
// - 알림 종류별로 외부 알림을 켜고 끕니다. 중요 알림을 끄면 경고합니다.
// - 외부 알림을 꺼도 앱 안의 확인 필요 목록과 알림 목록은 그대로 보입니다.
// - 실제 로그인에서는 이 브라우저를 서버 푸시(BE-14)에 구독·해제합니다. (FE-16)
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OwnerGate } from "../../_components/owner-gate";
import { StatusPanel } from "../../_components/status-panel";
import { useLoad } from "../../_components/use-load";
import auth from "../../_components/owner-auth.module.css";
import styles from "../../_components/owner-inquiries.module.css";
import work from "../../_components/owner-work.module.css";
import { DetailSkeleton } from "../../inquiries/[id]/detail-states";
import {
  IMPORTANT_EVENTS,
  NOTIFICATION_LABEL,
  prefsWarning,
} from "@/lib/owner-work/rules";
import type { InquirySource } from "@/lib/owner-inquiries/source";
import {
  currentSubscription,
  detectPush,
  disablePush,
  enablePush,
  type PushState,
} from "@/lib/owner-work/push";
import { loadPrefs, savePrefs } from "@/lib/owner-work/source";
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

export function NotificationSettings() {
  return (
    <OwnerGate screenName="알림 설정">
      {({ source }) => (
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
          {source.kind === "live" ? (
            <DevicePush token={source.token} />
          ) : (
            <DevicePermission />
          )}
          <PrefsSection source={source} />
        </main>
      )}
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
        예시 로그인에서는 실제 푸시 구독을 하지 않아요. 실제 로그인에서 알림을
        켜면 이 기기로 푸시가 와요.
      </p>
    </section>
  );
}

/** 브라우저 지원·권한 안내 (켤 수 없는 상태일 때 공통 문구) */
function PushStateNotice({ state }: { state: PushState }) {
  if (state === "denied") {
    return (
      <p className={work.failBox}>
        알림이 차단돼 있어요. 브라우저 주소창 왼쪽의 자물쇠(사이트 설정)에서
        알림을 &lsquo;허용&rsquo;으로 바꾼 뒤 다시 켜 주세요.
      </p>
    );
  }
  if (state === "NEEDS_INSTALL") {
    return (
      <p className={auth.info}>
        iPhone·iPad는 Safari 공유 버튼에서 &lsquo;홈 화면에 추가&rsquo;한 뒤, 홈
        화면의 일로 앱에서 알림을 켤 수 있어요.
      </p>
    );
  }
  return (
    <p className={auth.info}>
      이 브라우저는 외부 알림을 지원하지 않아요. 홈 화면 상단의
      &lsquo;알림&rsquo;에서 새 업무를 확인해 주세요.
    </p>
  );
}

const ENABLE_FAIL_TEXT = {
  DENIED:
    "알림을 허용하지 않아 켜지 못했어요. 브라우저 사이트 설정에서 알림을 허용해 주세요.",
  UNSUPPORTED:
    "이 브라우저는 외부 알림을 지원하지 않아요. 앱 안 알림 목록으로 확인해 주세요.",
  UNAVAILABLE:
    "지금은 서버에서 푸시 알림을 켤 수 없어요. 앱 안 알림 목록은 그대로 볼 수 있어요.",
  FAILED: "알림을 켜지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.",
} as const;

/** 실제 로그인: 이 브라우저 푸시 구독 켜기·끄기 (B-27 ①, FE-16) */
function DevicePush({ token }: { token: string }) {
  const [state, setState] = useState<PushState>(() => detectPush());
  // null: 확인 중
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "ok" | "fail";
    text: string;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    void currentSubscription().then((sub) => {
      if (alive) setSubscribed(sub !== null);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await enablePush(token);
      setState(detectPush());
      if (res.ok) {
        setSubscribed(true);
        setMessage({ tone: "ok", text: "이 기기에서 업무 알림을 받아요." });
      } else {
        setMessage({ tone: "fail", text: ENABLE_FAIL_TEXT[res.code] });
      }
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await disablePush(token);
      setSubscribed(false);
      setMessage(
        res.ok
          ? { tone: "ok", text: "이 기기 알림을 껐어요." }
          : {
              tone: "fail",
              text: "이 기기 알림은 껐지만 서버에 반영하지 못했어요. 혹시 알림이 오면 다시 꺼 주세요.",
            },
      );
    } finally {
      setBusy(false);
    }
  }

  const canUse = state === "default" || state === "granted";

  return (
    <section className={auth.section} aria-labelledby="device-permission">
      <h2 id="device-permission" className={auth.sectionTitle}>
        이 기기 알림
      </h2>
      {!canUse ? (
        <PushStateNotice state={state} />
      ) : subscribed === null ? (
        <p className={auth.info}>이 기기 알림 상태를 확인하는 중이에요…</p>
      ) : subscribed ? (
        <>
          <p className={work.okBox}>이 기기에서 업무 알림을 받고 있어요.</p>
          <button
            type="button"
            className={`${auth.button} ${auth.secondary} ${auth.full}`}
            disabled={busy}
            onClick={() => void turnOff()}
          >
            {busy ? "끄는 중…" : "이 기기 알림 끄기"}
          </button>
        </>
      ) : (
        <>
          <p className={auth.info}>
            알림을 켜면 새 예약·확인 필요 문의를 이 기기로 바로 알려 드려요.
          </p>
          <button
            type="button"
            className={`${auth.button} ${auth.primary} ${auth.full}`}
            disabled={busy}
            onClick={() => void turnOn()}
          >
            {busy ? "켜는 중…" : "이 기기에서 알림 켜기"}
          </button>
        </>
      )}
      {message ? (
        <p
          className={message.tone === "ok" ? work.okBox : work.failBox}
          role={message.tone === "ok" ? "status" : "alert"}
        >
          {message.text}
        </p>
      ) : null}
      <p className={auth.hint}>
        푸시 알림에는 고객 정보를 넣지 않아요. 누르면 알림 목록이 열려요.
        로그아웃하면 이 기기 알림도 함께 꺼져요.
      </p>
    </section>
  );
}

/** 알림 종류별 수신 여부 (B-27 ②·③) */
function PrefsSection({ source }: { source: InquirySource }) {
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
  source: InquirySource;
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
