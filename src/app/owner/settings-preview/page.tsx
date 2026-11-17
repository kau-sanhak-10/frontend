import { notFound } from "next/navigation";
import SettingsPreview from "./settings-preview";

export const dynamic = "force-dynamic";
export default function Page() {
  if (process.env.OWNER_SETTINGS_PREVIEW_ENABLED !== "true") notFound();
  return <SettingsPreview />;
}
