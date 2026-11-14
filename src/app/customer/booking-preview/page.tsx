import { notFound } from "next/navigation";
import BookingPreview from "./preview";

export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.CUSTOMER_PREVIEW_ENABLED !== "true") notFound();
  const query = await searchParams;
  const scene =
    [
      "normal",
      "empty",
      "load-error",
      "owner",
      "safety",
      "expired",
      "conflict",
      "network",
      "notification",
      "existing",
      "unverified",
    ].find((v) => v === query.scene) ?? "normal";
  return <BookingPreview scene={scene} />;
}
