"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClientId } from "@/lib/customer-consultation";
import {
  bookingIssue,
  emptySlotReasons,
  formatVisit,
  kstDate,
  readAvailableVisits,
  readConfirmedVisit,
  type AvailableVisits,
  type ConfirmedVisit,
  type VisitSlot,
} from "@/lib/customer-booking";
import base from "./intake.module.css";
import styles from "./booking.module.css";

type Props = {
  businessName: string;
  onBack: () => void;
  onLoad: (from: string, signal: AbortSignal) => Promise<AvailableVisits>;
  onConfirm: (
    slot: VisitSlot,
    key: string,
    signal: AbortSignal,
  ) => Promise<ConfirmedVisit>;
  phoneVerified: boolean;
  onVerify?: () => Promise<boolean>;
  onExisting?: () => Promise<ConfirmedVisit>;
};

export default function CustomerBooking({
  businessName,
  onBack,
  onLoad,
  onConfirm,
  phoneVerified,
  onVerify,
  onExisting,
}: Props) {
  const [from, setFrom] = useState(() => kstDate());
  const [attempt, setAttempt] = useState(0);
  const [available, setAvailable] = useState<AvailableVisits | null>(null);
  const [selected, setSelected] = useState<VisitSlot | null>(null);
  const [review, setReview] = useState(false);
  const [verified, setVerified] = useState(phoneVerified);
  const [confirmed, setConfirmed] = useState<ConfirmedVisit | null>(null);
  const [issue, setIssue] = useState<ReturnType<typeof bookingIssue> | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const requestKey = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => {
    heading.current?.focus();
  }, [review, confirmed]);
  useEffect(() => {
    const controller = new AbortController();
    void onLoad(from, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          setAvailable(readAvailableVisits(result));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setIssue(bookingIssue(error));
      });
    return () => controller.abort();
  }, [from, attempt, onLoad]);

  function refresh() {
    setAvailable(null);
    setSelected(null);
    setReview(false);
    setIssue(null);
    requestKey.current = null;
    setAttempt((v) => v + 1);
  }
  async function act(
    task: (signal: AbortSignal) => Promise<void>,
    confirming = false,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setIssue(null);
    const controller = new AbortController();
    operation.current = controller;
    try {
      await task(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        const problem = bookingIssue(error);
        setIssue(problem);
        setUncertain(confirming && problem.kind === "retry");
        if (problem.kind === "verify") setVerified(false);
        if (problem.kind === "conflict") {
          setSelected(null);
          setReview(false);
        }
      }
    } finally {
      lock.current = false;
      operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function confirm() {
    if (!selected || !verified) return;
    const candidate = selected;
    if (!requestKey.current) requestKey.current = createClientId();
    const key = requestKey.current;
    void act(async (signal) => {
      const result = readConfirmedVisit(
        await onConfirm(candidate, key, signal),
      );
      if (!signal.aborted) {
        setConfirmed(result);
        setUncertain(false);
      }
    }, true);
  }
  const blocked =
    issue && ["owner", "expired", "existing"].includes(issue.kind);
  const failedNotifications = confirmed?.notifications.some(
    (n) => n.sendStatus === "FAILED",
  );
  return (
    <main className={base.shell}>
      <header className={base.header}>
        <button
          type="button"
          className={base.back}
          aria-label="이전 화면"
          disabled={busy || uncertain}
          onClick={() => (review && !confirmed ? setReview(false) : onBack())}
        >
          <Image src="/customer/back.svg" alt="" width={22} height={22} />
        </button>
        <h1 ref={heading} tabIndex={-1}>
          {confirmed
            ? "예약 내용"
            : review
              ? "예약 최종 확인"
              : "방문시간 선택"}
        </h1>
      </header>
      <section className={base.content} aria-busy={busy}>
        <p>{businessName}</p>
        {confirmed ? (
          <>
            <h2>방문 예약이 확정됐어요</h2>
            <dl className={base.review}>
              <dt>방문시간</dt>
              <dd>
                {formatVisit(confirmed.startAt)}
                <br />~ {formatVisit(confirmed.endAt, true)}
              </dd>
              <dt>예약번호</dt>
              <dd>{confirmed.reservationId}</dd>
              <dt>예약 상태</dt>
              <dd>확정</dd>
            </dl>
            <p role="status">
              {failedNotifications
                ? "예약은 확정됐어요. 안내 문자·알림 발송은 다시 확인 중이에요. 이 화면의 예약 내용을 확인해 주세요."
                : "확정된 시간에 방문해요. 예약 내용은 이 화면에서 확인할 수 있어요."}
            </p>
          </>
        ) : (
          <>
            <h2>
              {review
                ? "이 시간으로 예약할까요?"
                : "방문 가능한 시간을 골라 주세요"}
            </h2>
            <p className={base.hint}>
              시간을 고르는 것만으로 예약되지는 않아요. 마지막 확인 후 예약이
              확정돼요.
            </p>
            {review && selected ? (
              <>
                <dl className={base.review}>
                  <dt>방문시간</dt>
                  <dd>
                    {formatVisit(selected.startAt)}
                    <br />~ {formatVisit(selected.endAt, true)}
                  </dd>
                  <dt>휴대전화</dt>
                  <dd>{verified ? "인증 완료" : "인증 필요"}</dd>
                </dl>
                {!verified && (
                  <>
                    <p>
                      예약을 확정하기 전에 방문정보에 입력한 번호를 인증해
                      주세요.
                    </p>
                    <button
                      type="button"
                      className={base.primary}
                      disabled={busy || !onVerify || !!blocked}
                      onClick={() =>
                        void act(async (signal) => {
                          const ok = await onVerify!();
                          if (!signal.aborted) setVerified(ok);
                        })
                      }
                    >
                      {onVerify ? "휴대전화 인증" : "문자 인증 연결 준비 중"}
                    </button>
                  </>
                )}
              </>
            ) : (
              !blocked && (
                <>
                  <label className={base.field}>
                    조회 시작일
                    <input
                      type="date"
                      value={from}
                      min={kstDate()}
                      disabled={busy || uncertain}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setFrom(e.target.value);
                        setAvailable(null);
                        setSelected(null);
                        setIssue(null);
                        requestKey.current = null;
                      }}
                    />
                  </label>
                  {!available && !issue ? (
                    <p role="status">방문 가능한 시간을 불러오고 있어요…</p>
                  ) : (
                    available && (
                      <>
                        <p className={base.hint}>
                          예상 작업시간 {available.workMinutes}분 · 한국 시간
                          기준
                        </p>
                        {available.days.length === 0 && (
                          <p>
                            조회한 기간에 방문 가능한 시간이 없어요. 다른 날짜를
                            선택해 주세요.
                          </p>
                        )}
                        {available.days.map((day) => (
                          <fieldset
                            className={styles.day}
                            key={day.date}
                            disabled={busy || !!issue}
                          >
                            <legend>
                              {new Intl.DateTimeFormat("ko-KR", {
                                month: "long",
                                day: "numeric",
                                weekday: "short",
                                timeZone: "Asia/Seoul",
                              }).format(new Date(`${day.date}T00:00:00+09:00`))}
                            </legend>
                            {day.slots.length ? (
                              <div className={styles.slots}>
                                {day.slots.map((slot) => (
                                  <label key={slot.startAt}>
                                    <input
                                      type="radio"
                                      name="visit-time"
                                      disabled={
                                        Date.parse(slot.startAt) <= Date.now()
                                      }
                                      checked={
                                        selected?.startAt === slot.startAt
                                      }
                                      onChange={() => {
                                        setSelected(slot);
                                        requestKey.current = null;
                                      }}
                                    />
                                    <span>
                                      {formatVisit(slot.startAt, true)}
                                      <small>
                                        ~ {formatVisit(slot.endAt, true)}
                                      </small>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <p className={base.hint}>
                                {emptySlotReasons[day.emptyReason ?? ""] ??
                                  "방문 가능한 시간이 없어요."}
                              </p>
                            )}
                          </fieldset>
                        ))}
                      </>
                    )
                  )}
                </>
              )
            )}
            {issue && (
              <div className={styles.notice} role="alert">
                <p>{issue.message}</p>
                {issue.kind === "owner" && (
                  <p className={base.hint}>
                    자동 예약은 확정되지 않았어요. 상담에서 안내를 확인해
                    주세요.
                  </p>
                )}
                {issue.kind === "retry" && uncertain && (
                  <p className={base.hint}>
                    중복 예약을 막기 위해 같은 요청으로 결과를 다시 확인해요.
                  </p>
                )}
                {issue.kind === "existing" && onExisting && (
                  <button
                    type="button"
                    className={base.textButton}
                    disabled={busy}
                    onClick={() =>
                      void act(async (signal) => {
                        const value = readConfirmedVisit(await onExisting());
                        if (!signal.aborted) setConfirmed(value);
                      })
                    }
                  >
                    기존 예약 확인
                  </button>
                )}
                {(issue.kind === "conflict" ||
                  (issue.kind === "retry" && !uncertain)) && (
                  <button
                    type="button"
                    className={base.textButton}
                    onClick={refresh}
                  >
                    가능시간 다시 불러오기
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>
      <footer className={base.footer}>
        {confirmed || blocked ? (
          <button type="button" className={base.primary} onClick={onBack}>
            상담으로 돌아가기
          </button>
        ) : review ? (
          <button
            type="button"
            className={base.primary}
            disabled={busy || !verified || !selected}
            onClick={confirm}
          >
            {busy
              ? "예약 결과 확인 중…"
              : uncertain
                ? "예약 결과 다시 확인"
                : "이 시간으로 예약 확정"}
          </button>
        ) : (
          <button
            type="button"
            className={base.primary}
            disabled={!selected || busy || !!issue}
            onClick={() => setReview(true)}
          >
            선택한 시간 확인
          </button>
        )}
      </footer>
    </main>
  );
}
