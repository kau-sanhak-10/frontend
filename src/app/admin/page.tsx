import type { Metadata } from "next";
import { AdminOwners } from "./admin-owners";

export const metadata: Metadata = { title: "업체 관리 | 운영 관리 | 일로" };

export default function AdminHomePage() {
  return <AdminOwners />;
}
