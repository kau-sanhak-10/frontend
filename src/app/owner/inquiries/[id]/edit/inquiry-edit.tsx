"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { OwnerGate } from "../../../_components/owner-gate";
import auth from "../../../_components/owner-auth.module.css";
import styles from "../../../_components/owner-inquiries.module.css";
import { DetailError, DetailSkeleton } from "../detail-states";
import { useInquiryDetail } from "../use-inquiry-detail";
import {
  saveInquiryFields,
  type InquirySource,
} from "@/lib/owner-inquiries/source";
import {
  EDITABLE_FIELDS,
  MAX_FIELD_LENGTH,
  SOURCE_LABEL,
  collectChanges,
  initialDraft,
  type EditDraft,
} from "@/lib/owner-inquiries/rules";
import { formatReceivedAt } from "@/lib/owner-inquiries/format";
import type {
  EditableFieldKey,
  InquiryDetail,
  SaveResult,
  SummaryField,
} from "@/lib/owner-inquiries/types";

/** 접수 정보 수정 (B-14) */
export function InquiryEditView({ inquiryId }: { inquiryId: string }) {
  return (
    <OwnerGate screenName="접수 정보 수정">
      {({ source }) => <EditBody source={source} inquiryId={inquiryId} />}
    </OwnerGate>
  );
}

type Banner = "saved" | "conflict" | null;

function EditBody({
  source,
  inquiryId,
}: {
  source: InquirySource;
  inquiryId: string;
}) {
  const { result, loadedAt, reload } = useInquiryDetail(source, inquiryId);
  // 저장에 성공하면 서버가 돌려준 최신 문의를 바로 씁니다.
  const [saved, setSaved] = useState<InquiryDetail | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const detailHref = `/owner/inquiries/${inquiryId}`;

  const inquiry = saved ?? (result?.ok ? result.data : null);

  return (
    <main className={auth.page}>
      <header className={styles.detailHeader}>
        <Link
          href={detailHref}
          className={auth.backLink}
          aria-label="접수 상세로 돌아가기"
        >
          ‹
        </Link>
        <h1 className={auth.headerTitle}>접수 정보 수정</h1>
      </header>

      {result === null && !saved ? (
        <DetailSkeleton />
      ) : !inquiry ? (
        <DetailError
          code={result && !result.ok ? result.code : "LOAD_FAILED"}
          onRetry={() => void reload()}
        />
      ) : (
        <EditForm
          // 버전이 바뀌면(저장·최신 내용 불러오기) 입력칸을 새 값으로 다시 채웁니다.
          key={inquiry.version}
          source={source}
          inquiry={inquiry}
          now={loadedAt}
          banner={banner}
          detailHref={detailHref}
          onSaved={(next) => {
            setSaved(next);
            setBanner("saved");
          }}
          onConflict={() => {
            setSaved(null);
            setBanner("conflict");
            void reload();
          }}
        />
      )}
    </main>
  );
}

const SAVE_ERROR: Record<
  Exclude<SaveResult<unknown>, { ok: true }>["code"],
  string
> = {
  SAVE_FAILED:
    "저장하지 못했어요. 입력한 내용은 그대로 있어요. 다시 시도해 주세요.",
  INVALID: "빈칸이나 너무 긴 값은 저장할 수 없어요.",
  NOT_FOUND: "이 문의를 찾을 수 없어요. 접수함에서 다시 열어 주세요.",
  CONFLICT: "다른 곳에서 먼저 바뀌었어요.",
};

