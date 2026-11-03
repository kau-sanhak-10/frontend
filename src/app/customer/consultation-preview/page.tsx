import { notFound } from "next/navigation";
import ConsultationPreviewFlow from "../preview-flow";

export const dynamic = "force-dynamic";

export default async function ConsultationPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.CUSTOMER_PREVIEW_ENABLED !== "true") notFound();
  const query = await searchParams;
  const scene =
    ["start", "chat", "retake", "summary"].find(
      (value) => value === query.scene,
    ) ?? "start";
  const failure = ["send", "upload", "handoff", "expired"].find(
    (value) => value === query.fail,
  );
  return <ConsultationPreviewFlow scene={scene} failure={failure} />;
}
