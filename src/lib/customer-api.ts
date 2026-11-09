import { requestApi } from "./api.ts";
import { validatePhoto } from "./customer-consultation.ts";
import type {
  CustomerMessage,
  SendCustomerInput,
} from "./customer-consultation.ts";
import type { IntakeBusiness, VisitInfo } from "./customer-intake.ts";

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

export function isIntakeLinkToken(token: string, visitDemo = false) {
  return (
    /^[A-Za-z0-9_-]{43}$/.test(token) ||
    (visitDemo && /^dev-test-[A-Za-z0-9_-]{1,34}$/.test(token))
  );
}

function inquiryAccess(inquiryId: number, token: string) {
  if (
    !Number.isSafeInteger(inquiryId) ||
    inquiryId <= 0 ||
    !token.trim() ||
    /[\r\n]/.test(token)
  )
    throw new Error("Invalid inquiry access");
  return {
    path: `/api/v1/customer/inquiries/${inquiryId}`,
    headers: { Authorization: `Bearer ${token}` },
  };
}

async function readInquiryVersion(
  path: string,
  inquiryId: number,
  options: RequestInit,
) {
  const value = await requestApi<{ inquiryId: number; version: number }>(
    path,
    options,
  );
  if (
    value?.inquiryId !== inquiryId ||
    !Number.isSafeInteger(value.version) ||
    value.version < 0
  )
    throw new Error("Invalid inquiry version");
  return value.version;
}

export async function getCustomerInquiryVersion(
  inquiryId: number,
  token: string,
  signal?: AbortSignal,
) {
  const { path, headers } = inquiryAccess(inquiryId, token);
  return readInquiryVersion(path, inquiryId, { headers, signal });
}

export async function saveCustomerVisitInfo(
  inquiryId: number,
  token: string,
  version: number,
  visit: VisitInfo,
  coordinates: { lat: number; lng: number },
  signal?: AbortSignal,
) {
  const { path, headers } = inquiryAccess(inquiryId, token);
  const { lat, lng } = coordinates;
  // 좌표는 확인된 기본주소와 함께 전달한다. 좌표가 없다고 임의 위치를 보내지 않는다.
  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    !Number.isFinite(lat) ||
    Math.abs(lat) > 90 ||
    !Number.isFinite(lng) ||
    Math.abs(lng) > 180 ||
    (visit.workTypeId && !Object.hasOwn(categoryNames, visit.workTypeId))
  )
    throw new Error("Invalid visit information");
  return readInquiryVersion(`${path}/visit-info`, inquiryId, {
    method: "PUT",
    signal,
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      version,
      name: visit.name.trim(),
      phone: visit.phone.replace(/[\s-]/g, ""),
      address: visit.address.trim(),
      addressDetail: visit.addressDetail.trim() || null,
      lat,
      lng,
      accessNote: visit.accessNote.trim() || null,
      workCategory: visit.workTypeId || null,
    }),
  });
}

export async function getCustomerIntake(
  linkToken: string,
  signal?: AbortSignal,
  visitDemo = false,
) {
  if (!isIntakeLinkToken(linkToken, visitDemo))
    throw new Error("Invalid intake link");
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

export function createCustomerPhotoUploader(inquiryId: number, token: string) {
  const { path, headers } = inquiryAccess(inquiryId, token);
  type Ticket = {
    photoId: number;
    url: URL;
    headers: Headers;
    expires: number;
    transferred: boolean;
  };
  const tickets = new WeakMap<File, Ticket>();

  return async (file: File) => {
    const issue = validatePhoto(file, 0);
    if (issue) throw new Error(issue);
    let ticket = tickets.get(file);
    if (!ticket || (!ticket.transferred && ticket.expires <= Date.now())) {
      const value = await requestApi<{
        photoId: number;
        uploadUrl: string;
        method: string;
        headers: Record<string, string>;
        expiresAt: string;
      }>(`${path}/photos`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
        signal: AbortSignal.timeout(30_000),
      });
      const url = URL.parse(value?.uploadUrl ?? "");
      const expires = Date.parse(value?.expiresAt);
      const uploadHeaders = new Headers(value?.headers);
      if (
        !value ||
        !Number.isSafeInteger(value.photoId) ||
        value.photoId <= 0 ||
        value.method !== "PUT" ||
        !url ||
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.hash ||
        !/^(?:[a-z0-9.-]+\.)?s3(?:[.-][a-z0-9-]+)*\.amazonaws\.com$/.test(
          url.hostname,
        ) ||
        !(expires > Date.now()) ||
        [...uploadHeaders.keys()].some((key) => key !== "content-type") ||
        (uploadHeaders.has("content-type") &&
          uploadHeaders.get("content-type") !== file.type)
      )
        throw new Error("Invalid photo upload ticket");
      uploadHeaders.set("Content-Type", file.type);
      ticket = {
        photoId: value.photoId,
        url,
        headers: uploadHeaders,
        expires,
        transferred: false,
      };
      tickets.set(file, ticket);
    }

    // ponytail: reuse this file's ticket for retries; server cancellation and cleanup are handled by BE-06.
    if (!ticket.transferred) {
      const response = await fetch(ticket.url, {
        method: "PUT",
        headers: ticket.headers,
        body: file,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error("Photo storage upload failed");
      ticket.transferred = true;
    }
    const complete = await requestApi<{
      photoId: number;
      uploadStatus: string;
    }>(`${path}/photos/${ticket.photoId}/complete`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (complete?.photoId !== ticket.photoId)
      throw new Error("Invalid photo upload result");
    if (complete.uploadStatus === "FAILED") tickets.delete(file);
    if (complete.uploadStatus !== "DONE")
      throw new Error("Photo upload not confirmed");
    return { photoId: ticket.photoId };
  };
}

export async function getCustomerMessages(
  inquiryId: number,
  token: string,
  afterId: number,
  signal: AbortSignal,
) {
  const { path, headers } = inquiryAccess(inquiryId, token);
  const suffix = afterId ? `?afterId=${afterId}` : "";
  const value = await requestApi<{
    messages: {
      messageId: number;
      sender: CustomerMessage["role"];
      content: string | null;
      photoIds?: number[];
      deliveryStatus: string;
    }[];
    hasMore: boolean;
  }>(`${path}/messages${suffix}`, { signal, headers });
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
    const photoIds = Array.isArray(row.photoIds)
      ? row.photoIds.filter((id) => Number.isSafeInteger(id) && id > 0)
      : [];
    const content = typeof row.content === "string" ? row.content : "";
    if (
      row.deliveryStatus === "SENT" &&
      ["CUSTOMER", "AI", "OWNER"].includes(row.sender) &&
      (content.trim() || photoIds?.length)
    )
      messages.push({
        id: String(row.messageId),
        role: row.sender,
        content,
        ...(photoIds?.length ? { photoIds } : {}),
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
  const { path, headers } = inquiryAccess(inquiryId, token);
  const content = input.content.trim();
  if (
    !input.clientMsgId ||
    (!content && !input.photoIds.length) ||
    input.photoIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    throw new Error("Invalid message");
  const value = await requestApi<unknown>(`${path}/messages`, {
    method: "POST",
    signal,
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, content: content || null }),
  });
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
