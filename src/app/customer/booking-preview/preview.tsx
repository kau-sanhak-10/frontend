"use client";

import { useCallback, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  kstDate,
  type AvailableVisits,
  type ConfirmedVisit,
  type VisitSlot,
} from "@/lib/customer-booking";
import CustomerBooking from "../booking";
import styles from "../intake.module.css";

export default function BookingPreview({ scene }: { scene: string }) {
  const calls = useRef(0);
  const loadCalls = useRef(0);
  const keys = useRef(new Set<string>());
  const [back, setBack] = useState(false);
  const [verifications, setVerifications] = useState(0);
  const [stats, setStats] = useState({ calls: 0, keys: 0 });
  const load = useCallback(
    async (from: string, signal: AbortSignal): Promise<AvailableVisits> => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      loadCalls.current++;
      if (scene === "load-error" && loadCalls.current === 1)
        throw new Error("preview");
      if (scene === "owner" || scene === "safety")
        throw new ApiError(
          422,
          scene === "owner" ? "AUTO_BOOKING_DISABLED" : "SAFETY_CHECK_REQUIRED",
          "",
        );
      if (scene === "expired") throw new ApiError(401, "TOKEN_EXPIRED", "");
      // 이 페이지에서만 쓰는 명시적 예시. 운영 경로에 시간 후보를 생성하지 않는다.
      const day = new Date(`${from}T00:00:00+09:00`);
      day.setTime(day.getTime() + 86400_000);
      const date = kstDate(day);
      return {
        workMinutes: 60,
        days: [
          {
            date,
            emptyReason: scene === "empty" ? "DAILY_LIMIT_REACHED" : null,
            slots:
              scene === "empty"
                ? []
                : ["10", "11", "14", "15"].map((hour) => ({
                    startAt: `${date}T${hour}:00:00+09:00`,
                    endAt: `${date}T${Number(hour) + 1}:00:00+09:00`,
                  })),
          },
        ],
      };
    },
    [scene],
  );
  function result(slot: VisitSlot): ConfirmedVisit {
    return {
      ...slot,
      reservationId: 101,
      status: "CONFIRMED",
      version: 0,
      notifications: [
        {
          recipient: "CUSTOMER",
          channel: "SMS",
          sendStatus: scene === "notification" ? "FAILED" : "PENDING",
        },
      ],
    };
  }
  return (
    <>
      <p className={styles.preview}>
        예약 화면 예시 · 실제 예약·문자 발송·외부 API 호출 없음
      </p>
      {back ? (
        <main className={styles.shell}>
          <section className={styles.content}>
            <h1>상담으로 돌아왔어요</h1>
            <p>화면 확인용이에요. 실제 상담은 바뀌지 않아요.</p>
            <button className={styles.primary} onClick={() => setBack(false)}>
              예약 화면 다시 보기
            </button>
          </section>
        </main>
      ) : (
        <CustomerBooking
          businessName="한빛 보일러 · 화면 예시"
          phoneVerified={scene !== "unverified"}
          onBack={() => setBack(true)}
          onLoad={load}
          onVerify={async () => {
            setVerifications((v) => v + 1);
            return true;
          }}
          onExisting={async () =>
            result({
              startAt: "2026-12-01T14:00:00+09:00",
              endAt: "2026-12-01T15:00:00+09:00",
            })
          }
          onConfirm={async (slot, key) => {
            calls.current++;
            keys.current.add(key);
            setStats({ calls: calls.current, keys: keys.current.size });
            if (calls.current === 1 && scene === "conflict")
              throw new ApiError(409, "SLOT_UNAVAILABLE", "");
            if (calls.current === 1 && scene === "network")
              throw new Error("preview lost response");
            if (scene === "existing")
              throw new ApiError(409, "RESERVATION_ALREADY_EXISTS", "", {
                reservationId: 101,
              });
            return result(slot);
          }}
        />
      )}
      <p className={styles.preview}>
        확인용: 확정 요청 {stats.calls}회 · 요청 식별자 {stats.keys}개 · 예시
        인증 {verifications}회
      </p>
    </>
  );
}
