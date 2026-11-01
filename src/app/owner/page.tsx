import type { Metadata } from "next";
import { OwnerHome } from "./owner-home";

export const metadata: Metadata = { title: "오늘 | 일로" };

export default function OwnerHomePage() {
  return <OwnerHome />;
}
