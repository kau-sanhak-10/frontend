import type { Metadata } from "next";
import { VisitDetailView } from "./visit-detail";

export const metadata: Metadata = { title: "방문 작업 | 일로" };

export default async function OwnerVisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VisitDetailView visitId={id} />;
}
