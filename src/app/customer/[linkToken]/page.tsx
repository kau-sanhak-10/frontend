import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CustomerLiveIntake from "./live-intake";

export const metadata: Metadata = {
  title: "업체 문의 | 일로",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({
  params,
}: {
  params: Promise<{ linkToken: string }>;
}) {
  if (process.env.CUSTOMER_LIVE_ENABLED !== "true") notFound();
  const { linkToken } = await params;
  return <CustomerLiveIntake key={linkToken} linkToken={linkToken} />;
}
