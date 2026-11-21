// 사장님 업무 알림·수신 설정·Web Push 구독 실제 API (BE-14 · FE-16)
// 방문 작업·메모·완료(BE-13) API는 아직 없어서 여기에는 알림 관련 API만 있습니다.
import { ApiError, requestApi } from "../api.ts";
import {
  mapNotification,
  mapPrefs,
  prefsRequest,
  type ServerNotification,
  type ServerNotificationPage,
} from "./live-mapper.ts";
import type {
  NotificationPrefs,
  OwnerNotification,
  WorkLoadResult,
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
