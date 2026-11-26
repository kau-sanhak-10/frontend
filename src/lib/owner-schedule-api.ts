import { ApiError, requestApi } from "./api.ts";
import { ownerHeaders } from "./owner-settings-api.ts";
import { workCategories, type WorkCategory } from "./owner-settings.ts";

export const seoul = "Asia/Seoul";
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: seoul,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const clockFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: seoul,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export const scheduleDate = (time: Date | number) => dateFormat.format(time);
export const scheduleClock = (time: number) => clockFormat.format(time);
export const scheduleIso = (day: string, clock: string) =>
  `${day}T${clock}:00+09:00`;
export function shiftDay(day: string, amount: number) {
  return scheduleDate(
    Date.parse(scheduleIso(day, "12:00")) + amount * 86_400_000,
  );
}

export type ScheduleItem = {
  id: string;
  kind: "visit" | "block";
  startAt: number;
  endAt: number;
  name: string;
  title: string;
  address?: string;
  source?: "AI 접수" | "전화" | "문자·메신저" | "기타" | "수동 등록";
  status:
    "예약 요청" | "확정" | "변경 요청" | "변경 제안" | "완료" | "취소" | "차단";
  travel?:
    | "unknown"
    | {
        distance?: number;
        distanceMeters?: number;
        minutes: number;
        conflict?: boolean;
      };
  memo?: string;
  inquiryId?: number | null;
  serverId?: number;
};

type Period = { startAt: string; endAt: string };
type Block = Period & { blockId: number; reason: string | null };
type Visit = Period & {
  reservationId: number;
  inquiryId: number | null;
  status: "REQUESTED" | "CONFIRMED" | "CANCELED" | "COMPLETED";
  customerName: string | null;
  workCategory: WorkCategory | null;
  address: string | null;
  isManual: boolean;
  activeChange: { status: "REQUESTED" | "PROPOSED" } | null;
  travelMinutes: number | null;
  travelDistanceMeters?: number | null;
  travelStatus: "OK" | "CONFLICT" | "UNKNOWN" | "NO_ORIGIN";
};

export type ScheduleDetail = {
  reservationId: number;
  version: number;
  status: Visit["status"];
  startAt: string;
  endAt: string;
  activeChange: {
    changeId: number;
    status: "REQUESTED" | "PROPOSED";
    proposed: { address: string | null } | null;
  } | null;
};

export function ownerScheduleRequest<T>(
  token: string,
  path: string,
  {
    method = "GET",
    body,
    key,
    signal = AbortSignal.timeout(12000),
  }: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: object;
    key?: string;
    signal?: AbortSignal;
  } = {},
) {
  const headers = new Headers(ownerHeaders(token));
  if (key) headers.set("Idempotency-Key", key);
  return requestApi<T>(`/api/v1/owner/${path}`, {
    method,
    headers,
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function loadOwnerSchedule(
  token: string,
  from: string,
  to: string,
) {
  const response = await ownerScheduleRequest<{
    from: string;
    to: string;
    days: Array<{ date: string; blocks: Block[]; visits: Visit[] }>;
  }>(token, `schedule?${new URLSearchParams({ from, to })}`);
  if (
    response?.from !== from ||
    response.to !== to ||
    !Array.isArray(response.days)
  )
    throw new Error("일정 범위를 확인하지 못했어요.");
  const items = new Map<string, ScheduleItem>();
  for (const { blocks, visits } of response.days) {
    for (const { blockId, reason, startAt, endAt } of blocks) {
      const id = `block-${blockId}`;
      items.set(id, {
        id,
        serverId: blockId,
        kind: "block",
        status: "차단",
        startAt: Date.parse(startAt),
        endAt: Date.parse(endAt),
        title: "",
        name: reason || "개인 일정",
        memo: reason ?? undefined,
      });
    }
    for (const visit of visits) {
      const {
        reservationId,
        status,
        activeChange,
        travelMinutes,
        travelDistanceMeters,
        travelStatus,
      } = visit;
      const id = `reservation-${reservationId}`;
      items.set(id, {
        id,
        serverId: reservationId,
        inquiryId: visit.inquiryId,
        kind: "visit",
        name: visit.customerName || "고객",
        title:
          (visit.workCategory && workCategories[visit.workCategory]) ||
          "방문 예약",
        source: visit.isManual ? "수동 등록" : "AI 접수",
        address: visit.address ?? undefined,
        startAt: Date.parse(visit.startAt),
        endAt: Date.parse(visit.endAt),
        status:
          status === "CANCELED"
            ? "취소"
            : status === "COMPLETED"
              ? "완료"
              : status === "REQUESTED"
                ? "예약 요청"
                : activeChange?.status === "PROPOSED"
                  ? "변경 제안"
                  : activeChange?.status === "REQUESTED"
                    ? "변경 요청"
                    : "확정",
        travel:
          typeof travelMinutes === "number" &&
          Number.isFinite(travelMinutes) &&
          travelMinutes >= 0
            ? {
                minutes: travelMinutes,
                conflict: travelStatus === "CONFLICT",
                distanceMeters:
                  typeof travelDistanceMeters === "number" &&
                  Number.isFinite(travelDistanceMeters) &&
                  travelDistanceMeters >= 0
                    ? travelDistanceMeters
                    : undefined,
              }
            : travelStatus === "UNKNOWN" || travelStatus === "CONFLICT"
              ? "unknown"
              : undefined,
      });
    }
  }
  if (
    [...items.values()].some(
      (v) =>
        !Number.isSafeInteger(v.serverId) ||
        (v.serverId ?? 0) < 1 ||
        !Number.isFinite(v.startAt) ||
        !Number.isFinite(v.endAt) ||
        v.startAt >= v.endAt,
    )
  )
    throw new Error("일정 정보를 확인하지 못했어요.");
  return [...items.values()];
}

export function scheduleIssue(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "로그인이 만료됐어요. 다시 로그인해 주세요.";
    if (error.status === 403) return "이 업체의 일정을 변경할 권한이 없어요.";
    if (error.status === 404)
      return "일정을 찾지 못했어요. 목록을 새로 불러와 주세요.";
    if (
      error.code === "SLOT_UNAVAILABLE" ||
      error.code === "RESERVATION_VERSION_CONFLICT"
    )
      return "선택한 시간이 불가능하거나 예약이 먼저 바뀌었어요. 기존 예약은 그대로예요.";
    if (
      error.code === "TRAVEL_TIME_UNAVAILABLE" ||
      error.code === "MAP_UNAVAILABLE"
    )
      return "이동시간을 확인하지 못했어요. 주소나 시간을 확인한 뒤 다시 시도해 주세요.";
    if (error.status === 400)
      return "날짜·시간, 연락처, 작업 종류와 주소를 확인해 주세요.";
    if (error.status === 409)
      return "기존 일정과 충돌했어요. 최신 일정을 먼저 확인해 주세요.";
  }
  return "요청 결과를 확인하지 못했어요. 입력을 유지했으니 다시 시도해 주세요.";
}
