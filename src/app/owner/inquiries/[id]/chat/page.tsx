import type { Metadata } from "next";
import { InquiryChatView } from "./inquiry-chat";

export const metadata: Metadata = { title: "고객과 대화 | 일로" };

export default async function OwnerInquiryChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InquiryChatView inquiryId={id} />;
}
