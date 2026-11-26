"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { OwnerGate } from "../_components/owner-gate";
import { OwnerTabBar } from "../_components/owner-tab-bar";
import { StatusPanel } from "../_components/status-panel";
import { useLoad } from "../_components/use-load";
import auth from "../_components/owner-auth.module.css";
import shared from "../_components/owner-inquiries.module.css";
import styles from "./schedule.module.css";
import { areaOf } from "@/lib/owner-inquiries/format";
import { ApiError } from "@/lib/api";
import {
  clearSession,
  getSessionSnapshot,
  snapshotToState,
} from "@/lib/owner-auth/session";
import { fetchInquiries } from "@/lib/owner-inquiries/mock-api";
import { sourceKey, type InquirySource } from "@/lib/owner-inquiries/source";
import type { LoadResult } from "@/lib/owner-inquiries/types";
import {
  loadOwnerSchedule,
  scheduleIssue,
  scheduleDate as keyOf,
  scheduleClock as formatClock,
  scheduleIso,
  seoul,
  shiftDay as addDays,
  type ScheduleItem as Item,
} from "@/lib/owner-schedule-api";
import { emptyVisitInfo, validateVisitInfo } from "@/lib/customer-intake";
import { createClientId } from "@/lib/customer-consultation";
import { MINUTE, checkSchedule } from "@/lib/owner-inquiries/schedule";
import { LiveScheduleForm } from "./live-schedule-form";

type Mode = "visit" | "block" | "detail" | "change" | "cancel" | "correct";
const headings: Record<Mode, string> = {
  visit: "일정 추가",
  block: "예약 불가 시간",
  detail: "방문 정보",
  change: "변경 시간 제안",
  cancel: "예약 취소 확인",
  correct: "완료 기록 정정",
};
const days = new Intl.DateTimeFormat("ko-KR", {
  timeZone: seoul,
  month: "long",
  day: "numeric",
  weekday: "long",
});
const weekdays = new Intl.DateTimeFormat("ko-KR", {
  weekday: "short",
  timeZone: seoul,
});
const toTime = (day: string, time: string) =>
  Date.parse(scheduleIso(day, time));

