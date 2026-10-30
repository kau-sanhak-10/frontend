"use client";

import { useOwnerSession } from "@/lib/owner-auth/use-owner-session";
import type { OwnerSession } from "@/lib/owner-auth/session";
import { mockBusinessIdOf } from "./mock-api";

export type OwnerBusinessState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "expired" }
  /** 로그인은 됐지만 연결된 업체를 찾지 못함 */
  | { status: "unlinked" }
  | { status: "ready"; session: OwnerSession; businessId: string };

/**
 * 로그인한 사장님의 업체를 알려줍니다.
 * FE-07에서는 서버가 로그인 토큰으로 업체를 정하므로 mockBusinessIdOf를 바꿉니다.
 */
export function useOwnerBusiness(): OwnerBusinessState {
  const session = useOwnerSession();
  if (session.status !== "active") return session;
  const businessId = mockBusinessIdOf(session.session.loginPhone);
  if (!businessId) return { status: "unlinked" };
  return { status: "ready", session: session.session, businessId };
}
