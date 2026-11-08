import { requestApi } from "./api.ts";
import type { SendCustomerInput } from "./customer-consultation.ts";

// API 명세 v0.3에서 요청·응답 예시가 확정된 두 경로만 준비한다. 프리뷰에서는 호출하지 않는다.
export async function createCustomerInquiry(
  linkToken: string,
  consents: {
    type: "PRIVACY_REQUIRED" | "PHOTO";
    termsVersion: string;
  }[],
  signal?: AbortSignal,
) {
  if (!linkToken.trim() || /[\r\n]/.test(linkToken))
    throw new Error("Invalid intake link");
  if (
    !consents.some((c) => c.type === "PRIVACY_REQUIRED") ||
    consents.some((c) => !c.termsVersion.trim())
  )
    throw new Error("Consent required");
  const value = await requestApi<unknown>(
    `/api/v1/public/intake/${encodeURIComponent(linkToken)}/inquiries`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consents }),
    },
  );
  if (
    !value ||
    typeof value !== "object" ||
    !("inquiryId" in value) ||
    !Number.isSafeInteger(value.inquiryId) ||
    (value.inquiryId as number) <= 0 ||
    !("inquiryToken" in value) ||
    typeof value.inquiryToken !== "string" ||
    !value.inquiryToken.trim() ||
    !("expiresAt" in value) ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt))
  )
    throw new Error("Invalid inquiry response");
  return value as {
    inquiryId: number;
    inquiryToken: string;
    expiresAt: string;
  };
}

export async function sendCustomerMessage(
  inquiryId: number,
  token: string,
  input: SendCustomerInput,
  signal?: AbortSignal,
) {
  if (
    !Number.isSafeInteger(inquiryId) ||
    inquiryId <= 0 ||
    !token.trim() ||
    /[\r\n]/.test(token)
  )
    throw new Error("Invalid inquiry access");
  const content = input.content.trim();
  if (
    !input.clientMsgId ||
    (!content && !input.photoIds.length) ||
    input.photoIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    throw new Error("Invalid message");
  const value = await requestApi<unknown>(
    `/api/v1/customer/inquiries/${inquiryId}/messages`,
    {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...input, content: content || null }),
    },
  );
  if (
    !value ||
    typeof value !== "object" ||
    !("messageId" in value) ||
    !Number.isSafeInteger(value.messageId) ||
    (value.messageId as number) <= 0 ||
    !("deliveryStatus" in value) ||
    value.deliveryStatus !== "SENT" ||
    !("aiStatus" in value) ||
    !["PROCESSING", "NONE"].includes(value.aiStatus as string)
  )
    throw new Error("Invalid message response");
  return value as {
    messageId: number;
    deliveryStatus: "SENT";
    aiStatus: "PROCESSING" | "NONE";
  };
}
