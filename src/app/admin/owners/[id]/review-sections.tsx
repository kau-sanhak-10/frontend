"use client";

// 신청 심사(승인·거절)와 운영 상태 변경 (O-02)
import { useState } from "react";
import admin from "../../_components/admin.module.css";
import auth from "../../../owner/_components/owner-auth.module.css";
import styles from "../../../owner/_components/owner-inquiries.module.css";
import {
  ADMIN_ERROR_MESSAGE,
  CHANGEABLE_STATUSES,
  MAX_REASON_LENGTH,
  OWNER_STATUS_LABEL,
  STATUS_HINT,
  rejectReasonError,
} from "@/lib/admin/rules";
import type { AdminSession } from "@/lib/admin/session";
import {
  approveOwner,
  changeOwnerStatus,
  rejectOwner,
} from "@/lib/admin/source";
import type { AdminOwner, AdminResult, OwnerStatus } from "@/lib/admin/types";

type Msg = { tone: "ok" | "fail"; text: string } | null;

function useRun(onChanged: (o: AdminOwner, okText: string) => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function run(
    action: () => Promise<AdminResult<AdminOwner>>,
    okText: string,
  ) {
    setBusy(true);
    setMsg(null);
    const res = await action();
    setBusy(false);
    if (!res.ok) {
      setMsg({ tone: "fail", text: ADMIN_ERROR_MESSAGE[res.code] });
      return false;
    }
    // 성공 안내는 상세 화면 위에 보여 줍니다. (심사 칸은 승인·거절 뒤 사라져요)
    onChanged(res.data, okText);
    return true;
  }
  return { busy, msg, setMsg, run };
}

function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p
      className={msg.tone === "ok" ? admin.okBox : admin.failBox}
      role={msg.tone === "ok" ? "status" : "alert"}
    >
      {msg.text}
    </p>
  );
}

/** 승인 대기 신청 심사 */
export function ReviewSection({
  session,
  owner,
  onChanged,
}: {
  session: AdminSession;
  owner: AdminOwner;
  onChanged: (o: AdminOwner, okText: string) => void;
}) {
  const { busy, msg, setMsg, run } = useRun(onChanged);
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [reason, setReason] = useState("");
  const reasonInvalid = rejectReasonError(reason);

  return (
    <section className={auth.section} aria-labelledby="owner-review">
      <h2 id="owner-review" className={auth.sectionTitle}>
        신청 심사
      </h2>
      <Message msg={msg} />
      <p className={auth.info}>
        사장님과 업체의 관계를 확인한 뒤 승인하거나 거절해요. 처리자와 처리
        시각이 남아요.
      </p>

      {mode === "idle" ? (
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={`${auth.button} ${auth.secondary}`}
            disabled={busy}
            onClick={() => {
              setMsg(null);
              setMode("reject");
            }}
          >
            거절
          </button>
          <button
            type="button"
            className={`${auth.button} ${auth.primary}`}
            disabled={busy}
            onClick={() => {
              setMsg(null);
              setMode("approve");
            }}
          >
            승인
          </button>
        </div>
      ) : null}

      {mode === "approve" ? (
        <div className={admin.panel} role="group" aria-label="승인 확인">
          <p className={styles.cardTitle}>{owner.businessName}을 승인할까요?</p>
          <ul className={admin.steps}>
            <li>사장님이 등록된 번호로 로그인할 수 있게 돼요.</li>
            <li>운영 상태는 준비 중으로 시작해요.</li>
            <li>
              자동 예약은 켜지지 않아요. 사장님이 영업·예약 기준을 설정한 뒤
              직접 켜요.
            </li>
          </ul>
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
              onClick={async () => {
                if (
                  await run(
                    () => approveOwner(session, owner.id),
                    "승인했어요. 사장님이 로그인할 수 있어요.",
                  )
                )
                  setMode("idle");
              }}
            >
              {busy ? "처리하는 중…" : "승인하기"}
            </button>
          </div>
        </div>
      ) : null}

      {mode === "reject" ? (
        <div className={admin.panel} role="group" aria-label="거절 사유 입력">
          <label className={auth.label} htmlFor="reject-reason">
            거절 사유 (필수)
          </label>
          <textarea
            id="reject-reason"
            className={admin.textarea}
            value={reason}
            maxLength={MAX_REASON_LENGTH + 50}
            placeholder="예: 사업자 정보를 확인하지 못했어요. 운영팀으로 연락해 주세요."
            aria-invalid={reason.length > 0 && Boolean(reasonInvalid)}
            onChange={(e) => setReason(e.target.value)}
          />
          {reason.length > 0 && reasonInvalid ? (
            <p className={auth.error}>{reasonInvalid}</p>
          ) : (
            <p className={auth.hint}>
              사장님이 로그인할 때 이 사유와 운영팀 문의 안내를 봐요. (
              {reason.trim().length}/{MAX_REASON_LENGTH})
            </p>
          )}
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
              onClick={async () => {
                if (
                  await run(
                    () => rejectOwner(session, owner.id, reason),
                    "거절했어요. 사장님은 로그인할 때 거절 사유를 봐요.",
                  )
                ) {
                  setMode("idle");
                  setReason("");
                }
              }}
            >
              {busy ? "처리하는 중…" : "거절하기"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** 운영 상태 (승인된 업체만) */
export function StatusSection({
  session,
  owner,
  canChange,
  onChanged,
}: {
  session: AdminSession;
  owner: AdminOwner;
  canChange: boolean;
  onChanged: (o: AdminOwner, okText: string) => void;
}) {
  const { busy, msg, run } = useRun(onChanged);
  const [next, setNext] = useState<OwnerStatus>(owner.status);
  const restricting = next === "RESTRICTED" && owner.status !== "RESTRICTED";

  return (
    <section className={auth.section} aria-labelledby="owner-status">
      <h2 id="owner-status" className={auth.sectionTitle}>
        운영 상태
      </h2>
      <Message msg={msg} />
      <p className={auth.info}>
        지금: <b>{OWNER_STATUS_LABEL[owner.status]}</b> ·{" "}
        {STATUS_HINT[owner.status]}
      </p>
      {canChange ? (
        <>
          <label className={auth.label} htmlFor="status-select">
            바꿀 상태
          </label>
          <select
            id="status-select"
            className={admin.select}
            value={next}
            disabled={busy}
            onChange={(e) => setNext(e.target.value as OwnerStatus)}
          >
            {CHANGEABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {OWNER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {next !== owner.status ? (
            <p className={restricting ? admin.failBox : auth.hint}>
              {restricting
                ? "이용 제한하면 사장님 로그인이 모두 끊기고 새로 로그인할 수 없어요. 이미 잡힌 예약과 고객 조회는 지워지지 않아요."
                : STATUS_HINT[next]}
            </p>
          ) : null}
          <button
            type="button"
            className={`${auth.button} ${auth.primary} ${auth.full}`}
            disabled={busy || next === owner.status}
            onClick={() =>
              void run(
                () => changeOwnerStatus(session, owner.id, next),
                `운영 상태를 ${OWNER_STATUS_LABEL[next]}(으)로 바꿨어요.`,
              )
            }
          >
            {busy ? "저장하는 중…" : "운영 상태 저장"}
          </button>
        </>
      ) : (
        <p className={auth.hint}>탈퇴한 업체는 운영 상태를 바꿀 수 없어요.</p>
      )}
    </section>
  );
}
