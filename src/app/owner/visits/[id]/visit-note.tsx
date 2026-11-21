"use client";

// 사장님 전용 작업 메모 (B-24)
// - 고객 화면·알림·접수 요약에는 나가지 않습니다.
// - 저장에 실패해도 입력한 내용을 지우지 않고 다시 시도할 수 있습니다.
// - 메모는 선택이며 완료 처리와 따로 저장합니다.
import { useCallback, useState } from "react";
import { useLoad } from "../../_components/use-load";
import auth from "../../_components/owner-auth.module.css";
import styles from "../../_components/owner-inquiries.module.css";
import work from "../../_components/owner-work.module.css";
import { formatReceivedAt } from "@/lib/owner-inquiries/format";
import { MAX_NOTE_LENGTH, noteError } from "@/lib/owner-work/rules";
import {
  loadWorkNote,
  saveNote,
  type WorkSource,
} from "@/lib/owner-work/source";
import type { WorkNote } from "@/lib/owner-work/types";

const SAVE_ERROR: Record<string, string> = {
  SAVE_FAILED:
    "메모를 저장하지 못했어요. 입력한 내용은 그대로 있어요. 다시 시도해 주세요.",
  NOT_FOUND: "예약을 찾을 수 없어 저장하지 못했어요.",
  INVALID: "메모 내용을 확인해 주세요.",
};

export function VisitNote({
  source,
  visitId,
}: {
  source: WorkSource;
  visitId: string;
}) {
  const fetcher = useCallback(
    () => loadWorkNote(source, visitId),
    [source, visitId],
  );
  const { result, loadedAt, reload } = useLoad(fetcher);

  return (
    <section className={auth.section} aria-labelledby="visit-note">
      <div className={work.sectionHead}>
        <h2 id="visit-note" className={auth.sectionTitle}>
          작업 메모
        </h2>
        <span className={work.privateTag}>🔒 사장님만 볼 수 있어요</span>
      </div>
      {result === null ? (
        <p className={auth.info} aria-busy="true">
          메모를 불러오는 중이에요…
        </p>
      ) : !result.ok ? (
        <div className={auth.notice} role="alert">
          메모를 불러오지 못했어요.{" "}
          <button
            type="button"
            className={`${auth.button} ${auth.secondary} ${auth.small}`}
            onClick={() => void reload()}
          >
            다시 시도
          </button>
        </div>
      ) : (
        <NoteEditor
          // 다시 불러오면 입력칸도 새 값으로 시작합니다.
          key={loadedAt}
          source={source}
          visitId={visitId}
          initial={result.data}
        />
      )}
    </section>
  );
}

function NoteEditor({
  source,
  visitId,
  initial,
}: {
  source: WorkSource;
  visitId: string;
  initial: WorkNote | null;
}) {
  const [saved, setSaved] = useState<WorkNote | null>(initial);
  const [draft, setDraft] = useState(initial?.content ?? "");
  // '오늘·어제' 표시 기준 시각. 저장하면 저장 시각으로 갱신합니다.
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved"; at: number }
    | { kind: "failed"; message: string }
  >({ kind: "idle" });

  const changed = draft.trim() !== (saved?.content ?? "");
  const tooLong = draft.length > MAX_NOTE_LENGTH;
  const invalid = changed ? noteError(draft) : null;

  async function save() {
    if (!changed || invalid) return;
    setState({ kind: "saving" });
    const res = await saveNote(source, visitId, draft);
    if (!res.ok) {
      // 입력한 draft는 그대로 둡니다.
      setState({
        kind: "failed",
        message: SAVE_ERROR[res.code] ?? SAVE_ERROR.SAVE_FAILED,
      });
      return;
    }
    setSaved(res.data);
    setNow(res.data.updatedAt);
    setDraft(res.data.content);
    setState({ kind: "saved", at: res.data.updatedAt });
  }

  return (
    <div className={styles.groups}>
      <label className={styles.srOnly} htmlFor="work-note">
        사장님 전용 작업 메모
      </label>
      <textarea
        id="work-note"
        className={work.noteInput}
        value={draft}
        placeholder="방문 전 준비할 것, 현장에서 확인한 내용 등을 적어 두세요. (선택)"
        aria-invalid={tooLong || Boolean(state.kind === "failed")}
        aria-describedby="work-note-help"
        onChange={(e) => {
          setDraft(e.target.value);
          if (state.kind === "saved") setState({ kind: "idle" });
        }}
      />
      <div id="work-note-help" className={work.metaRow}>
        <span>
          {saved
            ? `작성 ${formatReceivedAt(saved.createdAt, now)}${
                saved.updatedAt !== saved.createdAt
                  ? ` · 수정 ${formatReceivedAt(saved.updatedAt, now)}`
                  : ""
              }`
            : "아직 메모가 없어요."}
        </span>
        <span className={tooLong ? auth.error : undefined}>
          {draft.length}/{MAX_NOTE_LENGTH}
        </span>
      </div>
      <p className={auth.hint}>
        고객 화면·알림·접수 요약에는 나가지 않아요. 메모는 선택이고, 작업 완료와
        따로 저장돼요.
      </p>
      {invalid && draft.length > 0 ? (
        <p className={auth.error}>{invalid}</p>
      ) : null}
      {state.kind === "failed" ? (
        <p className={work.failBox} role="alert">
          {state.message}
        </p>
      ) : null}
      {state.kind === "saved" ? (
        <p className={work.okBox} role="status">
          메모를 저장했어요.
        </p>
      ) : null}
      <button
        type="button"
        className={`${auth.button} ${auth.primary} ${auth.full}`}
        disabled={!changed || Boolean(invalid) || state.kind === "saving"}
        onClick={() => void save()}
      >
        {state.kind === "saving"
          ? "저장하는 중…"
          : state.kind === "failed"
            ? "다시 저장"
            : "메모 저장"}
      </button>
    </div>
  );
}
