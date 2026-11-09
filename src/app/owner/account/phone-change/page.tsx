import type { Metadata } from "next";
import { PhoneChangeRequestForm } from "./phone-change-request";

export const metadata: Metadata = { title: "로그인 번호 변경 요청 | 일로" };

export default function PhoneChangePage() {
  return <PhoneChangeRequestForm />;
}
