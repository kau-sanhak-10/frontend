import type { Metadata } from "next";
import { OwnerRegister } from "./owner-register";

export const metadata: Metadata = { title: "업체 등록 | 운영 관리 | 일로" };

export default function AdminOwnerNewPage() {
  return <OwnerRegister />;
}
