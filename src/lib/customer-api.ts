import { requestApi } from "./api.ts";
import type {
  CustomerMessage,
  SendCustomerInput,
} from "./customer-consultation.ts";
import type { IntakeBusiness } from "./customer-intake.ts";

const categoryNames: Record<string, string> = {
  INSPECTION: "점검",
  REPAIR: "수리·부품교체",
  LEAK: "누수",
  REPLACEMENT: "보일러 교체",
};

type IntakeResponse = {
  businessName: string;
  contactPhone: string;
  customerNotice: string | null;
  serviceDescription: string | null;
  workCategories: string[];
  intakeAvailable: boolean;
  termsVersion: string;
};

export function isIntakeLinkToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function getCustomerIntake(
  linkToken: string,
  signal?: AbortSignal,
) {
  if (!isIntakeLinkToken(linkToken)) throw new Error("Invalid intake link");
  const value = await requestApi<IntakeResponse>(
    `/api/v1/public/intake/${encodeURIComponent(linkToken)}`,
    { signal },
  );
  if (
    !value ||
    typeof value.businessName !== "string" ||
    !value.businessName.trim() ||
    typeof value.contactPhone !== "string" ||
    typeof value.intakeAvailable !== "boolean" ||
    typeof value.termsVersion !== "string" ||
    !value.termsVersion.trim() ||
    !Array.isArray(value.workCategories)
  )
    throw new Error("Invalid intake response");

  const business: IntakeBusiness = {
    name: value.businessName,
    phone: value.contactPhone,
    guidance: [value.customerNotice, value.serviceDescription]
      .filter((item) => typeof item === "string" && item.trim())
      .join(" · "),
    termsVersion: value.termsVersion,
    workTypes: value.workCategories
      .filter(
        (id) => typeof id === "string" && Object.hasOwn(categoryNames, id),
      )
      .map((id) => ({ id, name: categoryNames[id] })),
  };
  return { business, available: value.intakeAvailable };
}

export async function getCustomerMessages(
  inquiryId: number,
  token: string,
  afterId: number,
  signal: AbortSignal,
) {
  const suffix = afterId ? `?afterId=${afterId}` : "";
  const value = await requestApi<{
    messages: {
      messageId: number;
      sender: CustomerMessage["role"];
      content: string | null;
      deliveryStatus: string;
    }[];
    hasMore: boolean;
  }>(`/api/v1/customer/inquiries/${inquiryId}/messages${suffix}`, {
    signal,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (
    !value ||
    !Array.isArray(value.messages) ||
    typeof value.hasMore !== "boolean"
  )
    throw new Error("Invalid messages response");
  const messages: CustomerMessage[] = [];
  let cursor = afterId;
  for (const row of value.messages) {
    if (!row || !Number.isSafeInteger(row.messageId) || row.messageId <= cursor)
      throw new Error("Invalid message order");
    // A pending message can later become SENT; don't advance past it.
    if (row.deliveryStatus === "PENDING")
      return { messages, cursor, hasMore: false };
    cursor = row.messageId;
    if (
      row.deliveryStatus === "SENT" &&
      ["CUSTOMER", "AI", "OWNER"].includes(row.sender) &&
      typeof row.content === "string" &&
      row.content.trim()
    )
      messages.push({
        id: String(row.messageId),
        role: row.sender,
        content: row.content,
      });
  }
  return { messages, cursor, hasMore: value.hasMore && cursor > afterId };
}

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
    !/^inq_[A-Za-z0-9_-]+$/.test(value.inquiryToken) ||
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
