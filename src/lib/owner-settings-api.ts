import { requestApi } from "./api.ts";
import {
  validateBusiness,
  validateBooking,
  validateWorkTypes,
  validateServiceAreas,
  type BusinessInfo,
  type BookingSettings,
  type WorkType,
  type ServiceArea,
} from "./owner-settings.ts";

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const textOrNull = (v: unknown) => v === null || typeof v === "string";
const numberOrNull = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isFinite(v));
export function ownerHeaders(token: string): HeadersInit {
  if (!token.startsWith("own_") || /[\s\r\n]/.test(token) || token.length <= 4)
    throw new Error("사장님 인증이 필요해요.");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function business(v: unknown): v is BusinessInfo {
  return (
    object(v) &&
    typeof v.businessName === "string" &&
    ["contactPhone", "address", "customerNotice", "serviceDescription"].every(
      (k) => textOrNull(v[k]),
    ) &&
    numberOrNull(v.lat) &&
    numberOrNull(v.lng) &&
    !Object.keys(validateBusiness(v as BusinessInfo)).length
  );
}
function booking(v: unknown): v is BookingSettings {
  return (
    object(v) &&
    Array.isArray(v.businessHours) &&
    v.businessHours.every(
      (h) =>
        object(h) &&
        typeof h.dayOfWeek === "number" &&
        typeof h.isClosed === "boolean" &&
        textOrNull(h.openTime) &&
        textOrNull(h.closeTime),
    ) &&
    textOrNull(v.lunchStart) &&
    textOrNull(v.lunchEnd) &&
    numberOrNull(v.maxDailyVisits) &&
    typeof v.bufferMinutes === "number" &&
    typeof v.autoBookingEnabled === "boolean" &&
    !Object.keys(validateBooking(v as BookingSettings)).length
  );
}
function workTypes(v: unknown): v is { workTypes: WorkType[] } {
  return (
    object(v) &&
    Array.isArray(v.workTypes) &&
    v.workTypes.every(
      (w) =>
        object(w) &&
        typeof w.workCategory === "string" &&
        typeof w.isActive === "boolean" &&
        typeof w.durationMinutes === "number" &&
        typeof w.autoBookingAllowed === "boolean",
    ) &&
    !Object.keys(validateWorkTypes(v.workTypes as WorkType[])).length
  );
}
function serviceAreas(v: unknown): v is { serviceAreas: ServiceArea[] } {
  return (
    object(v) &&
    Array.isArray(v.serviceAreas) &&
    v.serviceAreas.every(
      (a) =>
        object(a) &&
        typeof a.regionCode === "string" &&
        typeof a.regionName === "string",
    ) &&
    !Object.keys(validateServiceAreas(v.serviceAreas as ServiceArea[])).length
  );
}

// BE-03 PR #21의 DTO 기준. 토큰은 호출자가 전달하며 여기서 저장·로그·자동 재시도하지 않는다.
async function call<T>(
  token: string,
  path: string,
  valid: (value: unknown) => value is T,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const value = await requestApi<unknown>(`/api/v1/owner/${path}`, {
    method,
    headers: ownerHeaders(token),
    signal,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!valid(value))
    throw new Error("서버가 보낸 설정 정보를 확인하지 못했어요.");
  return value;
}
function requireValid(errors: Record<string, string>) {
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
}
export const getBusiness = (token: string, signal?: AbortSignal) =>
  call(token, "business", business, "GET", undefined, signal);
export function saveBusiness(
  token: string,
  value: BusinessInfo,
  signal?: AbortSignal,
) {
  requireValid(validateBusiness(value));
  return call(token, "business", business, "PUT", value, signal);
}
export const getBookingSettings = (token: string, signal?: AbortSignal) =>
  call(token, "booking-settings", booking, "GET", undefined, signal);
export function saveBookingSettings(
  token: string,
  value: BookingSettings,
  signal?: AbortSignal,
) {
  requireValid(validateBooking(value));
  const {
    businessHours,
    lunchStart,
    lunchEnd,
    maxDailyVisits,
    bufferMinutes,
    travelMode,
  } = value;
  // 자동 예약은 별도 PATCH. 기존 ON/OFF 상태를 PUT으로 덮어쓰지 않는다.
  return call(
    token,
    "booking-settings",
    booking,
    "PUT",
    {
      businessHours,
      lunchStart,
      lunchEnd,
      maxDailyVisits,
      bufferMinutes,
      travelMode,
    },
    signal,
  );
}
export const getWorkTypes = (token: string, signal?: AbortSignal) =>
  call(token, "work-types", workTypes, "GET", undefined, signal);
export function saveWorkTypes(
  token: string,
  value: WorkType[],
  signal?: AbortSignal,
) {
  requireValid(validateWorkTypes(value));
  return call(
    token,
    "work-types",
    workTypes,
    "PUT",
    { workTypes: value },
    signal,
  );
}
export const getServiceAreas = (token: string, signal?: AbortSignal) =>
  call(token, "service-areas", serviceAreas, "GET", undefined, signal);
export function saveServiceAreas(
  token: string,
  value: ServiceArea[],
  signal?: AbortSignal,
) {
  requireValid(validateServiceAreas(value));
  return call(
    token,
    "service-areas",
    serviceAreas,
    "PUT",
    { serviceAreas: value },
    signal,
  );
}
export function setAutoBooking(
  token: string,
  enabled: boolean,
  signal?: AbortSignal,
) {
  return call(
    token,
    "booking-settings/auto-booking",
    (v): v is { autoBookingEnabled: boolean } =>
      object(v) && typeof v.autoBookingEnabled === "boolean",
    "PATCH",
    { enabled },
    signal,
  );
}
export function setIntakePaused(
  token: string,
  intakePaused: boolean,
  signal?: AbortSignal,
) {
  return call(
    token,
    "intake",
    (v): v is { intakePaused: boolean } =>
      object(v) && typeof v.intakePaused === "boolean",
    "PATCH",
    { intakePaused },
    signal,
  );
}
