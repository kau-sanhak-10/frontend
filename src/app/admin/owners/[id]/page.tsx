import type { Metadata } from "next";
import { OwnerDetail } from "./owner-detail";

export const metadata: Metadata = { title: "업체 상세 | 운영 관리 | 일로" };

export default async function AdminOwnerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ registered?: string | string[] }>;
}) {
  const { id } = await params;
  const { registered } = await searchParams;
  return <OwnerDetail ownerId={id} registered={registered === "1"} />;
}
