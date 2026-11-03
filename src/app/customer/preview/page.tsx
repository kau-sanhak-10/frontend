import { notFound } from "next/navigation";
import CustomerIntake from "../intake";
import type { IntakeStatus } from "@/lib/customer-intake";

export const dynamic = "force-dynamic";

export default async function CustomerPreview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 예시 업체를 실제 접수로 오인하지 않도록 명시적으로 허용한 환경에만 공개한다.
  if (process.env.CUSTOMER_PREVIEW_ENABLED !== "true") notFound();
  const query = await searchParams;
  const states: IntakeStatus[] = [
    "ready",
    "invalid",
    "paused",
    "loading",
    "unavailable",
    "error",
  ];
  const status = states.find((value) => value === query.state) || "ready";
  const failure = ["start", "visit", "address", "region"].find(
    (value) => value === query.fail,
  ) as "start" | "visit" | "address" | "region" | undefined;
  return (
    <CustomerIntake
      key={`${status}-${failure}`}
      preview
      status={status}
      previewFailure={failure}
      business={{
        name: "한빛 보일러 · 화면 예시",
        phone: "02-000-0000",
        guidance:
          "설치·수리 문의를 남겨주세요. 업체 정보는 화면 확인용 예시예요.",
        termsVersion: "2026-10-v1",
        workTypes: [
          { id: "sample-inspection", name: "점검 (예시)" },
          { id: "sample-repair", name: "수리 (예시)" },
        ],
      }}
    />
  );
}