function EditForm({
  source,
  inquiry,
  now,
  banner,
  detailHref,
  onSaved,
  onConflict,
}: {
  source: InquirySource;
  inquiry: InquiryDetail;
  now: number;
  banner: Banner;
  detailHref: string;
  onSaved: (next: InquiryDetail) => void;
  onConflict: () => void;
}) {
  const [draft, setDraft] = useState<EditDraft>(() =>
    initialDraft(inquiry.summary),
  );
  const [errors, setErrors] = useState<
    Partial<Record<EditableFieldKey, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 화면을 떠난 뒤 도착한 저장 결과는 무시합니다.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const { changes } = collectChanges(inquiry.summary, draft);
  const fieldOf = (key: EditableFieldKey) =>
    inquiry.summary.find((f) => f.key === key);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const next = collectChanges(inquiry.summary, draft);
    setErrors(next.errors);
    setMessage(null);
    if (Object.keys(next.errors).length > 0) return;
    if (next.changes.length === 0) {
      setMessage("바뀐 내용이 없어요.");
      return;
    }
    setSaving(true);
    const res = await saveInquiryFields(source, inquiry.id, {
      version: inquiry.version,
      changes: next.changes,
    });
    if (!alive.current) return;
    setSaving(false);
    if (res.ok) {
      onSaved(res.data);
    } else if (res.code === "CONFLICT") {
      onConflict();
    } else {
      // 실패를 성공처럼 보이지 않게, 입력값을 그대로 두고 이유를 알려 줍니다.
      setMessage(SAVE_ERROR[res.code]);
    }
  }

  return (
    <form className={auth.form} onSubmit={onSubmit} noValidate>
      <div>
        <h2 className={auth.title}>
          {inquiry.customerLabel} · {inquiry.title}
        </h2>
        <p className={auth.description}>
          고친 값은 &lsquo;사장님 확인&rsquo;으로 저장돼요. 원래 고객 설명과
          사진에서 읽은 값은 이전 값으로 남아요.
        </p>
      </div>

      {banner === "saved" ? (
        <p className={auth.info} role="status">
          저장했어요. <Link href={detailHref}>접수 상세에서 확인하기</Link>
        </p>
      ) : null}
      {banner === "conflict" ? (
        <p className={auth.notice} role="alert">
          다른 곳에서 먼저 바뀌어 저장하지 않았어요. 최신 내용을 불러왔으니 다시
          확인해 주세요.
        </p>
      ) : null}

      {EDITABLE_FIELDS.map(({ key, label, placeholder }) => {
        const id = `edit-${key}`;
        const error = errors[key];
        return (
          <div key={key} className={auth.field}>
            <label htmlFor={id} className={auth.label}>
              {label}
            </label>
            <input
              id={id}
              className={auth.input}
              value={draft[key]}
              placeholder={placeholder}
              maxLength={MAX_FIELD_LENGTH + 20}
              aria-invalid={error ? "true" : undefined}
              aria-describedby={`${id}-now${error ? ` ${id}-error` : ""}`}
              disabled={saving}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [key]: e.target.value }))
              }
            />
            <FieldNow id={`${id}-now`} field={fieldOf(key)} now={now} />
            {error ? (
              <p id={`${id}-error`} className={auth.error}>
                {error}
              </p>
            ) : null}
          </div>
        );
      })}

      <p className={auth.hint}>
        미확인 항목은 비워 둬도 돼요. 주소·연락처·방문 시간은 예약과 연결돼 있어
        여기서 바꾸지 않아요.
      </p>

      <div className={auth.footer}>
        {message ? (
          <p className={auth.error} role="alert">
            {message}
          </p>
        ) : null}
        <button
          type="submit"
          className={`${auth.button} ${auth.primary} ${auth.full}`}
          disabled={saving}
        >
          {saving
            ? "저장 중…"
            : changes.length > 0
              ? `${changes.length}개 항목 저장`
              : "저장"}
        </button>
        <Link
          href={detailHref}
          className={`${auth.button} ${auth.secondary} ${auth.full} ${styles.plainLink}`}
        >
          취소
        </Link>
      </div>
    </form>
  );
}

/** 입력칸 아래: 지금 값이 어디서 왔는지, 이전 값이 무엇이었는지 */
function FieldNow({
  id,
  field,
  now,
}: {
  id: string;
  field: SummaryField | undefined;
  now: number;
}) {
  if (!field) {
    return (
      <p id={id} className={auth.hint}>
        아직 접수되지 않은 항목이에요.
      </p>
    );
  }
  const unconfirmed = field.state === "UNCONFIRMED" || field.value === null;
  const last = field.history?.at(-1);
  return (
    <p id={id} className={auth.hint}>
      지금: {SOURCE_LABEL[field.source]}
      {unconfirmed ? " · 미확인" : ""}
      {field.state === "INTERPRETATION" ? " · 매뉴얼 해석" : ""}
      {unconfirmed && field.reason ? ` (${field.reason})` : ""}
      {last ? (
        <>
          <br />
          이전 값: {last.value ?? "미확인"} ({SOURCE_LABEL[last.source]} ·{" "}
          {formatReceivedAt(last.changedAt, now)})
        </>
      ) : null}
    </p>
  );
}
