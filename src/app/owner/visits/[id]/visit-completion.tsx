"use client";

// 작업 완료·완료 정정 (B-25)
// - 확인창을 거쳐 완료합니다. 같은 예약을 여러 번 완료해도 한 번만 기록됩니다.
// - 취소·확정 대기 예약은 완료할 수 없습니다.
// - 완료 정정은 사유를 꼭 받고 예약 확정으로 되돌립니다. 예약 취소가 아닙니다.
// - 예약 완료는 고객 문의 처리 상태와 따로 기록합니다.
import { useState } from "react";
import auth from "../../_components/owner-auth.module.css";
import styles from "../../_components/owner-inquiries.module.css";
import work from "../../_components/owner-work.module.css";
import { formatMonthDay, formatClock } from "@/lib/owner-inquiries/format";
import {
  MAX_REASON_LENGTH,
  VISIT_STATUS_LABEL,
  reasonError,
  visitActionsOf,
} from "@/lib/owner-work/rules";
import {
  finishVisit,
  undoCompletion,
  type WorkSource,
} from "@/lib/owner-work/source";
import type { Visit, WorkSaveResult } from "@/lib/owner-work/types";

const FAIL_MESSAGE: Record<string, string> = {
  SAVE_FAILED: "처리하지 못했어요. 예약 상태는 그대로예요. 다시 시도해 주세요.",
  CONFLICT:
    "다른 곳에서 예약이 먼저 바뀌었어요. 화면을 새로고침해서 최신 상태를 확인해 주세요.",
  NOT_ALLOWED: "지금 예약 상태에서는 할 수 없어요.",
  INVALID: "정정 사유를 확인해 주세요.",
  NOT_FOUND: "예약을 찾을 수 없어요.",
};

const BY_LABEL = { CUSTOMER: "고객", OWNER: "사장님", SYSTEM: "자동" };

type Mode = "idle" | "confirmComplete" | "correcting";

export function VisitCompletion({
  source,
  visit,
  onChanged,
}: {
  source: WorkSource;
  visit: Visit;
  onChanged: (visit: Visit) => void;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "ok" | "fail";
    text: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const actions = visitActionsOf(visit);
  const reasonInvalid = reasonError(reason);

  async function run(
    action: () => Promise<WorkSaveResult<Visit>>,
    okText: string,
  ) {
    setBusy(true);
    setMessage(null);
    const res = await action();
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "fail", text: FAIL_MESSAGE[res.code] });
      return;
    }
    setMode("idle");
    setReason("");
    setMessage({ tone: "ok", text: okText });
    onChanged(res.data);
  }

  return (
    <section className={auth.section} aria-labelledby="visit-complete">
      <h2 id="visit-complete" className={auth.sectionTitle}>
        작업 완료
      </h2>

      {message ? (
        <p
          className={message.tone === "ok" ? work.okBox : work.failBox}
          role={message.tone === "ok" ? "status" : "alert"}
        >
          {message.text}
        </p>
      ) : null}

      {visit.status === "COMPLETED" && visit.completedAt ? (
        <p className={auth.info}>
          {formatMonthDay(visit.completedAt)} {formatClock(visit.completedAt)}에
          작업 완료로 기록했어요. 고객 문의의 처리 상태는 따로 관리돼요.
        </p>
      ) : null}

      {actions.blockedReason ? (
        <p className={auth.info}>{actions.blockedReason}</p>
      ) : null}

      {actions.canComplete && mode !== "confirmComplete" ? (
        <button
          type="button"
          className={`${auth.button} ${auth.primary} ${auth.full}`}
          disabled={busy}
          onClick={() => {
            setMessage(null);
            setMode("confirmComplete");
          }}
        >
          작업 완료로 바꾸기
        </button>
      ) : null}

      {actions.canComplete && mode === "confirmComplete" ? (
        <div
          className={work.confirmPanel}
          role="group"
          aria-label="작업 완료 확인"
        >
          <p className={styles.cardTitle}>방문 작업을 완료로 바꿀까요?</p>
          <p className={styles.cardNote}>
            완료 시각이 기록되고 방문 일정의 완료 목록으로 옮겨져요. 메모는 완료
            후에도 쓸 수 있어요.
          </p>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={`${auth.button} ${auth.secondary}`}
              disabled={busy}
              onClick={() => setMode("idle")}
            >
              취소
            </button>
            <button
              type="button"
              className={`${auth.button} ${auth.primary}`}
              disabled={busy}
              onClick={() =>
                void run(
                  () => finishVisit(source, visit.id, visit.version),
                  "작업 완료로 기록했어요.",
                )
              }
            >
              {busy ? "처리하는 중…" : "완료하기"}
            </button>
          </div>
        </div>
      ) : null}

      {actions.canCorrect && mode !== "correcting" ? (
        <button
          type="button"
          className={`${auth.button} ${auth.secondary} ${auth.full}`}
          disabled={busy}
          onClick={() => {
            setMessage(null);
            setMode("correcting");
          }}
        >
          실수로 완료했어요 (완료 정정)
        </button>
      ) : null}

      {actions.canCorrect && mode === "correcting" ? (
        <div className={work.confirmPanel} role="group" aria-label="완료 정정">
          <p className={styles.cardTitle}>완료를 정정할까요?</p>
          <p className={styles.cardNote}>
            예약 확정 상태로 돌아가요. 예약 취소가 아니며, 이전 완료 기록과 정정
            사유는 이력에 남아요.
          </p>
          <label className={auth.label} htmlFor="correct-reason">
            정정 사유 (필수)
          </label>
          <input
            id="correct-reason"
            className={work.reasonInput}
            value={reason}
            maxLength={MAX_REASON_LENGTH + 50}
            placeholder="예: 다른 예약을 눌렀어요"
            aria-invalid={reason.length > 0 && Boolean(reasonInvalid)}
            onChange={(e) => setReason(e.target.value)}
          />
          {reason.length > 0 && reasonInvalid ? (
            <p className={auth.error}>{reasonInvalid}</p>
          ) : null}
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={`${auth.button} ${auth.secondary}`}
              disabled={busy}
              onClick={() => {
                setMode("idle");
                setReason("");
              }}
            >
              취소
            </button>
            <button
              type="button"
              className={`${auth.button} ${auth.primary}`}
              disabled={busy || Boolean(reasonInvalid)}
              onClick={() =>
                void run(
                  () => undoCompletion(source, visit.id, visit.version, reason),
                  "완료를 정정했어요. 예약 확정 상태로 돌아갔어요.",
                )
              }
            >
              {busy ? "처리하는 중…" : "정정하기"}
            </button>
          </div>
        </div>
      ) : null}

      {visit.history.length > 0 ? (
        <details>
          <summary className={auth.hint}>상태 변경 이력</summary>
          <ol className={work.historyList}>
            {visit.history.map((h, i) => (
              <li key={i}>
                {formatMonthDay(h.at)} {formatClock(h.at)} ·{" "}
                {h.from ? `${VISIT_STATUS_LABEL[h.from]} → ` : ""}
                {VISIT_STATUS_LABEL[h.to]} · {BY_LABEL[h.by]}
                {h.reason ? ` · 사유: ${h.reason}` : ""}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
