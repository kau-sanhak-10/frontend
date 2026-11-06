import type { Metadata } from "next";
import { IntakeLinkScreen } from "./intake-link";

export const metadata: Metadata = { title: "우리 업체 문의 링크 | 일로" };

export default function OwnerLinkPage() {
  return <IntakeLinkScreen />;
}
