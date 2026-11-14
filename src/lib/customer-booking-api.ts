import { requestApi } from "./api.ts";
import {
  isVisitSlot,
  readAvailableVisits,
  readConfirmedVisit,
  type VisitSlot,
} from "./customer-booking.ts";

function access(id: number, token: string) {
  if (!Number.isSafeInteger(id) || id <= 0 || !/^inq_[^\s]+$/.test(token))
    throw new Error("문의 접근 권한을 확인해 주세요.");
  return {
    path: `/api/v1/customer/inquiries/${id}`,
    headers: { Authorization: `Bearer ${token}` },
  };
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
) {
  const { path, headers } = access(id, token);
  if (
    !isVisitSlot(selected) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      idempotencyKey,
    )
  )
    throw new Error("예약 요청 식별자를 확인해 주세요.");
  // 선택값만으로 예약 확정 여부를 판단하지 않는다. 같은 요청 재시도에는 같은 키를 쓴다.
  return readConfirmedVisit(
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
  );
}
