import { ApiError } from "./api.ts";

export type VisitSlot = { startAt: string; endAt: string };
export type AvailableVisits = {
  workMinutes: number;
  days: { date: string; slots: VisitSlot[]; emptyReason: string | null }[];
};
export type ConfirmedVisit = VisitSlot & {
  reservationId: number;
  status: "CONFIRMED";
  version: number;
  notifications: { recipient: string; channel: string; sendStatus: string }[];
};

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const timestamp = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(
    v,
  ) &&
  Number.isFinite(Date.parse(v));
export const isVisitSlot = (
  v: unknown,
): v is VisitSlot & Record<string, unknown> =>
  object(v) &&
  timestamp(v.startAt) &&
  timestamp(v.endAt) &&
  Date.parse(v.endAt) > Date.parse(v.startAt);

export function kstDate(value = new Date()) {
  return new Date(value.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function readAvailableVisits(value: unknown): AvailableVisits {
  if (
    !object(value) ||
    !Number.isInteger(value.workMinutes) ||
    (value.workMinutes as number) <= 0 ||
    !Array.isArray(value.days) ||
    !value.days.every(
      (day) =>
        object(day) &&
        typeof day.date === "string" &&
        /^\d{4}-\d\d-\d\d$/.test(day.date) &&
        Number.isFinite(Date.parse(`${day.date}T00:00:00Z`)) &&
        new Date(`${day.date}T00:00:00Z`).toISOString().slice(0, 10) ===
          day.date &&
        Array.isArray(day.slots) &&
        day.slots.every(
          (item) =>
            isVisitSlot(item) && kstDate(new Date(item.startAt)) === day.date,
        ) &&
        new Set(day.slots.map((item: VisitSlot) => Date.parse(item.startAt)))
          .size === day.slots.length &&
        (day.emptyReason === null || typeof day.emptyReason === "string"),
    ) ||
    new Set(value.days.map((day) => day.date)).size !== value.days.length
  )
    throw new Error("방문 가능시간 응답을 확인할 수 없어요.");
  return value as AvailableVisits;
}

export function readConfirmedVisit(value: unknown): ConfirmedVisit {
  if (
    !object(value) ||
    !isVisitSlot(value) ||
    !Number.isSafeInteger(value.reservationId) ||
    (value.reservationId as number) <= 0 ||
    value.status !== "CONFIRMED" ||
    !Number.isSafeInteger(value.version) ||
    (value.version as number) < 0 ||
    !Array.isArray(value.notifications) ||
    !value.notifications.every(
      (n) =>
        object(n) &&
        typeof n.recipient === "string" &&
        typeof n.channel === "string" &&
        ["PENDING", "SENT", "FAILED", "SKIPPED"].includes(String(n.sendStatus)),
    )
  )
    throw new Error("예약 결과를 확인할 수 없어요.");
  return value as ConfirmedVisit;
}

export function formatVisit(value: string, timeOnly = false) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    ...(timeOnly ? {} : { month: "long", day: "numeric", weekday: "short" }),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

const ownerReasons: Record<string, string> = {
  OWNER_HANDLING:
    "사장님이 직접 확인 중인 문의예요. 상담에서 방문시간을 안내받아 주세요.",
  AUTO_BOOKING_DISABLED: "이 업체는 사장님이 방문시간을 확인해 드려요.",
  WORK_TYPE_NOT_CONFIRMED: "작업 내용을 먼저 확인해야 해요.",
  REQUIRED_INFO_UNCONFIRMED: "방문에 필요한 정보를 먼저 확인해야 해요.",
  SAFETY_CHECK_REQUIRED: "안전 확인이 필요해 사장님 확인 후 안내해 드려요.",
  OUT_OF_SERVICE_AREA: "방문 가능 지역인지 업체의 확인이 필요해요.",
  TRAVEL_TIME_UNAVAILABLE: "이동시간을 확인한 뒤 방문시간을 안내해 드려요.",
};
export function bookingIssue(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "INQUIRY_CLOSED")
      return {
        kind: "expired",
        message: "종료된 상담이에요. 기존 내용은 상담 화면에서 확인해 주세요.",
      } as const;
    if (ownerReasons[error.code])
      return { kind: "owner", message: ownerReasons[error.code] } as const;
    if ([401, 403].includes(error.status))
      return {
        kind: "expired",
        message: "상담 접근 권한을 확인해 주세요. 입력한 내용은 남겨 뒀어요.",
      } as const;
    if (error.code === "PHONE_NOT_VERIFIED")
      return {
        kind: "verify",
        message:
          "예약을 확정하려면 휴대전화 인증이 필요해요. 고른 시간은 유지돼요.",
      } as const;
    if (error.code === "SLOT_UNAVAILABLE")
      return {
        kind: "conflict",
        message:
          "선택한 시간에 예약할 수 없어요. 최신 시간 중에서 다시 골라 주세요.",
      } as const;
    if (error.code === "RESERVATION_ALREADY_EXISTS")
      return {
        kind: "existing",
        message: "이미 연결된 예약이 있어요. 기존 예약을 확인해 주세요.",
      } as const;
  }
  return {
    kind: "retry",
    message: "결과를 확인하지 못했어요. 다시 확인해 주세요.",
  } as const;
}

export const emptySlotReasons: Record<string, string> = {
  PAST: "지난 시간이에요.",
  OUTSIDE_BUSINESS_HOURS: "휴무 또는 영업시간 밖이에요.",
  LUNCH_BREAK: "점심시간이에요.",
  BLOCKED: "방문이 어려운 시간이에요.",
  DAILY_LIMIT_REACHED: "이날 예약이 마감됐어요.",
  OVERLAP: "다른 예약이 있어요.",
  TRAVEL_CONFLICT: "이동에 필요한 시간을 확보하기 어려워요.",
};
