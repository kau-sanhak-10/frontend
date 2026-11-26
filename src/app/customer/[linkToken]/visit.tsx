"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  confirmCustomerVisit,
  getAvailableVisits,
  getCustomerReservation,
} from "@/lib/customer-booking-api";
import {
  getCustomerVisitInfo,
  saveCustomerVisitInfo,
  searchCustomerAddresses,
  visitSaveError,
  type CustomerAddress,
} from "@/lib/customer-api";
import {
  VisitInputError,
  type IntakeBusiness,
  type VisitInfo,
} from "@/lib/customer-intake";
import CustomerIntake from "../intake";
import CustomerBooking from "../booking";
import CustomerVerificationForm from "../customer-verification-form";
import CustomerInquiryReview from "./demo-visit";
import styles from "../intake.module.css";

export type VisitDraft = {
  visit: VisitInfo;
  version: number;
  addressMatch?: CustomerAddress | null;
};

export default function CustomerVisit({
  business,
  inquiryId,
  inquiryToken,
  draft: initialDraft,
  onBack,
  bookingEnabled,
}: {
  business: IntakeBusiness;
  inquiryId: number;
  inquiryToken: string;
  draft: VisitDraft | null;
  onBack: (draft: VisitDraft | null) => void;
  bookingEnabled: boolean;
}) {
  const [snapshot, setSnapshot] = useState<Awaited<
    ReturnType<typeof getCustomerVisitInfo>
  > | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [addressMatch, setAddressMatch] = useState(
    initialDraft?.addressMatch ?? null,
  );
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const request = useRef<AbortController | null>(null);
  const readBookingPhone = useCallback(
    async (signal: AbortSignal) =>
      (await getCustomerVisitInfo(inquiryId, inquiryToken, signal)).visit.phone,
    [inquiryId, inquiryToken],
  );
  const loadBooking = useCallback(
    async (from: string, signal: AbortSignal) => {
      const latest = await getCustomerVisitInfo(
        inquiryId,
        inquiryToken,
        signal,
      );
      if (latest.reservationId)
        throw new ApiError(409, "RESERVATION_ALREADY_EXISTS", "", {
          reservationId: latest.reservationId,
        });
      return getAvailableVisits(inquiryId, inquiryToken, from, signal);
    },
    [inquiryId, inquiryToken],
  );
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    void getCustomerVisitInfo(inquiryId, inquiryToken, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setSnapshot(data);
          setConflict(!!initialDraft && initialDraft.version !== data.version);
          setLoadError(false);
        }
      },
      () => {
        if (!controller.signal.aborted) setLoadError(true);
      },
    );
    return () => controller.abort();
  }, [inquiryId, inquiryToken, attempt, initialDraft]);

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
                setDraft({ visit: snapshot.visit, version: snapshot.version });
                setAddressMatch(null);
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
          initialVisit={draft?.visit ?? snapshot.visit}
          onSearchAddresses={(query, signal) =>
            searchCustomerAddresses(inquiryId, inquiryToken, query, signal)
          }
          onSelectAddress={setAddressMatch}
          addressHint="새 주소는 검색 결과에서 선택해 주세요."
          onBackToChat={(value) => {
            setDraft({
              visit: value,
              version: draft?.version ?? snapshot.version,
              addressMatch,
            });
            setEditing(false);
          }}
          onSaveVisit={async (value) => {
            setDraft({
              visit: value,
              version: draft?.version ?? snapshot.version,
              addressMatch,
            });
            if (conflict)
              throw new VisitInputError(
                "최신 방문정보를 확인한 뒤 가져와 주세요. 작성하던 내용은 그대로 있어요.",
              );
            const coordinates =
              addressMatch?.address === value.address.trim()
                ? { lat: addressMatch.lat, lng: addressMatch.lng }
                : value.address.trim() === snapshot.visit.address.trim()
                  ? snapshot.coordinates
                  : null;
            if (!coordinates)
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
                draft?.version ?? snapshot.version,
                value,
                coordinates,
                controller.signal,
              );
              if (controller.signal.aborted) return;
              setSnapshot({
                ...snapshot,
                version,
                visit: value,
                coordinates,
                phoneVerified:
                  snapshot.phoneVerified &&
                  snapshot.visit.phone.replace(/\D/g, "") ===
                    value.phone.replace(/\D/g, ""),
              });
              setDraft({ visit: value, version });
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

  if (showBooking && snapshot)
    return (
      <CustomerBooking
        businessName={business.name}
        phoneVerified={snapshot.phoneVerified}
        onBack={() => {
          setShowBooking(false);
          setAttempt((value) => value + 1);
        }}
        onLoad={loadBooking}
        onConfirm={(slot, key, signal) =>
          confirmCustomerVisit(inquiryId, inquiryToken, slot, key, signal)
        }
        onExisting={(signal, id) =>
          getCustomerReservation(
            id ?? snapshot.reservationId ?? 0,
            inquiryToken,
            signal,
          )
        }
        renderVerification={(verified) => (
          <CustomerVerificationForm
            target={{ purpose: "CUSTOMER_VERIFY", inquiryId, inquiryToken }}
            readPhone={readBookingPhone}
            onVerified={verified}
          />
        )}
      />
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
        waitingForOwner={
          bookingEnabled &&
          snapshot?.bookingStage === "owner-review" &&
          !snapshot.reservationId
        }
        onBooking={
          bookingEnabled &&
          snapshot &&
          (snapshot.reservationId ||
            (snapshot.bookingStage === "candidate" &&
              snapshot.coordinates &&
              snapshot.visit.phone))
            ? () => setShowBooking(true)
            : undefined
        }
      />
    </>
  );
}
