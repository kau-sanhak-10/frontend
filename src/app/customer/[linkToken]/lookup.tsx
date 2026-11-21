"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, requestApi } from "@/lib/api";
import { getCustomerVisitInfo } from "@/lib/customer-api";
import { getCustomerReservation } from "@/lib/customer-booking-api";
import {
  formatVisit,
  isBookingStatus,
  isVisitSlot,
  reservationStatuses,
} from "@/lib/customer-booking";
import {
  activeExpiry,
  asRecord,
  validId,
  validTimestamp,
  type InquiryAccess,
  type RecoveryPurpose,
} from "@/lib/customer-verification";
import CustomerVerificationForm from "../customer-verification-form";
import styles from "../intake.module.css";

type Restored = InquiryAccess & { expiresAt: string; photoConsent: boolean };
type Session = { accessToken: string; expiresAt: string };
type Item = { id: number; label: string; date: string; readOnly?: boolean };

export default function CustomerLookup({
  linkToken,
  bookingEnabled,
  recoveryEnabled,
  onBack,
  onRestore,
}: {
  linkToken: string;
  bookingEnabled: boolean;
  recoveryEnabled: boolean;
  onBack: () => void;
  onRestore: (value: Restored) => void;
}) {
  const [purpose, setPurpose] = useState<RecoveryPurpose | null>(() =>
    recoveryEnabled && bookingEnabled
      ? null
      : recoveryEnabled
        ? "INQUIRY_ACCESS"
        : "RESERVATION_LOOKUP",
  );
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [detail, setDetail] = useState<Awaited<
    ReturnType<typeof getCustomerReservation>
  > | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => {
        pending.current?.abort();
        setSession(null);
        setItems(null);
        setDetail(null);
        setBusy(false);
        setError("인증이 만료됐어요. 다시 인증해 주세요.");
      },
      Math.max(
        0,
        Math.min(2_147_483_647, Date.parse(session.expiresAt) - Date.now()),
      ),
    );
    return () => clearTimeout(timer);
  }, [session]);

  async function load(auth: Session, id?: number) {
    if (!purpose || pending.current) return;
    const inquiries = purpose === "INQUIRY_ACCESS";
    const root = `/api/v1/customer/${inquiries ? "inquiries" : "reservations"}`;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    const options = {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      signal: controller.signal,
    };
    try {
      if (id && inquiries) {
        const data = asRecord(
          await requestApi(`${root}/${id}/access-token`, {
            ...options,
            method: "POST",
          }),
        );
        const { inquiryId, inquiryToken, expiresAt } = data;
        if (
          inquiryId !== id ||
          typeof inquiryToken !== "string" ||
          !/^inq_[A-Za-z0-9_-]+$/.test(inquiryToken) ||
          !activeExpiry(expiresAt)
        )
          throw new Error("문의 접근을 확인하지 못했어요.");
        const info = await getCustomerVisitInfo(
          id,
          inquiryToken,
          controller.signal,
        );
        if (!controller.signal.aborted)
          onRestore({
            inquiryId: id,
            inquiryToken,
            expiresAt,
            photoConsent: info.photoConsent,
          });
      } else if (id) {
        const result = await getCustomerReservation(
          id,
          auth.accessToken,
          controller.signal,
        );
        if (!controller.signal.aborted) setDetail(result);
      } else {
        const data = asRecord(await requestApi(root, options));
        const rows = data[inquiries ? "inquiries" : "reservations"];
        if (!Array.isArray(rows)) throw new Error("목록을 확인하지 못했어요.");
        const list = rows.map((value): Item => {
          const row = asRecord(value);
          if (
            inquiries &&
            validId(row.inquiryId) &&
            validTimestamp(row.updatedAt) &&
            typeof row.status === "string"
          )
            return {
              id: row.inquiryId,
              date: row.updatedAt,
              readOnly: row.status === "CLOSED",
              label:
                row.status === "CLOSED"
                  ? "종료된 상담"
                  : typeof row.symptom === "string" && row.symptom
                    ? row.symptom
                    : "보일러 문의",
            };
          if (
            !inquiries &&
            isVisitSlot(row) &&
            validId(row.reservationId) &&
            isBookingStatus(row.status)
          )
            return {
              id: row.reservationId,
              date: row.startAt,
              label: reservationStatuses[row.status],
            };
          throw new Error("목록을 확인하지 못했어요.");
        });
        if (!controller.signal.aborted) setItems(list);
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
        setSession(null);
        setItems(null);
        setDetail(null);
        setError("조회 권한을 확인할 수 없어요. 다시 인증해 주세요.");
      } else if (
        id &&
        cause instanceof ApiError &&
        (cause.status === 404 || (inquiries && cause.code === "INQUIRY_CLOSED"))
      ) {
        setItems(null);
        setError("이 내역은 더 이상 열 수 없어요. 목록을 다시 불러와 주세요.");
      } else {
        setError("내용을 불러오지 못했어요. 다시 시도해 주세요.");
      }
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function back() {
    if (detail) {
      setDetail(null);
      return;
    }
    if (!purpose || !recoveryEnabled || !bookingEnabled) return onBack();
    setPurpose(null);
    setSession(null);
    setItems(null);
    setError("");
  }
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <button className={styles.textButton} disabled={busy} onClick={back}>
          이전
        </button>
        <h1>
          {detail
            ? "예약 상세"
            : purpose === "INQUIRY_ACCESS"
              ? "내 상담"
              : purpose
                ? "내 예약"
                : "기존 상담·예약 조회"}
        </h1>
      </header>
      <section className={styles.content} aria-busy={busy}>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {!purpose ? (
          <>
            <button
              className={styles.primary}
              onClick={() => setPurpose("INQUIRY_ACCESS")}
            >
              기존 상담 이어가기
            </button>
            <button
              className={styles.textButton}
              onClick={() => setPurpose("RESERVATION_LOOKUP")}
            >
              기존 예약 조회
            </button>
          </>
        ) : !session ? (
          <>
            <p>
              휴대전화번호를 인증하면 이 업체에 남긴{" "}
              {purpose === "INQUIRY_ACCESS" ? "본인 상담" : "본인 예약"}을 볼 수
              있어요.
            </p>
            <CustomerVerificationForm
              key={purpose}
              target={{ purpose, linkToken }}
              onVerified={(result) => {
                if (
                  !("accessToken" in result) ||
                  !result.accessToken ||
                  !result.expiresAt
                )
                  return;
                setSession(result);
                void load(result);
              }}
            />
          </>
        ) : detail ? (
          <dl className={styles.review}>
            <dt>예약번호</dt>
            <dd>{detail.reservationId}</dd>
            <dt>방문시간</dt>
            <dd>
              {formatVisit(detail.startAt)} ~ {formatVisit(detail.endAt, true)}
            </dd>
            <dt>방문주소</dt>
            <dd>{detail.address}</dd>
            <dt>예약 상태</dt>
            <dd>{reservationStatuses[detail.status]}</dd>
          </dl>
        ) : (
          <>
            {busy && <p role="status">불러오고 있어요…</p>}
            {items?.length === 0 && <p>조회할 수 있는 내역이 없어요.</p>}
            {items?.map((item) => (
              <button
                key={item.id}
                className={styles.textButton}
                disabled={busy || item.readOnly}
                onClick={() => void load(session, item.id)}
              >
                {formatVisit(item.date)} · {item.label}
              </button>
            ))}
            {items === null && error && (
              <button
                className={styles.textButton}
                disabled={busy}
                onClick={() => void load(session)}
              >
                목록 다시 불러오기
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
