"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  customerFieldSpecs,
  getCustomerFields,
  isCustomerFieldEditable,
  saveCustomerField,
  type CustomerFieldKey,
} from "@/lib/customer-api";
import {
  demoVisitLocations,
  saveCustomerDemoVisit,
} from "@/lib/customer-visit-demo";
import styles from "../intake.module.css";
import { FieldList } from "../consultation";

export default function CustomerDemoVisit({
  inquiryId,
  inquiryToken,
  onBack,
}: {
  inquiryId: number;
  inquiryToken: string;
  onBack: () => void;
}) {
  const { origin, destination } = demoVisitLocations;
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "blocked">(
    "idle",
  );
  const [error, setError] = useState("");
  const [fields, setFields] = useState<
    Awaited<ReturnType<typeof getCustomerFields>> | "failed" | null
  >(null);
  const [fieldAttempt, setFieldAttempt] = useState(0);
  const [edit, setEdit] = useState<{
    key: CustomerFieldKey;
    value: string;
  } | null>(null);
  const [fieldSaving, setFieldSaving] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [fieldSaved, setFieldSaved] = useState(false);
  const fieldsReady = fields !== null && fields !== "failed";
  const busy = state === "saving" || fieldSaving;

  useEffect(() => {
    heading.current?.focus();
    return () => request.current?.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getCustomerFields(inquiryId, inquiryToken, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setFields(result);
      },
      () => {
        if (!controller.signal.aborted) setFields("failed");
      },
    );
    return () => controller.abort();
  }, [inquiryId, inquiryToken, fieldAttempt]);

  function reloadFields() {
    setFields(null);
    setFieldAttempt((attempt) => attempt + 1);
  }

  function selectField(key: CustomerFieldKey) {
    setEdit({
      key,
      value: fieldsReady
        ? (fields.fields.find((field) => field.key === key)?.value ?? "")
        : "",
    });
  }

  async function saveEdit() {
    if (!edit || !fieldsReady || busy || request.current) return;
    if (!isCustomerFieldEditable(edit.key, fields.fields)) {
      setFieldError(
        "조절기 모델명을 수정할 수 없어요. 다른 항목을 선택해 주세요.",
      );
      return;
    }
    if (!edit.value.trim()) {
      setFieldError("수정할 내용을 입력해 주세요.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setFieldSaving(true);
    setFieldError("");
    try {
      const result = await saveCustomerField(
        inquiryId,
        inquiryToken,
        fields.version,
        edit.key,
        edit.value,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setFields(result);
      setEdit(null);
      setFieldSaved(true);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (
        failure instanceof ApiError &&
        failure.code === "INQUIRY_VERSION_CONFLICT"
      ) {
        reloadFields();
        setFieldError(
          "접수 정보가 바뀌었어요. 위의 최신 내용을 확인한 뒤 다시 저장해 주세요.",
        );
      } else if (
        failure instanceof ApiError &&
        [401, 403, 404].includes(failure.status)
      ) {
        setFieldError(
          "이 문의를 더 이상 수정할 수 없어요. 입력한 내용은 남겨 뒀어요.",
        );
      } else {
        setFieldError(
          "수정 결과를 확인하지 못했어요. 입력한 내용은 남겨 뒀어요.",
        );
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setFieldSaving(false);
    }
  }

  async function save() {
    if (state !== "idle" || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setState("saving");
    setError("");
    try {
      const result = await saveCustomerDemoVisit(
        inquiryId,
        inquiryToken,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (result === "occupied") {
        setState("blocked");
        setError(
          "이미 다른 방문정보가 저장돼 있어요. 시연 정보로 바꾸지 않았어요.",
        );
      } else {
        setState("saved");
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error instanceof ApiError ? error.status : undefined;
      if (
        error instanceof ApiError &&
        error.code === "INQUIRY_VERSION_CONFLICT"
      ) {
        setState("idle");
        setError(
          "접수 내용이 갱신됐어요. 방문정보를 확인하고 다시 저장해 주세요.",
        );
      } else if (status === 409 || status === 422) {
        setState("blocked");
        setError(
          "이 상태에서는 다시 저장할 수 없어요. 상담으로 돌아가 문의를 확인해 주세요.",
        );
      } else if (status && [401, 403, 404].includes(status)) {
        setState("blocked");
        setError("이 문의에 더 이상 저장할 수 없어요. 상담으로 돌아가 주세요.");
      } else {
        setState("idle");
        setError(
          "저장 결과를 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
        );
      }
    } finally {
      request.current = null;
    }
  }

  return (
    <main className={styles.shell}>
      <p className={styles.preview}>
        시연용 접수 · 실제 출장 요청이나 예약이 아니에요.
      </p>
      <header className={styles.header}>
        <button
          className={styles.back}
          type="button"
          aria-label="상담으로 돌아가기"
          disabled={busy}
          onClick={onBack}
        >
          <Image src="/customer/back.svg" width={22} height={22} alt="" />
        </button>
        <h1 ref={heading} tabIndex={-1}>
          시연용 방문정보
        </h1>
      </header>
      <section className={styles.content} aria-busy={busy}>
        <section aria-labelledby="intake-summary">
          <h2 id="intake-summary">정리된 접수 정보</h2>
          {fields === null ? (
            <p role="status">접수 정보를 불러오고 있어요.</p>
          ) : fields === "failed" || fields.fields.length === 0 ? (
            <>
              <p role="status">
                {fields === "failed"
                  ? "접수 정보를 불러오지 못했어요. 방문정보는 계속 저장할 수 있어요."
                  : "아직 정리된 정보가 없어요. 상담과 사진은 그대로 남아 있어요."}
              </p>
              <button
                type="button"
                className={styles.textButton}
                onClick={reloadFields}
              >
                접수 정보 다시 불러오기
              </button>
            </>
          ) : (
            <FieldList fields={fields.fields} />
          )}
          {edit ? (
            <form
              className={`${styles.field} ${styles.intakeEdit}`}
              onSubmit={(event) => {
                event.preventDefault();
                void saveEdit();
              }}
            >
              <label htmlFor="intake-edit-key">수정할 항목</label>
              <select
                id="intake-edit-key"
                value={edit.key}
                disabled={busy || !fieldsReady}
                onChange={(event) => {
                  selectField(event.currentTarget.value as CustomerFieldKey);
                  setFieldError("");
                }}
              >
                {Object.entries(customerFieldSpecs).map(([key, { label }]) => {
                  const editable = isCustomerFieldEditable(
                    key,
                    fieldsReady ? fields.fields : [],
                  );
                  if (!editable && key !== edit.key) return null;
                  return (
                    <option key={key} value={key} disabled={!editable}>
                      {label}
                    </option>
                  );
                })}
              </select>
              <label htmlFor="intake-edit-value">수정 내용</label>
              <input
                id="intake-edit-value"
                value={edit.value}
                disabled={busy}
                maxLength={customerFieldSpecs[edit.key].maxLength}
                onChange={(event) =>
                  setEdit({ ...edit, value: event.target.value })
                }
              />
              {fieldError && (
                <p className={styles.error} role="alert">
                  {fieldError}
                </p>
              )}
              <button
                type="submit"
                className={styles.primary}
                disabled={busy || !fieldsReady}
              >
                {fieldSaving ? "저장 중…" : "수정 내용 저장"}
              </button>
              <button
                type="button"
                className={styles.textButton}
                disabled={busy}
                onClick={() => {
                  setEdit(null);
                  setFieldError("");
                }}
              >
                수정 취소
              </button>
            </form>
          ) : fieldsReady ? (
            <button
              type="button"
              className={styles.textButton}
              disabled={busy}
              onClick={() => {
                setFieldSaved(false);
                selectField("symptom");
              }}
            >
              접수 정보 수정
            </button>
          ) : null}
          {fieldSaved && <p role="status">접수 정보가 저장됐어요.</p>}
        </section>
        <h2>한국항공대학교로 방문 접수</h2>
        <dl className={styles.review}>
          <dt>출발지 예시</dt>
          <dd>
            {origin.name}
            <br />
            {origin.address}
          </dd>
          <dt>저장할 방문지</dt>
          <dd>
            {destination.name}
            <br />
            {destination.address}
          </dd>
        </dl>
        <p className={styles.hint}>
          방문지와 시연용 연락처만 이 문의에 저장해요. 지도 검색과 이동시간
          계산은 하지 않아요.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {state === "saved" && (
          <p role="status">문의 #{inquiryId}에 방문정보가 저장됐어요.</p>
        )}
      </section>
      {edit === null && (
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.primary}
            disabled={busy || state === "blocked"}
            onClick={state === "saved" ? onBack : save}
          >
            {state === "saved"
              ? "상담으로 돌아가기"
              : state === "saving"
                ? "방문정보 저장 중…"
                : "한국항공대학교로 저장"}
          </button>
        </footer>
      )}
    </main>
  );
}
