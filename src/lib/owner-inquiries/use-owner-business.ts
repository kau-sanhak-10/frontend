"use client";

import { useOwnerSession } from "@/lib/owner-auth/use-owner-session";
import type { OwnerSession } from "@/lib/owner-auth/session";
import { mockBusinessIdOf } from "./mock-api";

export type OwnerBusinessState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "expired" }
  | { status: "live"; session: OwnerSession & { accessToken: string } }
  /** 로그인은 됐지만 연결된 업체를 찾지 못함 */
  | { status: "unlinked" }
  | { status: "ready"; session: OwnerSession; businessId: string };

/**
 * 실제 세션으로 화면 검수용 업체나 접수 데이터를 읽지 않습니다.
 */
export function useOwnerBusiness(): OwnerBusinessState {
  const session = useOwnerSession();
  if (session.status !== "active") return session;
  if (session.session.accessToken)
    return {
      status: "live",
      session: { ...session.session, accessToken: session.session.accessToken },
    };
  const businessId = mockBusinessIdOf(session.session.loginPhone);
  if (!businessId) return { status: "unlinked" };
  return { status: "ready", session: session.session, businessId };
}