function weekStart(date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export function OwnerSchedule() {
  return (
    <OwnerGate screenName="일정">
      {({ source }) => <Schedule key={sourceKey(source)} source={source} />}
    </OwnerGate>
  );
}

type PreviewRows = Extract<
  Awaited<ReturnType<typeof fetchInquiries>>,
  { ok: true }
>["data"];
type ScheduleRows =
  | { kind: "mock"; inquiries: PreviewRows }
  | { kind: "live"; from: string; items: Item[] };

function travelLabel(travel: Item["travel"], timeline = false) {
  if (!travel || travel === "unknown") return "이동시간 확인 필요";
  const duration = `예상 이동 ${travel.minutes}분`;
  if (travel.distance !== undefined)
    return `${timeline ? `이전 현장에서 약 ${travel.minutes}분` : duration} · ${travel.distance}km (예시)`;
  return travel.conflict ? `${duration} · 이동시간 부족` : duration;
}

function Schedule({ source }: { source: InquirySource }) {
  const router = useRouter();
  const token = source.kind === "live" ? source.token : null;
  const businessId = source.kind === "mock" ? source.businessId : null;
  const [today] = useState(() => keyOf(Date.now()));
  const [selected, select] = useState("");
  const [week, setWeek] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadMessage, setLoadMessage] = useState("");
  const date = selected || today;
  const first = week || weekStart(today);
  const liveRange = token ? first : "";
  const handleError = useCallback(
    (error: unknown) => {
      if (!(error instanceof ApiError) || error.status !== 401 || !token)
        return;
      const current = snapshotToState(getSessionSnapshot());
      if (
        current.status === "active" &&
        current.session.accessToken === token
      ) {
        clearSession();
        router.replace("/owner/login?reason=expired");
      }
    },
    [token, router],
  );
  const fetcher = useCallback(async (): Promise<LoadResult<ScheduleRows>> => {
    if (!token && businessId) {
      const data = await fetchInquiries(businessId);
      return data.ok
        ? { ok: true, data: { kind: "mock", inquiries: data.data } }
        : data;
    }
    if (!token) return { ok: false, code: "LOAD_FAILED" };
    try {
      const items = await loadOwnerSchedule(
        token,
        liveRange,
        addDays(liveRange, 6),
      );
      return { ok: true, data: { kind: "live", from: liveRange, items } };
    } catch (error) {
      handleError(error);
      setLoadMessage(scheduleIssue(error));
      return { ok: false, code: "LOAD_FAILED" };
    }
  }, [businessId, token, liveRange, handleError]);
  const { result: response, reload } = useLoad(fetcher);
  const result =
    response?.ok &&
    response.data.kind === "live" &&
    response.data.from !== first
      ? null
      : response;
  const [edits, setEdits] = useState<Record<string, Item | null>>({});
  const [view, setView] = useState<{ mode: Mode; item?: Item } | null>(null);
  const [feedback, setFeedback] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const previousMode = useRef<Mode | null>(null);
  const mode = view?.mode ?? null;
  useEffect(() => {
    if (mode || previousMode.current) heading.current?.focus();
    previousMode.current = mode;
  }, [mode]);
  const items = new Map<string, Item>();
  if (result?.ok && result.data.kind === "live") {
    for (const item of result.data.items) items.set(item.id, item);
  } else if (result?.ok && result.data.kind === "mock") {
    for (const inquiry of result.data.inquiries) {
      const visit = inquiry.reservation;
      if (!visit) continue;
      items.set(inquiry.id, {
        id: inquiry.id,
        kind: "visit",
        startAt: visit.startAt,
        endAt: visit.endAt,
        name: inquiry.customerLabel,
        title: inquiry.title,
        address: visit.address,
        source: "AI 접수",
        status: visit.changeRequest
          ? "변경 요청"
          : inquiry.status === "COMPLETED"
            ? "완료"
            : "확정",
        travel: visit.changeRequest
          ? { distance: 8.4, minutes: 25 }
          : undefined,
      });
    }
    if (businessId === "biz-hanbit" && result.data.inquiries.length) {
      items.set("completed-example", {
        id: "completed-example",
        kind: "visit",
        startAt: toTime(today, "10:00"),
        endAt: toTime(today, "11:00"),
        name: "이○○",
        title: "보일러 점검",
        address: "능곡동 ○○빌라",
        status: "완료",
        source: "전화",
      });
      items.set("personal", {
        id: "personal",
        kind: "block",
        startAt: toTime(today, "18:00"),
        endAt: toTime(today, "19:00"),
        name: "개인 일정",
        title: "",
        status: "차단",
      });
    }
    for (const [id, item] of Object.entries(edits)) {
      if (item) items.set(id, item);
      else items.delete(id);
    }
  }
  const all = [...items.values()];
  const daily = all
    .filter((item) =>
      item.kind === "block"
        ? item.startAt < toTime(addDays(date, 1), "00:00") &&
          item.endAt > toTime(date, "00:00")
        : keyOf(item.startAt) === date,
    )
    .sort((a, b) => a.startAt - b.startAt);
  const visits = daily.filter(
    (item) => item.kind === "visit" && item.status !== "취소",
  );

  function save(id: string, item: Item | null, message: string) {
    setEdits((old) => ({ ...old, [id]: item }));
    if (item) {
      const savedDate = keyOf(item.startAt);
      if (savedDate !== date) {
        select(savedDate);
        setWeek(weekStart(savedDate));
      }
    }
    setFeedback(message);
    setView(null);
  }

  function savedLive(savedDate: string, message: string) {
    setFeedback(message);
    setView(null);
    select(savedDate);
    const nextWeek = weekStart(savedDate);
    if (nextWeek === first) void reload();
    else setWeek(nextWeek);
  }

  return (
    <main className={`${auth.page} ${shared.withTabBar} ${styles.page}`}>
      <header className={styles.header}>
        {view ? (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="일정으로 돌아가기"
            disabled={saving}
            onClick={() => {
              setView(null);
              if (token) void reload();
            }}
          >
            <Icon name="back" />
          </button>
        ) : null}
        <h1 className={auth.headerTitle} ref={heading} tabIndex={-1}>
          {view ? headings[view.mode] : "일정"}
        </h1>
        {!view && result?.ok ? (
          <button
            type="button"
            className={`${styles.iconButton} ${styles.add}`}
            aria-label="일정 추가"
            onClick={() => setView({ mode: "visit" })}
          >
            <Icon name="plus" />
          </button>
        ) : null}
      </header>

      {view ? (
        view.mode === "detail" && view.item ? (
          <section className={auth.section} aria-label="방문 정보">
            <h2 className={auth.title}>
              {view.item.name} · {view.item.title}
            </h2>
            <p className={auth.hint}>
              {days.format(view.item.startAt)} {formatClock(view.item.startAt)}–
              {formatClock(view.item.endAt)}
            </p>
            <p className={auth.hint}>{view.item.address}</p>
            {view.item.source ? (
              <p className={auth.hint}>접수 경로 · {view.item.source}</p>
            ) : null}
            <p className={auth.hint}>
              작업 {Math.round((view.item.endAt - view.item.startAt) / MINUTE)}
              분
            </p>
            <p className={auth.hint}>{travelLabel(view.item.travel)}</p>
            {view.item.memo ? (
              <p className={auth.info}>{view.item.memo}</p>
            ) : null}
            {view.item.inquiryId || view.item.id.startsWith("inq-") ? (
              <Link
                href={`/owner/inquiries/${view.item.inquiryId ?? view.item.id}`}
              >
                고객 접수 보기
              </Link>
            ) : null}
            {view.item.status === "완료" && !token ? (
              <button
                className={styles.secondary}
                onClick={() => setView({ mode: "correct", item: view.item })}
              >
                완료 기록 정정
              </button>
            ) : view.item.status === "확정" ||
              view.item.status === "변경 요청" ||
              view.item.status === "변경 제안" ? (
              <>
                <button
                  className={styles.secondary}
                  onClick={() => setView({ mode: "change", item: view.item })}
                >
                  변경 시간 제안
                </button>
                <button
                  className={styles.secondary}
                  onClick={() => setView({ mode: "cancel", item: view.item })}
                >
                  예약 취소
                </button>
              </>
            ) : view.item.status === "취소" ? (
              <p className={auth.info}>
                취소된 방문입니다. 일정 시간을 차지하지 않아요.
              </p>
            ) : null}
          </section>
        ) : token && view.mode !== "detail" && view.mode !== "correct" ? (
          <LiveScheduleForm
            key={`${view.mode}:${view.item?.id ?? date}`}
            token={token}
            mode={view.mode}
            item={view.item}
            date={date}
            open={(mode) => setView({ mode })}
            onSaved={savedLive}
            onPending={setSaving}
            onError={handleError}
          />
        ) : !token && view.mode !== "detail" ? (
          <ScheduleForm
            key={`${view.mode}:${view.item?.id ?? date}`}
            mode={view.mode}
            item={view.item}
            date={date}
            items={all}
            open={(mode) => setView({ mode })}
            save={save}
          />
        ) : null
      ) : (
        <>
          {feedback ? (
            <p className={auth.info} role="status">
              {feedback}
            </p>
          ) : null}
          {result === null ? (
            <p className={auth.info} role="status">
              일정을 불러오고 있어요.
            </p>
          ) : !result.ok ? (
            <StatusPanel
              tone="error"
              title="일정을 불러오지 못했어요."
              body={
                loadMessage || "다시 시도해 주세요. 기존 일정은 그대로예요."
              }
              icon={<Icon name="info" />}
            >
              <button
                className={styles.secondary}
                onClick={() => void reload()}
              >
                다시 시도
              </button>
            </StatusPanel>
          ) : (
            <>
              <section aria-label="날짜별 일정">
                <div className={styles.dateHeader}>
                  <div>
                    <h2 className={styles.dateTitle}>
                      {days.format(toTime(date, "12:00"))}
                    </h2>
                    <p className={auth.hint}>
                      방문 {visits.length}건 · 남은 방문{" "}
                      {visits.filter((item) => item.status !== "완료").length}건
                    </p>
                  </div>
                  <div className={styles.weekActions}>
                    <button
                      type="button"
                      onClick={() => {
                        const next = addDays(first, -7);
                        setWeek(next);
                        select(next);
                      }}
                    >
                      이전 주
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = addDays(first, 7);
                        setWeek(next);
                        select(next);
                      }}
                    >
                      다음 주
                    </button>
                  </div>
                </div>
                <div className={styles.week}>
                  {Array.from({ length: 7 }, (_, offset) =>
                    addDays(first, offset),
                  ).map((day) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={day === date}
                      aria-label={days.format(toTime(day, "12:00"))}
                      onClick={() => {
                        select(day);
                        setFeedback("");
                      }}
                    >
                      <span>{weekdays.format(toTime(day, "12:00"))}</span>
                      <strong>{Number(day.slice(-2))}</strong>
                    </button>
                  ))}
                </div>
              </section>
              {daily.length === 0 ? (
                <StatusPanel
                  title="잡힌 일정이 없어요."
                  body="전화로 받은 예약이나 개인 일정을 추가할 수 있어요."
                  icon={<Icon name="calendar" />}
                />
              ) : (
                <ol className={styles.timeline} aria-label="시간순 일정">
                  {daily.map((item) => (
                    <li key={item.id}>
                      {item.travel && item.status !== "취소" ? (
                        <p className={styles.travel}>
                          <Icon name="pin" />
                          {travelLabel(item.travel, true)}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className={styles.timelineRow}
                        onClick={() =>
                          setView({
                            mode: item.kind === "block" ? "block" : "detail",
                            item,
                          })
                        }
                      >
                        <span className={styles.time}>
                          <strong>{formatClock(item.startAt)}</strong>
                          <small>–{formatClock(item.endAt)}</small>
                        </span>
                        <span
                          className={styles.entry}
                          data-status={item.status}
                        >
                          <span className={styles.entryTitle}>
                            <strong>
                              {item.kind === "block" ? (
                                <>
                                  <Icon name="calendar" /> {item.name}
                                </>
                              ) : (
                                areaOf(item.address ?? "")
                              )}
                            </strong>
                            <small>
                              {item.status === "확정"
                                ? "예약 확정"
                                : item.status === "완료"
                                  ? "작업 완료"
                                  : item.status === "변경 요청" ||
                                      item.status === "변경 제안"
                                    ? `${item.status} · 예약 유지`
                                    : item.status}
                            </small>
                          </span>
                          <span>
                            {item.kind === "block"
                              ? "예약 불가 시간"
                              : item.address}
                          </span>
                          {item.kind === "visit" ? (
                            <span>
                              {item.name} · {item.title} · 작업{" "}
                              {Math.round((item.endAt - item.startAt) / MINUTE)}
                              분
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
          <OwnerTabBar current="schedule" />
        </>
      )}
    </main>
  );
}

function ScheduleForm({
  mode,
  item,
  date,
  items,
  open,
  save,
}: {
  mode: Exclude<Mode, "detail">;
  item?: Item;
  date: string;
  items: Item[];
  open: (mode: Mode) => void;
  save: (id: string, item: Item | null, message: string) => void;
}) {
  const [day, setDay] = useState(item ? keyOf(item.startAt) : date);
  const [start, setStart] = useState(
    item ? formatClock(item.startAt) : "14:00",
  );
  const [end, setEnd] = useState(item ? formatClock(item.endAt) : "19:00");
  const [work, setWork] = useState(
    item ? String(Math.round((item.endAt - item.startAt) / MINUTE)) : "60",
  );
  const [outsideConfirmed, confirmOutside] = useState(false);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState(
    mode === "block" ? (item?.name ?? "") : "",
  );
  const reasonOnly = mode === "cancel" || mode === "correct";
  const isBlock = mode === "block";
  const startAt = toTime(day, start);
  const endAt = isBlock ? toTime(day, end) : startAt + Number(work) * MINUTE;
  const validDuration =
    /^\d+$/.test(work) && Number(work) >= 1 && Number(work) <= 1440;
  const sameDay = items.filter(
    (other) =>
      other.id !== item?.id &&
      other.status !== "취소" &&
      keyOf(other.startAt) === day,
  );
  function reset() {
    setMessage("");
    confirmOutside(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    if (reasonOnly && item) {
      if (!reason.trim()) {
        setMessage("사유를 입력해 주세요.");
        return;
      }
      save(
        item.id,
        {
          ...item,
          status: mode === "cancel" ? "취소" : item.status,
          memo: reason.trim(),
        },
        mode === "cancel"
          ? "미리보기에서만 취소했어요. 고객에게 알림은 보내지 않았어요."
          : "미리보기에서 정정 사유를 기록했어요.",
      );
      return;
    }
    const visitErrors =
      mode === "visit"
        ? validateVisitInfo(
            {
              ...emptyVisitInfo,
              name: value("name"),
              phone: value("phone"),
              address: value("address"),
            },
            [],
          )
        : {};
    const required = !!(
      day &&
      start &&
      (isBlock
        ? end
        : validDuration &&
          (mode === "change"
            ? reason.trim()
            : Object.keys(visitErrors).length === 0))
    );
    if (!isBlock && required && endAt > toTime(addDays(day, 1), "00:00")) {
      setMessage("하루를 넘기는 일정은 날짜와 시간을 나누어 입력해 주세요.");
      return;
    }
    // ponytail: preview cannot calculate routes between visits. Blocks only prevent overlaps.
    // FE-15 replaces the preview check with server-provided route and schedule validation.
    const check = checkSchedule({ startAt, endAt }, sameDay, {
      required,
      now: isBlock ? undefined : Date.now(),
      routeAvailable:
        isBlock || !sameDay.some((other) => other.kind === "visit"),
      hours: isBlock
        ? undefined
        : { startAt: toTime(day, "09:00"), endAt: toTime(day, "18:00") },
      outsideConfirmed: mode === "visit" && outsideConfirmed,
    });
    if (check !== "READY") {
      setMessage(
        {
          INCOMPLETE:
            Object.values(visitErrors)[0] ??
            "날짜·시간과 필수 정보를 다시 확인해 주세요.",
          BAD_RANGE: "종료 시간은 시작 시간보다 늦어야 해요.",
          PAST: "이미 지난 시간에는 방문을 잡을 수 없어요. 다른 시간을 골라 주세요.",
          CONFLICT:
            "이 시간에 기존 일정이 있어요. 겹치지 않는 시간을 골라 주세요.",
          ROUTE_UNAVAILABLE:
            "앞뒤 일정의 이동시간을 확인할 수 없어요. 다른 날짜를 선택해 주세요.",
          OUTSIDE_HOURS:
            mode === "visit"
              ? "예시 영업시간(09:00–18:00) 밖입니다. 이 시간에 등록할지 확인해 주세요."
              : "예시 영업시간 안에서 시간을 선택해 주세요.",
        }[check],
      );
      return;
    }
    if (mode === "change" && item) {
      if (
        Math.min(Date.now() + 24 * 60 * MINUTE, startAt - 120 * MINUTE) <=
        Date.now()
      ) {
        setMessage("방문 2시간 전까지 수락할 시간이 없어 직접 조율해야 해요.");
        return;
      }
      save(
        item.id,
        {
          ...item,
          status: "변경 제안",
          memo: `제안: ${days.format(startAt)} ${formatClock(startAt)}–${formatClock(endAt)} · 작업 ${work}분 · ${reason.trim()}`,
        },
        "변경 제안을 미리봤어요. 기존 예약은 그대로예요.",
      );
      return;
    }
    const id = item?.id ?? createClientId();
    const source = value("source");
    save(
      id,
      {
        id,
        startAt,
        endAt,
        kind: isBlock ? "block" : "visit",
        name: isBlock ? reason.trim() || "개인 일정" : value("name"),
        title: isBlock ? "" : value("title") || "방문 예약",
        address: isBlock ? undefined : value("address"),
        source:
          source === "전화" || source === "문자·메신저" || source === "기타"
            ? source
            : undefined,
        status: isBlock ? "차단" : "확정",
        travel: isBlock ? undefined : "unknown",
      },
      isBlock
        ? "미리보기 일정에만 차단 시간을 추가했어요."
        : "미리보기 일정에만 추가했어요. 실제 예약은 생성되지 않았어요.",
    );
  }

  return (
    <form className={auth.form} onSubmit={submit} onChange={reset} noValidate>
      {!item && (mode === "block" || mode === "visit") ? (
        <div className={styles.formSwitch} aria-label="일정 추가 유형">
          <button
            type="button"
            aria-pressed={mode === "visit"}
            onClick={() => open("visit")}
          >
            방문 예약
          </button>
          <button
            type="button"
            aria-pressed={isBlock}
            onClick={() => open("block")}
          >
            시간 비우기
          </button>
        </div>
      ) : null}
      {reasonOnly && item ? (
        <div className={auth.card}>
          <strong>
            {item.name} · {item.title}
          </strong>
          <span>
            {days.format(item.startAt)} {formatClock(item.startAt)}
          </span>
          <span>{item.address}</span>
        </div>
      ) : (
        <>
          <label className={auth.field}>
            <span className={auth.label}>날짜</span>
            <input
              className={auth.input}
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              required
            />
          </label>
          <div className={styles.twoColumns}>
            <label className={auth.field}>
              <span className={auth.label}>시작 시간</span>
              <input
                className={auth.input}
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </label>
            {isBlock ? (
              <label className={auth.field}>
                <span className={auth.label}>종료 시간</span>
                <input
                  className={auth.input}
                  type="time"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                  required
                />
              </label>
            ) : (
              <label className={auth.field}>
                <span className={auth.label}>작업시간(분)</span>
                <input
                  className={auth.input}
                  type="number"
                  min={1}
                  max={1440}
                  value={work}
                  onChange={(event) => setWork(event.target.value)}
                  required
                />
              </label>
            )}
          </div>
          {!isBlock ? (
            <p className={auth.info}>
              <Icon name="clock" /> 작업{" "}
              {validDuration ? `${work}분` : "시간 입력 필요"} · 이동시간은 일정
              연동 후 별도로 확인합니다.
            </p>
          ) : null}
        </>
      )}
      {mode === "visit" ? (
        <>
          <label className={auth.field}>
            <span className={auth.label}>작업 종류 (선택)</span>
            <input
              className={auth.input}
              name="title"
              placeholder="예: 온수 작동 불량"
            />
          </label>
          <label className={auth.field}>
            <span className={auth.label}>고객 이름</span>
            <input className={auth.input} name="name" required />
          </label>
          <label className={auth.field}>
            <span className={auth.label}>연락처</span>
            <input className={auth.input} name="phone" type="tel" required />
          </label>
          <label className={auth.field}>
            <span className={auth.label}>방문 주소</span>
            <input className={auth.input} name="address" required />
          </label>
          <label className={auth.field}>
            <span className={auth.label}>접수 경로</span>
            <select className={auth.input} name="source">
              <option>전화</option>
              <option>문자·메신저</option>
              <option>기타</option>
            </select>
          </label>
        </>
      ) : (
        <label className={auth.field}>
          <span className={auth.label}>{isBlock ? "사유 (선택)" : "사유"}</span>
          <input
            className={auth.input}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required={!isBlock}
          />
        </label>
      )}
      {mode === "change" ? (
        <p className={auth.info}>
          고객이 새 시간을 수락하기 전까지 기존 방문은 유지됩니다.
        </p>
      ) : null}
      {isBlock ? (
        <p className={auth.hint}>
          기존에 확정된 예약은 자동으로 취소되지 않아요.
        </p>
      ) : null}
      {message ? (
        <p className={auth.notice} role="alert">
          {message}
        </p>
      ) : null}
      {mode === "visit" &&
      (outsideConfirmed || message.startsWith("예시 영업시간")) ? (
        <label className={styles.confirm}>
          <input
            type="checkbox"
            checked={outsideConfirmed}
            onChange={(event) => {
              event.stopPropagation();
              confirmOutside(event.target.checked);
            }}
          />
          영업시간 밖인 것을 확인했어요.
        </label>
      ) : null}
      <button className={styles.primary} type="submit">
        {mode === "visit"
          ? "예약 저장 미리보기"
          : mode === "block"
            ? "차단 시간 저장"
            : mode === "change"
              ? "변경 제안 미리보기"
              : mode === "cancel"
                ? "예약 취소 미리보기"
                : "정정 사유 저장"}
      </button>
      {isBlock && item ? (
        <button
          className={styles.secondary}
          type="button"
          onClick={() =>
            save(item.id, null, "미리보기에서 차단 시간을 해제했어요.")
          }
        >
          차단 시간 해제
        </button>
      ) : null}
    </form>
  );
}

function Icon({
  name,
}: {
  name: "back" | "plus" | "pin" | "clock" | "calendar" | "info";
}) {
  const size =
    name === "back" || name === "plus" ? 22 : name === "info" ? 36 : 18;
  return (
    <Image
      src={`/owner/schedule/${name}.svg`}
      width={size}
      height={size}
      alt=""
    />
  );
}
