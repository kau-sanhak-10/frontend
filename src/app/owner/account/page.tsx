import type { Metadata } from "next";
import { OwnerAccount } from "./owner-account";

export const metadata: Metadata = { title: "내 계정 | 일로" };

export default function OwnerAccountPage() {
  return <OwnerAccount />;
}
