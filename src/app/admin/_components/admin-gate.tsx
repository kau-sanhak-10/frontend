"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import auth from "../../owner/_components/owner-auth.module.css";
import admin from "./admin.module.css";
import { logoutAdminLive } from "@/lib/admin/live-api";
import { clearAdminSession, type AdminSession } from "@/lib/admin/session";
import { useAdminSession } from "@/lib/admin/use-admin-session";

/**
 * 운영 화면 공통 입구 (O-01)
 * 운영자로 로그인하지 않았거나 만료되면 운영자 로그인으로 보냅니다.
 * 사장님 로그인은 다른 저장 칸이라 여기를 통과하지 못하고, 실제 권한은 서버가 다시 확인합니다.
 */
export function AdminGate({
  children,
}: {
  children: (session: AdminSession) => React.ReactNode;
}) {
  const router = useRouter();
  const state = useAdminSession();

  useEffect(() => {
    if (state.status === "expired") {
      clearAdminSession();
      router.replace("/admin/login?reason=expired");
    } else if (state.status === "none") {
      router.replace("/admin/login");
    }
  }, [state.status, router]);

  if (state.status !== "active") {
    return (
      <main className={auth.page}>
        <p className={auth.hint} aria-live="polite">
          운영자 로그인을 확인하고 있어요…
        </p>
      </main>
    );
  }
  return <>{children(state.session)}</>;
}

/** 화면 위 운영자 표시·로그아웃 */
export function AdminBar({ session }: { session: AdminSession }) {
  async function logout() {
    if (session.mode === "live" && session.token) {
      await logoutAdminLive(session.token);
    }
    clearAdminSession();
    // 입구의 '로그인 필요' 이동보다 먼저, 로그아웃 안내가 있는 로그인 화면으로 갑니다.
    window.location.replace("/admin/login?reason=logout");
  }
  return (
    <div className={admin.adminBar}>
      <span>
        운영 관리 · {session.name || "운영자"}
        <span className={admin.roleTag}>
          {session.role === "SUPER" ? "최고 운영자" : "운영자"}
        </span>
        {session.mode === "mock" ? " · 예시" : ""}
      </span>
      <button type="button" onClick={() => void logout()}>
        로그아웃
      </button>
    </div>
  );
}
