import type { Metadata } from "next";
import { AdminLogin } from "./admin-login";

export const metadata: Metadata = { title: "운영자 로그인 | 운영 관리 | 일로" };

const NOTICES: Record<string, string> = {
  expired: "운영자 로그인이 끝났어요. 다시 로그인해 주세요.",
  logout: "로그아웃했어요.",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const { reason } = await searchParams;
  const key = typeof reason === "string" ? reason : undefined;
  return (
    <AdminLogin
      notice={key && Object.hasOwn(NOTICES, key) ? NOTICES[key] : undefined}
      preview={process.env.ADMIN_PREVIEW_ENABLED === "true"}
    />
  );
}
