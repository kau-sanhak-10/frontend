"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  getCustomerInquiryVersion,
  saveCustomerVisitInfo,
} from "@/lib/customer-api";
import { emptyVisitInfo } from "@/lib/customer-intake";
import { demoVisitLocations } from "@/lib/customer-visit-demo";
import styles from "../intake.module.css";

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
  const version = useRef<number | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "blocked">(
    "idle",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    heading.current?.focus();
    return () => request.current?.abort();
  }, []);

  async function save() {
    if (state !== "idle" || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setState("saving");
    setError("");
    try {
      version.current ??= await getCustomerInquiryVersion(
        inquiryId,
        inquiryToken,
        controller.signal,
      );
      await saveCustomerVisitInfo(
        inquiryId,
        inquiryToken,
        version.current,
        {
          ...emptyVisitInfo,
          name: "일로 시연 고객",
          phone: "01000000001",
          address: destination.address,
        },
        destination,
        controller.signal,
      );
      if (!controller.signal.aborted) setState("saved");
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error instanceof ApiError ? error.status : undefined;
      if (status === 409 || status === 422) {
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
          disabled={state === "saving"}
          onClick={onBack}
        >
          <Image src="/customer/back.svg" width={22} height={22} alt="" />
        </button>
        <h1 ref={heading} tabIndex={-1}>
          시연용 방문정보
        </h1>
      </header>
      <section className={styles.content} aria-busy={state === "saving"}>
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
      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.primary}
          disabled={state === "saving" || state === "blocked"}
          onClick={state === "saved" ? onBack : save}
        >
          {state === "saved"
            ? "상담으로 돌아가기"
            : state === "saving"
              ? "방문정보 저장 중…"
              : "한국항공대학교로 저장"}
        </button>
      </footer>
    </main>
  );
}
