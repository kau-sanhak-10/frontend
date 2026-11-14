"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  getCustomerVisitInfo,
  saveCustomerVisitInfo,
  visitSaveError,
} from "@/lib/customer-api";
import {
  VisitInputError,
  type IntakeBusiness,
  type VisitInfo,
} from "@/lib/customer-intake";
import CustomerIntake from "../intake";
import CustomerInquiryReview from "./demo-visit";
import styles from "../intake.module.css";

export default function CustomerVisit({
  business,
  inquiryId,
  inquiryToken,
  draft: initialDraft,
  onBack,
}: {
  business: IntakeBusiness;
  inquiryId: number;
  inquiryToken: string;
  draft: VisitInfo | null;
  onBack: (draft: VisitInfo | null) => void;
}) {
  const [snapshot, setSnapshot] = useState<Awaited<
    ReturnType<typeof getCustomerVisitInfo>
  > | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    void getCustomerVisitInfo(inquiryId, inquiryToken, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setSnapshot(data);
          setLoadError(false);
        }
      },
      () => {
        if (!controller.signal.aborted) setLoadError(true);
      },
    );
    return () => controller.abort();
  }, [inquiryId, inquiryToken, attempt]);

  if (editing && snapshot)
    return (
      <>
        {conflict && (
          <div className={styles.preview} role="status">
            최신 방문정보: {snapshot.visit.name || "이름 미입력"} ·{" "}
            {snapshot.visit.phone || "번호 미입력"}
            <br />
            {snapshot.visit.address || "주소 미입력"}{" "}
            {snapshot.visit.addressDetail}
            <br />
            {snapshot.visit.accessNote}
            <button
              type="button"
              className={styles.textButton}
              onClick={() => {
                setDraft(snapshot.visit);
                setFormKey((v) => v + 1);
                setConflict(false);
              }}
            >
              내 입력 대신 최신 방문정보 가져오기
            </button>
          </div>
        )}
        <CustomerIntake
          key={formKey}
          business={business}
          initialStep="visit"
          initialVisit={draft ?? snapshot.visit}
          addressReadOnly
          addressHint={
            snapshot.coordinates && snapshot.visit.address
              ? "저장된 방문 주소예요. 다른 주소 검색은 연결 준비 중이에요."
              : "주소 검색을 연결하고 있어요. 임의의 위치로 저장하지 않아요. 다른 정보는 입력해 둘 수 있어요."
          }
          onBackToChat={(value) => {
            setDraft(value);
            setEditing(false);
          }}
          onSaveVisit={async (value) => {
            setDraft(value);
            if (
              !snapshot.coordinates ||
              !snapshot.visit.address ||
              value.address.trim() !== snapshot.visit.address.trim()
            )
              throw new VisitInputError(
                "주소 검색 결과가 있어야 방문정보를 저장할 수 있어요. 입력은 남겨 뒀어요.",
                { address: "확인된 주소와 위치가 필요해요." },
              );
            const controller = new AbortController();
            request.current = controller;
            try {
              const version = await saveCustomerVisitInfo(
                inquiryId,
                inquiryToken,
                snapshot.version,
                value,
                snapshot.coordinates,
                controller.signal,
              );
              if (controller.signal.aborted) return;
              setSnapshot({ ...snapshot, version, visit: value });
              setSaved(true);
              setEditing(false);
              setConflict(false);
            } catch (error) {
              if (
                error instanceof ApiError &&
                error.code === "INQUIRY_VERSION_CONFLICT"
              ) {
                try {
                  const latest = await getCustomerVisitInfo(
                    inquiryId,
                    inquiryToken,
                    controller.signal,
                  );
                  if (!controller.signal.aborted) {
                    setSnapshot(latest);
                    setConflict(true);
                  }
                } catch {
                  /* 현재 입력과 기준 버전을 유지한다. 덮어쓰기 재시도는 하지 않는다. */
                }
              }
              throw visitSaveError(error);
            } finally {
              request.current = null;
            }
          }}
        />
      </>
    );

  return (
    <>
      {saved && (
        <p className={styles.preview} role="status">
          방문정보가 저장됐어요. 아직 방문 예약이 확정된 것은 아니에요.
        </p>
      )}
      {loadError && (
        <div className={styles.preview} role="alert">
          방문정보를 불러오지 못했어요. 접수 정보는 아래에서 확인할 수 있어요.
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              setLoadError(false);
              setAttempt((v) => v + 1);
            }}
          >
            방문정보 다시 불러오기
          </button>
        </div>
      )}
      <CustomerInquiryReview
        inquiryId={inquiryId}
        inquiryToken={inquiryToken}
        demo={false}
        onBack={() => onBack(draft)}
        onVisit={snapshot ? () => setEditing(true) : undefined}
      />
    </>
  );
}
