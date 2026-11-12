"use client";

// 직접 응대·답장·덕구 재개·문의 종료 (FE-10 · B-15·B-16·C-11)
// - 응대 전환 실패와 답장 전송 실패를 따로 보여 줍니다.
// - 서버가 바꿨다고 확인해 준 뒤에만 성공으로 표시합니다.
import { useState } from "react";
import auth from "../../../_components/owner-auth.module.css";
import styles from "../../../_components/owner-inquiries.module.css";
import {
  endInquiry,
  resumeDukgu,
  sendReply,
  startOwnerHandling,
  type InquirySource,
} from "@/lib/owner-inquiries/source";
import {
  MAX_MESSAGE_LENGTH,
  RESUME_BLOCKER_LABEL,
  handlingActionsOf,
  resumeBlockersOf,
} from "@/lib/owner-inquiries/rules";
import { formatVisitRange } from "@/lib/owner-inquiries/format";
import type {
  HandlingResult,
  InquiryDetail,
  ResumeBlocker,
} from "@/lib/owner-inquiries/types";

type SwitchAction = "TAKE_OVER" | "RESUME" | "CLOSE";

/** 응대 전환 상태. 답장 전송과 섞이지 않게 따로 둡니다. */
type SwitchState =
  | { kind: "idle" }
  | { kind: "working"; action: SwitchAction }
  | { kind: "done"; message: string }
  | { kind: "failed"; message: string; blockers?: ResumeBlocker[] };

/** 화면에서 보낸 답장. 서버가 저장을 확인하기 전까지 여기 둡니다. */
type Outgoing = {
  clientMsgId: string;
  text: string;
  status: "SENDING" | "FAILED" | "SENT";
  /** 실패 이유 */
  error?: string;
  /** 서버 메시지 id. 다시 불러온 대화에 이 id가 보이면 화면 목록에서 뺍니다. */
  serverId?: string;
};

const SWITCH_FAILED: Record<SwitchAction, string> = {
  TAKE_OVER:
    "직접 응대로 바꾸지 못했어요. 아직 덕구가 응대하고 있어요. 다시 시도해 주세요.",
  RESUME:
    "덕구에게 다시 맡기지 못했어요. 사장님 직접 응대가 그대로 이어져요. 다시 시도해 주세요.",
  CLOSE: "문의를 종료하지 못했어요. 다시 시도해 주세요.",
};

const WORKING_LABEL: Record<SwitchAction, string> = {
  TAKE_OVER: "직접 응대로 바꾸는 중…",
  RESUME: "덕구에게 넘기는 중…",
  CLOSE: "종료하는 중…",
};

function failureMessage(
  action: SwitchAction,
  result: Extract<HandlingResult<unknown>, { ok: false }>,
): string {
  if (result.code === "CLOSED") return "이미 종료된 문의예요.";
  if (result.code === "NOT_FOUND") return "문의를 찾을 수 없어요.";
  if (result.code === "RESUME_BLOCKED") {
    return "아직 덕구에게 맡길 수 없어요. 아래 내용을 먼저 확인해 주세요.";
  }
  return SWITCH_FAILED[action];
}

const SEND_FAILED: Record<string, string> = {
  NOT_OWNER_MODE: "직접 응대 중이 아니라서 보내지 못했어요.",
  CLOSED: "종료된 문의라서 보내지 못했어요.",
  NOT_FOUND: "문의를 찾을 수 없어 보내지 못했어요.",
};

