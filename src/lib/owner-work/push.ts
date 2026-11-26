// 이 브라우저의 Web Push 켜기·끄기 (FE-16 · B-27)
// 순서: 알림 권한 → 서비스 워커 등록 → 서버 공개키 → 브라우저 구독 → 서버에 구독 등록
// 서버 푸시는 내용 없이 오고, 서비스 워커(public/owner-sw.js)가 고정 문구로 알림을 띄웁니다.
import {
  fetchPushPublicKeyLive,
  subscribePushLive,
  unsubscribePushLive,
} from "./live-api.ts";

export const OWNER_SW_PATH = "/owner-sw.js";
/** 사장님 화면 범위에서만 동작하게 합니다. */
export const OWNER_SW_SCOPE = "/owner/";

/** 이 브라우저의 알림 지원·권한 상태 */
export type PushState =
  "UNSUPPORTED" | "NEEDS_INSTALL" | "default" | "granted" | "denied";

/** 브라우저 환경 정보 (테스트에서 바꿔 넣을 수 있게 분리) */
export type PushEnv = {
  userAgent: string;
  standalone: boolean;
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  permission: "default" | "granted" | "denied";
};

/** 지원·권한 상태 판단 (B-27 ①) */
export function pushStateOf(env: PushEnv): PushState {
  const ios = /iPhone|iPad|iPod/i.test(env.userAgent);
  // iPhone·iPad는 홈 화면에 추가한 앱에서만 Web Push를 받을 수 있어요.
  if (ios && !env.standalone) return "NEEDS_INSTALL";
  if (!env.hasNotification || !env.hasServiceWorker || !env.hasPushManager) {
    return "UNSUPPORTED";
  }
  return env.permission;
}

export function currentPushEnv(): PushEnv | null {
  if (typeof window === "undefined") return null;
  return {
    userAgent: navigator.userAgent,
    standalone:
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    hasNotification: "Notification" in window,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    permission: "Notification" in window ? Notification.permission : "default",
  };
}

export function detectPush(): PushState {
  const env = currentPushEnv();
  return env ? pushStateOf(env) : "UNSUPPORTED";
}

/** 서버 공개키(base64url) → 브라우저가 받는 바이트 */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const base64 = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** 기기 구분용 짧은 이름 (예: "Chrome / Android") */
export function deviceLabel(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /SamsungBrowser/.test(userAgent)
      ? "삼성 인터넷"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "브라우저";
  const os = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "Mac"
          : "기기";
  return `${browser} / ${os}`;
}

async function ownerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (
    (await navigator.serviceWorker.getRegistration(OWNER_SW_SCOPE)) ?? null
  );
}

/** 이 브라우저가 지금 푸시를 받도록 구독돼 있는지 */
export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await ownerRegistration();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/**
 * 푸시 켜기 결과
 * - DENIED: 사장님이 브라우저 알림을 거부함
 * - UNSUPPORTED: 이 브라우저는 Web Push를 못 씀
 * - UNAVAILABLE: 서버에 푸시 키가 없어 지금은 켤 수 없음
 * - FAILED: 그 밖의 문제 (다시 시도)
 */
export type EnablePushResult =
  | { ok: true }
  | { ok: false; code: "DENIED" | "UNSUPPORTED" | "UNAVAILABLE" | "FAILED" };

export async function enablePush(token: string): Promise<EnablePushResult> {
  if (detectPush() === "UNSUPPORTED" || detectPush() === "NEEDS_INSTALL") {
    return { ok: false, code: "UNSUPPORTED" };
  }
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, code: "DENIED" };

  const key = await fetchPushPublicKeyLive(token);
  if (!key.ok) {
    return {
      ok: false,
      code: key.code === "UNAVAILABLE" ? "UNAVAILABLE" : "FAILED",
    };
  }
  try {
    const reg = await navigator.serviceWorker.register(OWNER_SW_PATH, {
      scope: OWNER_SW_SCOPE,
    });
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(key.data),
      });
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, code: "FAILED" };
    }
    const saved = await subscribePushLive(token, {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: deviceLabel(navigator.userAgent),
    });
    if (!saved.ok) {
      // 서버에 등록하지 못한 구독은 브라우저에도 남기지 않습니다.
      await sub.unsubscribe().catch(() => false);
      return {
        ok: false,
        code: saved.code === "UNAVAILABLE" ? "UNAVAILABLE" : "FAILED",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "FAILED" };
  }
}

/**
 * 이 브라우저 푸시 끄기. 서버 해제가 실패해도 브라우저 구독은 지워서
 * 더 이상 알림이 뜨지 않게 합니다. 서버에 남은 구독은 발송 실패로 정리됩니다.
 */
export async function disablePush(token: string): Promise<{ ok: boolean }> {
  const sub = await currentSubscription();
  if (!sub) return { ok: true };
  const res = await unsubscribePushLive(token, sub.endpoint);
  await sub.unsubscribe().catch(() => false);
  return { ok: res.ok };
}

/**
 * 로그아웃 전에 이 브라우저 구독을 서버에서 지웁니다.
 * 다른 사람이 같은 기기로 로그인해도 이전 사장님 알림이 오지 않게 하려는 것입니다.
 * 실패하거나 오래 걸려도 로그아웃은 막지 않습니다. (최대 3초)
 */
export async function unsubscribeBeforeLogout(token: string): Promise<void> {
  try {
    await Promise.race([
      disablePush(token),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // 로그아웃을 막지 않습니다.
  }
}
