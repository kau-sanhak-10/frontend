import type { Metadata } from "next";
import OwnerSettings from "./owner-settings";

export const metadata: Metadata = { title: "업체 설정 | 일로" };

export default function Page() {
  return <OwnerSettings />;
}