function newClientMsgId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function HandlingPanel({
  source,
  inquiry,
  now,
  refresh,
}: {
  source: InquirySource;
  inquiry: InquiryDetail;
  now: number;
  refresh: () => Promise<void>;
}) {
  const [switchState, setSwitchState] = useState<SwitchState>({
    kind: "idle",
  });
  const [confirmingClose, setConfirmingClose] = useState(false);
  const actions = handlingActionsOf(inquiry);
  const knownBlockers = resumeBlockersOf(inquiry);
  const working = switchState.kind === "working";

  async function runSwitch(action: SwitchAction) {
    setSwitchState({ kind: "working", action });
    if (action === "CLOSE") {
      const res = await endInquiry(source, inquiry.id);
      if (!res.ok) {
        setSwitchState({
          kind: "failed",
          message: failureMessage(action, res),
        });
        return;
      }
      setConfirmingClose(false);
      setSwitchState({
        kind: "done",
        message: res.data.reservationKept
          ? "문의를 종료했어요. 방문 예약은 취소되지 않고 그대로 있어요."
          : "문의를 종료했어요. 대화 기록은 그대로 남아요.",
      });
      await refresh();
      return;
    }

    const res =
      action === "TAKE_OVER"
        ? await startOwnerHandling(source, inquiry.id)
        : await resumeDukgu(source, inquiry.id);
    const expected = action === "TAKE_OVER" ? "OWNER" : "AI";
    // 서버가 응대 주체를 바꿨다고 알려 준 경우에만 성공으로 봅니다.
    if (!res.ok || res.data.handler !== expected) {
      setSwitchState({
        kind: "failed",
        message: res.ok ? SWITCH_FAILED[action] : failureMessage(action, res),
        blockers: res.ok ? undefined : res.blockers,
      });
      return;
    }
    setSwitchState({
      kind: "done",
      message:
        action === "TAKE_OVER"
          ? "직접 응대를 시작했어요. 덕구의 자동 답변과 자동 예약을 멈췄어요."
          : "덕구에게 다시 맡겼어요. 덕구가 고객에게 전환을 안내하고 이어서 접수해요.",
    });
    await refresh();
  }

  const shownBlockers =
    switchState.kind === "failed" && switchState.blockers?.length
      ? switchState.blockers
      : knownBlockers;

  return (
    <section className={styles.handling} aria-label="응대 관리">
      {switchState.kind === "done" ? (
        <p className={styles.toast} role="status">
          {switchState.message}
        </p>
      ) : null}
      {switchState.kind === "failed" ? (
        <p className={styles.switchFailed} role="alert">
          {switchState.message}
        </p>
      ) : null}

      {inquiry.closed ? (
        <p className={auth.info}>
          종료된 문의는 답장을 보낼 수 없어요.
          {inquiry.reservation && switchState.kind !== "done"
            ? " 방문 예약은 취소되지 않고 그대로 있어요."
            : ""}
        </p>
      ) : null}

      {actions.canTakeOver ? (
        <div className={styles.handlingBlock}>
          <p className={auth.hint}>
            직접 응대를 시작하면 덕구의 자동 답변과 자동 예약이 멈춰요.
          </p>
          <button
            type="button"
            className={`${auth.button} ${auth.primary} ${auth.full}`}
            disabled={working}
            onClick={() => void runSwitch("TAKE_OVER")}
          >
            {working && switchState.action === "TAKE_OVER"
              ? WORKING_LABEL.TAKE_OVER
              : "직접 응대하기"}
          </button>
        </div>
      ) : null}

      {actions.canReply ? (
        <ReplyComposer
          // 문의가 바뀌면 보내던 목록을 비웁니다.
          key={inquiry.id}
          source={source}
          inquiry={inquiry}
          refresh={refresh}
        />
      ) : null}

      {actions.canResume || actions.canClose ? (
        <div className={styles.handlingBlock}>
          {actions.canResume ? (
            <>
              {shownBlockers.length ? (
                <ul
                  className={styles.blockerList}
                  aria-label="덕구에게 맡기기 전에 확인할 것"
                >
                  {shownBlockers.map((b) => (
                    <li key={b}>{RESUME_BLOCKER_LABEL[b]}</li>
                  ))}
                </ul>
              ) : null}
              <button
                type="button"
                className={`${auth.button} ${auth.secondary} ${auth.full}`}
                disabled={working || knownBlockers.length > 0}
                onClick={() => void runSwitch("RESUME")}
              >
                {working && switchState.action === "RESUME"
                  ? WORKING_LABEL.RESUME
                  : "덕구에게 다시 맡기기"}
              </button>
            </>
          ) : null}

          {actions.canClose && !confirmingClose ? (
            <button
              type="button"
              className={`${auth.button} ${auth.secondary} ${auth.full}`}
              disabled={working}
              onClick={() => setConfirmingClose(true)}
            >
              문의 종료
            </button>
          ) : null}

          {actions.canClose && confirmingClose ? (
            <div
              className={styles.confirmPanel}
              role="group"
              aria-label="문의 종료 확인"
            >
              <p className={styles.cardTitle}>문의를 종료할까요?</p>
              <p className={styles.cardNote}>
                덕구 응대가 멈추고 대화 기록은 그대로 남아요. 종료한 뒤에는
                고객이 이 상담 화면을 더 볼 수 없어요.
              </p>
              {inquiry.reservation ? (
                <p className={styles.handoffNote}>
                  {formatVisitRange(
                    inquiry.reservation.startAt,
                    inquiry.reservation.endAt,
                    now,
                  )}{" "}
                  방문 예약은 취소되지 않고 그대로 유지돼요.
                </p>
              ) : null}
              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={`${auth.button} ${auth.secondary}`}
                  disabled={working}
                  onClick={() => setConfirmingClose(false)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={`${auth.button} ${auth.primary}`}
                  disabled={working}
                  onClick={() => void runSwitch("CLOSE")}
                >
                  {working && switchState.action === "CLOSE"
                    ? WORKING_LABEL.CLOSE
                    : "종료하기"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** 사장님 답장 입력창과 보내는 중·실패한 답장 (B-15·C-11) */
function ReplyComposer({
  source,
  inquiry,
  refresh,
}: {
  source: InquirySource;
  inquiry: InquiryDetail;
  refresh: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [outbox, setOutbox] = useState<Outgoing[]>([]);
  const trimmed = text.trim();
  const tooLong = trimmed.length > MAX_MESSAGE_LENGTH;
  const serverIds = new Set(inquiry.messages.map((m) => m.id));
  // 다시 불러온 대화에 이미 들어온 답장은 화면 목록에서 뺍니다.
  const pending = outbox.filter(
    (o) => !(o.serverId && serverIds.has(o.serverId)),
  );

  function update(clientMsgId: string, patch: Partial<Outgoing>) {
    setOutbox((list) =>
      list.map((o) => (o.clientMsgId === clientMsgId ? { ...o, ...patch } : o)),
    );
  }

  async function deliver(item: Outgoing) {
    update(item.clientMsgId, { status: "SENDING", error: undefined });
    // 다시 보낼 때도 같은 clientMsgId를 써서 서버가 중복 저장하지 않게 합니다.
    const res = await sendReply(source, inquiry.id, {
      clientMsgId: item.clientMsgId,
      text: item.text,
    });
    if (!res.ok) {
      update(item.clientMsgId, {
        status: "FAILED",
        error: SEND_FAILED[res.code] ?? "연결을 확인하고 다시 보내 주세요.",
      });
      if (res.code === "NOT_OWNER_MODE" || res.code === "CLOSED") {
        await refresh();
      }
      return;
    }
    update(item.clientMsgId, { status: "SENT", serverId: res.data.id });
    await refresh();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || tooLong) return;
    const item: Outgoing = {
      clientMsgId: newClientMsgId(),
      text: trimmed,
      status: "SENDING",
    };
    setOutbox((list) => [...list, item]);
    setText("");
    void deliver(item);
  }

  return (
    <div className={styles.handlingBlock}>
      {pending.length ? (
        <ol className={styles.messages} aria-label="보내는 답장">
          {pending.map((o) => (
            <li
              key={o.clientMsgId}
              className={`${styles.message} ${styles.fromUs}`}
            >
              <span className={styles.sender}>사장님</span>
              <p
                className={`${styles.bubble} ${styles.ownerBubble} ${o.status === "FAILED" ? styles.bubbleFailed : ""}`}
              >
                {o.text}
              </p>
              {o.status === "FAILED" ? (
                <span className={styles.sendFailed} role="alert">
                  전송 실패 · {o.error}{" "}
                  <button
                    type="button"
                    className={styles.retryButton}
                    onClick={() => void deliver(o)}
                  >
                    다시 보내기
                  </button>
                </span>
              ) : (
                <span className={styles.cardTime}>
                  {o.status === "SENDING" ? "보내는 중…" : "보냈어요"}
                </span>
              )}
            </li>
          ))}
        </ol>
      ) : null}

      <form className={styles.composer} onSubmit={submit}>
        <label className={styles.srOnly} htmlFor="owner-reply">
          고객에게 보낼 답장
        </label>
        <textarea
          id="owner-reply"
          className={styles.composerInput}
          value={text}
          rows={3}
          placeholder="고객에게 보낼 답장을 입력해 주세요."
          aria-invalid={tooLong}
          aria-describedby="owner-reply-count"
          onChange={(e) => setText(e.target.value)}
        />
        <div className={styles.composerRow}>
          <span
            id="owner-reply-count"
            className={tooLong ? auth.error : auth.hint}
          >
            {trimmed.length}/{MAX_MESSAGE_LENGTH}
            {tooLong ? " · 너무 길어요" : ""}
          </span>
          <button
            type="submit"
            className={`${auth.button} ${auth.primary} ${auth.small}`}
            disabled={!trimmed || tooLong}
          >
            보내기
          </button>
        </div>
      </form>
    </div>
  );
}
