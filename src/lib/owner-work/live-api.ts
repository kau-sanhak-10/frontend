// 사장님 업무 알림·수신 설정·Web Push 구독 실제 API (BE-14 · FE-16)
// 방문 작업·메모·완료(BE-13 · B-23~B-25) API도 여기 있습니다.
import { ApiError, requestApi } from "../api.ts";
import {
  mapNotification,
  mapReservationDetail,
  mapSchedule,
  mapWorkNote,
  visitRange,
  type ServerReservationDetail,
  type ServerSchedule,
  type ServerWorkNote,
  mapPrefs,
  prefsRequest,
  type ServerNotification,
  type ServerNotificationPage,
} from "./live-mapper.ts";
import type {
  NotificationPrefs,
  OwnerNotification,
  Visit,
  WorkLoadResult,
  WorkNote,
  WorkSaveResult,
} from "./types";

/** 알림은 최근 것부터 이만큼만 불러옵니다. (서버 최대 100) */
export const NOTIFICATION_PAGE_SIZE = 100;

const auth = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

/** 401이면 로그인이 끝난 것이라 화면이 로그인 화면으로 보내야 합니다. */
export function isExpired(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

function loadFailure(error: unknown): {
  ok: false;
  code: "LOAD_FAILED" | "NOT_FOUND";
} {
  if (error instanceof ApiError && error.status === 404) {
    return { ok: false, code: "NOT_FOUND" };
  }
  return { ok: false, code: "LOAD_FAILED" };
}

function saveFailure(error: unknown): {
  ok: false;
  code: "SAVE_FAILED" | "NOT_FOUND" | "INVALID";
} {
  if (error instanceof ApiError && error.status === 404) {
    return { ok: false, code: "NOT_FOUND" };
  }
  if (error instanceof ApiError && error.status === 400) {
    return { ok: false, code: "INVALID" };
  }
  return { ok: false, code: "SAVE_FAILED" };
}

// ── 업무 알림 (B-26) ─────────────────────────────

/** 최근 알림 목록. 서버가 로그인한 업체 알림만 돌려줍니다. */
export async function fetchNotificationsLive(
  token: string,
): Promise<WorkLoadResult<OwnerNotification[]>> {
  try {
    const res = await requestApi<ServerNotificationPage>(
      `/api/v1/owner/notifications?page=0&size=${NOTIFICATION_PAGE_SIZE}`,
      { headers: auth(token) },
    );
    return { ok: true, data: res.content.map(mapNotification) };
  } catch (error) {
    return loadFailure(error);
  }
}

/** 읽음 표시. 이미 읽었어도 성공이고, 문의·예약 상태는 바뀌지 않습니다. */
export async function markNotificationReadLive(
  token: string,
  notificationId: string,
): Promise<WorkSaveResult<OwnerNotification>> {
  try {
    const res = await requestApi<ServerNotification>(
      `/api/v1/owner/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: "POST", headers: auth(token) },
    );
    return { ok: true, data: mapNotification(res) };
  } catch (error) {
    return saveFailure(error);
  }
}

// ── 알림 수신 설정 (B-27) ─────────────────────────────

export async function fetchNotificationPrefsLive(
  token: string,
): Promise<WorkLoadResult<NotificationPrefs>> {
  try {
    const res = await requestApi<Record<string, boolean>>(
      "/api/v1/owner/notification-settings",
      { headers: auth(token) },
    );
    return { ok: true, data: mapPrefs(res) };
  } catch (error) {
    return loadFailure(error);
  }
}

export async function saveNotificationPrefsLive(
  token: string,
  prefs: NotificationPrefs,
): Promise<WorkSaveResult<NotificationPrefs>> {
  try {
    const res = await requestApi<Record<string, boolean>>(
      "/api/v1/owner/notification-settings",
      {
        method: "PUT",
        headers: auth(token),
        body: JSON.stringify(prefsRequest(prefs)),
      },
    );
    return { ok: true, data: mapPrefs(res) };
  } catch (error) {
    return saveFailure(error);
  }
}

// ── 브라우저 푸시 구독 (B-27) ─────────────────────────────

/**
 * 푸시 요청 결과
 * - UNAVAILABLE: 서버에 푸시 키가 없어 지금은 켤 수 없음 (503 PUSH_UNAVAILABLE)
 * - INVALID: 서버가 이 브라우저의 구독 정보를 받지 않음 (400)
 * - FAILED: 네트워크·그 밖의 문제
 */
export type PushApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "UNAVAILABLE" | "INVALID" | "FAILED" };

function pushFailure(error: unknown): {
  ok: false;
  code: "UNAVAILABLE" | "INVALID" | "FAILED";
} {
  if (error instanceof ApiError && error.status === 503) {
    return { ok: false, code: "UNAVAILABLE" };
  }
  if (error instanceof ApiError && error.status === 400) {
    return { ok: false, code: "INVALID" };
  }
  return { ok: false, code: "FAILED" };
}

/** 브라우저가 구독을 만들 때 쓰는 서버 공개키 */
export async function fetchPushPublicKeyLive(
  token: string,
): Promise<PushApiResult<string>> {
  try {
    const res = await requestApi<{ publicKey: string }>(
      "/api/v1/owner/push/public-key",
      { headers: auth(token) },
    );
    if (!res?.publicKey) return { ok: false, code: "UNAVAILABLE" };
    return { ok: true, data: res.publicKey };
  } catch (error) {
    return pushFailure(error);
  }
}

/** 브라우저 PushSubscription.toJSON() 모양 */
export type PushSubscriptionBody = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
};

/** 이 브라우저 구독 등록. 같은 주소면 서버가 갱신합니다. */
export async function subscribePushLive(
  token: string,
  body: PushSubscriptionBody,
): Promise<PushApiResult<null>> {
  try {
    await requestApi<null>("/api/v1/owner/push-subscriptions", {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify(body),
    });
    return { ok: true, data: null };
  } catch (error) {
    return pushFailure(error);
  }
}

/** 이 브라우저 구독 해제. 서버에 없어도 성공입니다. */
export async function unsubscribePushLive(
  token: string,
  endpoint: string,
): Promise<PushApiResult<null>> {
  try {
    await requestApi<null>("/api/v1/owner/push-subscriptions", {
      method: "DELETE",
      headers: auth(token),
      body: JSON.stringify({ endpoint }),
    });
    return { ok: true, data: null };
  } catch (error) {
    return pushFailure(error);
  }
}

// ── 방문 작업 (B-23) ─────────────────────────────

const reservationPath = (id: string, tail = "") =>
  `/api/v1/owner/reservations/${encodeURIComponent(id)}${tail}`;

/** 방문 일정: 지난 7일 ~ 앞으로 23일의 방문 (서버 일정 API, 최대 31일) */
export async function fetchVisitsLive(
  token: string,
  now = Date.now(),
): Promise<WorkLoadResult<Visit[]>> {
  const { from, to } = visitRange(now);
  try {
    const res = await requestApi<ServerSchedule>(
      `/api/v1/owner/schedule?from=${from}&to=${to}`,
      { headers: auth(token) },
    );
    return { ok: true, data: mapSchedule(res) };
  } catch (error) {
    return loadFailure(error);
  }
}

/** 방문 작업정보. 다른 업체 예약이면 서버가 404로 숨깁니다. */
export async function fetchVisitLive(
  token: string,
  visitId: string,
): Promise<WorkLoadResult<Visit>> {
  try {
    const res = await requestApi<ServerReservationDetail>(
      reservationPath(visitId),
      { headers: auth(token) },
    );
    return { ok: true, data: mapReservationDetail(res) };
  } catch (error) {
    return loadFailure(error);
  }
}

// ── 작업 메모 (B-24) ─────────────────────────────

export async function fetchWorkNoteLive(
  token: string,
  visitId: string,
): Promise<WorkLoadResult<WorkNote | null>> {
  try {
    const res = await requestApi<ServerWorkNote>(
      reservationPath(visitId, "/work-note"),
      { headers: auth(token) },
    );
    return { ok: true, data: mapWorkNote(res) };
  } catch (error) {
    return loadFailure(error);
  }
}

/** 메모 전체를 바꿉니다. 빈 내용이면 메모를 비웁니다. */
export async function saveWorkNoteLive(
  token: string,
  visitId: string,
  content: string,
  now = Date.now(),
): Promise<WorkSaveResult<WorkNote>> {
  try {
    const res = await requestApi<ServerWorkNote>(
      reservationPath(visitId, "/work-note"),
      {
        method: "PUT",
        headers: auth(token),
        body: JSON.stringify({ content: content.trim() }),
      },
    );
    // 비운 메모는 서버가 저장 시각을 주지 않을 수 있어 지금 시각으로 보여 줍니다.
    return {
      ok: true,
      data: mapWorkNote(res) ?? {
        content: res.content ?? "",
        createdAt: now,
        updatedAt: now,
      },
    };
  } catch (error) {
    return saveFailure(error);
  }
}

// ── 작업 완료·완료 정정 (B-25) ─────────────────────────────

/** 완료·정정 실패 → 화면 코드 */
export function workActionFailure(error: unknown): {
  ok: false;
  code: Exclude<WorkSaveResult<never>, { ok: true }>["code"];
} {
  if (error instanceof ApiError) {
    if (error.code === "RESERVATION_VERSION_CONFLICT") {
      return { ok: false, code: "CONFLICT" };
    }
    if (error.code === "RESERVATION_NOT_STARTED") {
      return { ok: false, code: "NOT_STARTED" };
    }
    if (
      error.code === "RESERVATION_CANCELED" ||
      error.code === "RESERVATION_NOT_COMPLETED" ||
      error.status === 409 ||
      error.status === 422
    ) {
      return { ok: false, code: "NOT_ALLOWED" };
    }
  }
  return saveFailure(error);
}

/**
 * 완료·정정 응답에는 완료 시각이 없어서, 처리 뒤 작업정보를 다시 받아 돌려줍니다.
 * 다시 받기에 실패하면 응답의 상태·버전만 바꾼 화면 값을 돌려줍니다. (처리 자체는 성공)
 */
async function afterAction(
  token: string,
  visitId: string,
  fallback: Visit,
): Promise<Visit> {
  const fresh = await fetchVisitLive(token, visitId);
  return fresh.ok ? fresh.data : fallback;
}

/** 작업 완료. 이미 완료된 예약이면 서버가 성공으로 답하고 이력을 더 만들지 않습니다. */
export async function completeVisitLive(
  token: string,
  visit: Visit,
  now = Date.now(),
): Promise<WorkSaveResult<Visit>> {
  try {
    const res = await requestApi<{
      status: Visit["status"];
      version: number | null;
      alreadyCompleted: boolean;
    }>(reservationPath(visit.id, "/complete"), {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ version: visit.version }),
    });
    const data = await afterAction(token, visit.id, {
      ...visit,
      status: res.status ?? "COMPLETED",
      version: res.version ?? visit.version,
      completedAt: visit.completedAt ?? now,
    });
    return { ok: true, data };
  } catch (error) {
    return workActionFailure(error);
  }
}

/** 실수로 한 완료 정정. 예약 확정으로 돌아가고 사유는 예약 이력에 남습니다. */
export async function correctCompletionLive(
  token: string,
  visit: Visit,
  reason: string,
): Promise<WorkSaveResult<Visit>> {
  try {
    const res = await requestApi<{
      status: Visit["status"];
      version: number | null;
    }>(reservationPath(visit.id, "/complete-correction"), {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ version: visit.version, reason: reason.trim() }),
    });
    const data = await afterAction(token, visit.id, {
      ...visit,
      status: res.status ?? "CONFIRMED",
      version: res.version ?? visit.version,
      completedAt: null,
    });
    return { ok: true, data };
  } catch (error) {
    return workActionFailure(error);
  }
}
