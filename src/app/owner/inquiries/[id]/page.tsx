import type { Metadata } from "next";
import { InquiryDetailView } from "./inquiry-detail";

export const metadata: Metadata = { title: "접수 상세 | 일로" };

export default async function OwnerInquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InquiryDetailView inquiryId={id} />;
}
