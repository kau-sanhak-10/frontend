import type { Metadata } from "next";
import { InquiryEditView } from "./inquiry-edit";

export const metadata: Metadata = { title: "접수 정보 수정 | 일로" };

export default async function OwnerInquiryEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InquiryEditView inquiryId={id} />;
}
