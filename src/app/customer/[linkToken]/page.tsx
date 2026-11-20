import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isVisitDemoLink } from "@/lib/customer-visit-demo";
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
  const visitDemo = isVisitDemoLink(
    linkToken,
    process.env.CUSTOMER_VISIT_DEMO_LINK_TOKEN,
    process.env.NEXT_PUBLIC_API_BASE_URL,
  );
  return (
    <CustomerLiveIntake
      key={linkToken}
      linkToken={linkToken}
      visitDemo={visitDemo}
      photoDemo={
        process.env.CUSTOMER_PHOTO_ENABLED === "true" ||
        (visitDemo && process.env.CUSTOMER_PHOTO_DEMO_ENABLED === "true")
      }
      photoCancel={process.env.CUSTOMER_PHOTO_CANCEL_ENABLED === "true"}
    />
  );
}
