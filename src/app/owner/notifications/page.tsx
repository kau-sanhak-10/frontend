import type { Metadata } from "next";
import { OwnerNotifications } from "./owner-notifications";

export const metadata: Metadata = { title: "알림 | 일로" };

export default function OwnerNotificationsPage() {
  return <OwnerNotifications />;
}
