import { ApiError, requestApi } from "./api.ts";
import { getCustomerVisitInfo } from "./customer-api.ts";
import {
  BookingStateChangedError,
  isVisitSlot,
  readAvailableVisits,
  readBookingResult,
  type VisitSlot,
} from "./customer-booking.ts";
import { asRecord, validId } from "./customer-verification.ts";

function access(id: number, token: string) {
  if (!Number.isSafeInteger(id) || id <= 0 || !/^inq_[^\s]+$/.test(token))
    throw new Error("문의 접근 권한을 확인해 주세요.");
  return {
    path: `/api/v1/customer/inquiries/${id}`,
    headers: { Authorization: `Bearer ${token}` },
  };
}

async function checkBookingStage(
  id: number,
  token: string,
  signal?: AbortSignal,
  rechecking = false,
) {
  const timeout = AbortSignal.timeout(8000);
  const latest = await getCustomerVisitInfo(
    id,
    token,
    signal ? AbortSignal.any([signal, timeout]) : timeout,
  );
  if (latest.reservationId) {
    // 결과를 받지 못한 확정 요청은 같은 키로 서버 결과를 재확인할 수 있어야 한다.
    if (rechecking) return;
    throw new ApiError(409, "RESERVATION_ALREADY_EXISTS", "", {
      reservationId: latest.reservationId,
    });
  }
  if (latest.bookingStage === "owner-review")
    throw new ApiError(409, "OWNER_HANDLING", "");
  if (
    latest.bookingStage !== "candidate" ||
    !latest.coordinates ||
    !latest.visit.phone
  )
    throw new BookingStateChangedError();
}

// DS-04 5.2 계약. 화면 예시에서 호출하지 않으며 FE-14에서 실제 서버와 통합 검증한다.
export async function getAvailableVisits(
  id: number,
  token: string,
  from: string,
  signal?: AbortSignal,
) {
  const { path, headers } = access(id, token);
  if (
    !/^\d{4}-\d\d-\d\d$/.test(from) ||
    !Number.isFinite(Date.parse(`${from}T00:00:00Z`)) ||
    new Date(`${from}T00:00:00Z`).toISOString().slice(0, 10) !== from
  )
    throw new Error("조회할 날짜를 확인해 주세요.");
  await checkBookingStage(id, token, signal);
  return readAvailableVisits(
    await requestApi(`${path}/available-slots?from=${from}&days=3`, {
      headers,
      signal,
    }),
  );
}

export async function confirmCustomerVisit(
  id: number,
  token: string,
  selected: VisitSlot,
  idempotencyKey: string,
  signal?: AbortSignal,
  rechecking = false,
) {
  const { path, headers } = access(id, token);
  if (
    !isVisitSlot(selected) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      idempotencyKey,
    )
  )
    throw new Error("예약 요청 식별자를 확인해 주세요.");
  await checkBookingStage(id, token, signal, rechecking);
  // 선택값만으로 예약 확정 여부를 판단하지 않는다. 같은 요청 재시도에는 같은 키를 쓴다.
  return readBookingResult(
    await requestApi(`${path}/reservations`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ startAt: selected.startAt }),
      signal,
    }),
    true,
  );
}

export async function getCustomerReservation(
  reservationId: number,
  token: string,
  signal: AbortSignal,
) {
  if (!validId(reservationId) || !/^(inq|cus)_[A-Za-z0-9_-]+$/.test(token))
    throw new Error("예약 접근을 확인해 주세요.");
  const raw = asRecord(
    await requestApi(`/api/v1/customer/reservations/${reservationId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    }),
  );
  if (raw.reservationId !== reservationId || typeof raw.address !== "string")
    throw new Error("예약 상세를 확인하지 못했어요.");
  return { ...readBookingResult(raw), address: raw.address };
}
