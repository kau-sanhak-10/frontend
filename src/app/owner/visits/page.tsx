import type { Metadata } from "next";
import { OwnerVisits } from "./owner-visits";

export const metadata: Metadata = { title: "방문 일정 | 일로" };

export default function OwnerVisitsPage() {
  return <OwnerVisits />;
}
