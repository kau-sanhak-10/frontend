// 운영자 로그인 상태 (FE-19 · O-01)
// - 사장님 로그인과 다른 저장 칸을 써서, 사장님 로그인으로는 운영 화면에 들어올 수 없습니다.
// - 이 탭에만 저장합니다(sessionStorage). 탭을 닫으면 다시 로그인해야 해요.
// - 서버 토큰은 발급부터 최대 12시간이고, 만료·로그아웃·권한 회수는 서버가 확인합니다.
import type { AdminRole } from "./types";

const KEY = "ilro.admin.session";
const CHANGE_EVENT = "ilro:admin-session";

/** 예시 로그인도 서버와 같이 12시간 */
export const ADMIN_SESSION_TTL_MS = 12 * 3_600_000;

export type AdminSession = {
  mode: "live" | "mock";
  /** 실제 로그인 토큰 (adm_…). 예시 로그인은 없음 */
  token?: string;
  name: string;
  role: AdminRole;
  phone: string;
  expiresAt: number;
};

export type AdminSessionState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "expired" }
  | { status: "active"; session: AdminSession };

/** 저장된 문자열 해석 (화면 없이 테스트할 수 있는 순수 함수) */
export function parseAdminSession(
  raw: string | null,
  now: number,
): AdminSessionState {
  if (!raw) return { status: "none" };
  try {
    const s = JSON.parse(raw) as Partial<AdminSession>;
    const validMode =
      (s.mode === "live" &&
        typeof s.token === "string" &&
        /^adm_[A-Za-z0-9_-]+$/.test(s.token)) ||
      (s.mode === "mock" && s.token === undefined);
    if (
      !validMode ||
      (s.role !== "SUPER" && s.role !== "STAFF") ||
      typeof s.name !== "string" ||
      typeof s.phone !== "string" ||
      typeof s.expiresAt !== "number" ||
      !Number.isFinite(s.expiresAt)
    ) {
      return { status: "none" };
    }
    if (s.expiresAt <= now) return { status: "expired" };
    return { status: "active", session: s as AdminSession };
  } catch {
    return { status: "none" };
  }
}

function read(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, value);
  } catch {
    // 저장소를 쓸 수 없으면 저장하지 않습니다.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function saveAdminSession(session: AdminSession) {
  const raw = JSON.stringify(session);
  if (parseAdminSession(raw, Date.now()).status !== "active")
    throw new Error("운영자 로그인 정보가 올바르지 않아요.");
  write(raw);
}

export function clearAdminSession() {
  write(null);
}

// useSyncExternalStore용
export function subscribeAdminSession(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener("focus", onChange);
  // 켜 둔 채 만료돼도 1분 안에 화면에 반영합니다.
  const timer = window.setInterval(onChange, 60_000);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener("focus", onChange);
    window.clearInterval(timer);
  };
}

export function getAdminSnapshot(): string | null {
  const raw = read();
  if (raw && parseAdminSession(raw, Date.now()).status === "expired")
    return "expired";
  return raw;
}

export const ADMIN_SERVER_SNAPSHOT = "__server__";

export function adminSnapshotToState(
  snapshot: string | null,
): AdminSessionState {
  if (snapshot === ADMIN_SERVER_SNAPSHOT) return { status: "loading" };
  if (snapshot === "expired") return { status: "expired" };
  return parseAdminSession(snapshot, 0);
}
