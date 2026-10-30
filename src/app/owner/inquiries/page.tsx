import type { Metadata } from "next";
import { InquiryList } from "./inquiry-list";

export const metadata: Metadata = { title: "접수함 | 일로" };

export default function OwnerInquiriesPage() {
  return <InquiryList />;
}
