import type { Metadata } from "next";
import type { LoginNotice } from "@/lib/owner-auth/types";
import { OwnerLoginFlow } from "./owner-login-flow";

export const metadata: Metadata = { title: "사장님 로그인 | 일로" };

const NOTICES: Record<string, LoginNotice> = {
  expired: "SESSION_EXPIRED",
  logout: "LOGGED_OUT",
};

export default async function OwnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const { reason } = await searchParams;
  const key = typeof reason === "string" ? reason : undefined;
  const notice = key && Object.hasOwn(NOTICES, key) ? NOTICES[key] : undefined;
  return <OwnerLoginFlow notice={notice} />;
}
