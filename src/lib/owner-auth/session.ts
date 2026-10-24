// ⚠️ 개발용 임시 로그인 유지입니다. 실제 세션·토큰 보관 방식은 백엔드와 정한 뒤 FE-07에서 교체합니다.
// 브라우저 저장소에는 인증번호나 비밀값을 넣지 않습니다.
import type { OwnerProfile } from "./types";

const SESSION_KEY = "ilro.owner.mockSession";
const NAME_KEY = "ilro.owner.mockNames";
const CHANGE_EVENT = "ilro:owner-session";

/** 로그인 유지 기간. 접수·인증 정책이 확정되면 맞춥니다. (임시 14일) */
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type OwnerSession = OwnerProfile & { expiresAt: number };

export type SessionState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "expired" }
  | { status: "active"; session: OwnerSession };

/** 저장된 문자열을 해석합니다. (화면 없이 테스트할 수 있는 순수 함수) */
export function parseSession(raw: string | null, now: number): SessionState {
  if (!raw) return { status: "none" };
  try {
    const data = JSON.parse(raw) as Partial<OwnerSession>;
    if (
      typeof data.expiresAt !== "number" ||
      typeof data.name !== "string" ||
      typeof data.loginPhone !== "string" ||
      typeof data.businessName !== "string" ||
      typeof data.businessPhone !== "string"
    ) {
      return { status: "none" };
    }
    if (data.expiresAt <= now) return { status: "expired" };
    return { status: "active", session: data as OwnerSession };
  } catch {
    return { status: "none" };
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 저장하지 않습니다.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// useSyncExternalStore용 구독·스냅샷
export function subscribeSession(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** 저장 문자열을 그대로 돌려주되, 만료되면 "expired"로 바꿔 화면이 다시 그려지게 합니다. */
export function getSessionSnapshot(): string | null {
  const raw = read(SESSION_KEY);
  if (raw && parseSession(raw, Date.now()).status === "expired") {
    return "expired";
  }
  return raw;
}

export const SERVER_SNAPSHOT = "__server__";

export function snapshotToState(snapshot: string | null): SessionState {
  if (snapshot === SERVER_SNAPSHOT) return { status: "loading" };
  if (snapshot === "expired") return { status: "expired" };
  return parseSession(snapshot, 0);
}

function savedNames(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(read(NAME_KEY) ?? "{}");
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

/** 인증 성공 후 로그인 상태를 저장합니다. 이전에 바꾼 이름이 있으면 유지합니다. */
export function saveSession(profile: OwnerProfile) {
  const name = savedNames()[profile.loginPhone] ?? profile.name;
  const session: OwnerSession = {
    ...profile,
    name,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  write(SESSION_KEY, JSON.stringify(session));
}

/** 이름을 바꿉니다. 다시 로그인해도 유지되도록 따로 보관합니다. */
export function updateSessionName(session: OwnerSession, name: string) {
  write(
    NAME_KEY,
    JSON.stringify({ ...savedNames(), [session.loginPhone]: name }),
  );
  write(SESSION_KEY, JSON.stringify({ ...session, name }));
}

/** 로그아웃: 이 브라우저의 로그인 상태를 지웁니다. */
export function clearSession() {
  write(SESSION_KEY, null);
}
