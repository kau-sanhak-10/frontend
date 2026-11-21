import type { Metadata } from "next";
import { NotificationSettings } from "./notification-settings";

export const metadata: Metadata = { title: "알림 설정 | 일로" };

export default function OwnerNotificationSettingsPage() {
  return <NotificationSettings />;
}
