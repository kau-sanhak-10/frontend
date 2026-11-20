import { ApiError, requestApi } from "./api.ts";
import { validatePhoto } from "./customer-consultation.ts";
import type {
  CustomerMessage,
  IntakeField,
  SendCustomerInput,
} from "./customer-consultation.ts";
import {
  emptyVisitInfo,
  validateVisitInfo,
  VisitInputError,
  type IntakeBusiness,
  type VisitInfo,
} from "./customer-intake.ts";

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

async function readInquiry(
  path: string,
  inquiryId: number,
  options: RequestInit,
) {
  const value = await requestApi<{
    inquiryId: number;
    version: number;
    visitInfo?: unknown;
  }>(path, options);
  if (
    value?.inquiryId !== inquiryId ||
    !Number.isSafeInteger(value.version) ||
    value.version < 0
  )
    throw new Error("Invalid inquiry version");
  return value;
}

export async function getCustomerInquiryVersion(
  inquiryId: number,
  token: string,
  signal?: AbortSignal,
) {
  const { path, headers } = inquiryAccess(inquiryId, token);
  return (await readInquiry(path, inquiryId, { headers, signal })).version;
}

export async function getCustomerVisitInfo(
  inquiryId: number,
  token: string,
  signal?: AbortSignal,
) {
  const { path, headers } = inquiryAccess(inquiryId, token);
  const data = await readInquiry(path, inquiryId, { headers, signal });
  const raw = data.visitInfo;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid visit information response");
  const value = raw as Record<string, unknown>;
  if (
    ![
      "name",
      "phone",
      "address",
      "addressDetail",
      "accessNote",
      "workCategory",
    ].every((key) => value[key] === null || typeof value[key] === "string")
  )
    throw new Error("Invalid visit information response");
  const coordinates =
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    Math.abs(value.lat) <= 90 &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lng) &&
    Math.abs(value.lng) <= 180
      ? { lat: value.lat, lng: value.lng }
      : null;
  return {
    version: data.version,
    coordinates,
    visit: {
      ...emptyVisitInfo,
      name: (value.name as string | null) ?? "",
      phone: (value.phone as string | null) ?? "",
      address: (value.address as string | null) ?? "",
      addressDetail: (value.addressDetail as string | null) ?? "",
      accessNote: (value.accessNote as string | null) ?? "",
      workTypeId: (value.workCategory as string | null) ?? "",
    },
  };
}

export function visitSaveError(error: unknown): VisitInputError {
  if (error instanceof ApiError) {
    if (error.code === "INVALID_INPUT" && Array.isArray(error.result)) {
      const fields: Partial<Record<keyof VisitInfo, string>> = {};
      for (const row of error.result) {
        if (
          !row ||
          typeof row.field !== "string" ||
          typeof row.reason !== "string"
        )
          continue;
        const key = row.field === "workCategory" ? "workTypeId" : row.field;
        if (Object.hasOwn(emptyVisitInfo, key))
          fields[key as keyof VisitInfo] = row.reason;
      }
      return new VisitInputError(
        "표시된 항목을 확인해 주세요. 다른 입력은 그대로 있어요.",
        fields,
      );
    }
    if (error.code === "INQUIRY_VERSION_CONFLICT")
      return new VisitInputError(
        "접수 내용이 바뀌었어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.",
      );
    if (error.code === "VISIT_INFO_OWNER_CONFIRMED")
      return new VisitInputError(
        "사장님이 확인한 방문정보예요. 변경할 내용은 상담으로 알려주세요.",
      );
    if (error.code === "RESERVATION_CHANGE_REQUIRED")
      return new VisitInputError(
        "예약에 영향을 주는 변경은 예약 변경 절차가 필요해요. 기존 예약은 그대로예요.",
      );
    if (
      error.code === "ADDRESS_NOT_FOUND" ||
      error.code === "OUT_OF_SERVICE_AREA"
    )
      return new VisitInputError("방문 주소를 확인해 주세요.", {
        address:
          error.code === "ADDRESS_NOT_FOUND"
            ? "주소를 확인하지 못했어요."
            : "업체의 방문 가능 지역이 아니에요.",
      });
    if ([401, 403, 404].includes(error.status))
      return new VisitInputError(
        "이 상담에 더 이상 저장할 수 없어요. 입력한 내용은 남겨 뒀어요.",
      );
  }
  return error instanceof VisitInputError
    ? error
    : new VisitInputError(
        "저장 결과를 확인하지 못했어요. 입력한 내용은 남겨 뒀어요.",
      );
}

export const customerFieldSpecs = {
  symptom: { label: "증상", maxLength: 255 },
  manufacturer: { label: "제조사", maxLength: 50 },
  model: { label: "본체 모델명", maxLength: 100 },
  controller_model: { label: "조절기 모델명", maxLength: 100 },
  boiler_type: { label: "보일러 종류", maxLength: 50 },
  error_code: { label: "오류코드", maxLength: 20 },
};

export type CustomerFieldKey = keyof typeof customerFieldSpecs;

export function isCustomerFieldEditable(
  key: string,
  fields: readonly Pick<IntakeField, "key">[],
) {
  return (
    key !== "controller_model" || fields.some((field) => field.key === key)
  );
}

async function requestCustomerFields(
  inquiryId: number,
  token: string,
  signal: AbortSignal,
  change?: { version: number; fieldKey: CustomerFieldKey; value: string },
): Promise<{ version: number; fields: IntakeField[] }> {
  const { path, headers } = inquiryAccess(inquiryId, token);
  const data = await requestApi<{ version: number; fields: unknown }>(
    `${path}/fields`,
    {
      ...(change
        ? {
            method: "PATCH",
            body: JSON.stringify({
              version: change.version,
              fields: [{ fieldKey: change.fieldKey, value: change.value }],
            }),
          }
        : {}),
      headers: change
        ? { ...headers, "Content-Type": "application/json" }
        : headers,
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    },
  );
  if (
    !Number.isSafeInteger(data?.version) ||
    data.version < 0 ||
    !Array.isArray(data.fields)
  )
    throw new Error("Invalid intake fields");
  const rows = data.fields;
  const fields = Object.entries(customerFieldSpecs).flatMap<IntakeField>(
    ([key, { label }]) => {
      const field = rows.find((row) => row?.fieldKey === key);
      if (!field) return [];
      if (field.status !== "CONFIRMED" && field.status !== "UNCONFIRMED")
        throw new Error("Invalid intake field status");
      const source: unknown = field.source;
      const knownSource =
        source === "PHOTO" || source === "CUSTOMER" || source === "OWNER";
      const conflict =
        field.status === "UNCONFIRMED" &&
        field.unconfirmedReason === "CONFLICT";
      const value =
        field.status === "CONFIRMED" &&
        knownSource &&
        typeof field.value === "string" &&
        field.value.trim()
          ? field.value
          : null;
      return [
        {
          key,
          label,
          value,
          source: value && knownSource ? source : undefined,
          status: conflict ? "CONFLICT" : value ? "CONFIRMED" : "UNCONFIRMED",
          reason: conflict
            ? "서로 다른 내용이 있어 다시 확인이 필요해요."
            : field.unconfirmedReason === "PHOTO_UNREADABLE"
              ? "사진에서 읽지 못했어요."
              : undefined,
        },
      ];
    },
  );
  if (
    change &&
    (data.version < change.version ||
      !fields.some((field) => field.key === change.fieldKey))
  )
    throw new Error("Invalid saved intake fields");
  return { version: data.version, fields };
}

export function getCustomerFields(
  inquiryId: number,
  token: string,
  signal: AbortSignal,
) {
  return requestCustomerFields(inquiryId, token, signal);
}

export function saveCustomerField(
  inquiryId: number,
  token: string,
  version: number,
  fieldKey: CustomerFieldKey,
  input: string,
  signal: AbortSignal,
) {
  const value = input.trim();
  if (
    !Object.hasOwn(customerFieldSpecs, fieldKey) ||
    !value ||
    value.length > customerFieldSpecs[fieldKey].maxLength ||
    !Number.isSafeInteger(version) ||
    version < 0
  )
    throw new Error("Invalid intake field update");
  return requestCustomerFields(inquiryId, token, signal, {
    version,
    fieldKey,
    value,
  });
}

export async function getCustomerVisitSnapshot(
  inquiryId: number,
  token: string,
  signal?: AbortSignal,
) {
  const { path, headers } = inquiryAccess(inquiryId, token);
  const { version, visitInfo } = await readInquiry(path, inquiryId, {
    headers,
    signal,
  });
  const visit = visitInfo as Record<string, unknown> | undefined;
  if (
    !visit ||
    ![visit.phone, visit.address, visit.addressDetail, visit.accessNote].every(
      (value) => value === null || typeof value === "string",
    ) ||
    ![visit.lat, visit.lng].every(
      (value) => value === null || Number.isFinite(value),
    )
  ) {
    throw new Error("Invalid saved visit information");
  }
  return {
    version,
    visit: {
      phone: visit.phone,
      address: visit.address,
      addressDetail: visit.addressDetail,
      accessNote: visit.accessNote,
      lat: visit.lat,
      lng: visit.lng,
    },
  };
}

export async function isWaitingForOwner(
  inquiryId: number,
  token: string,
  signal: AbortSignal,
) {
  const { path, headers } = inquiryAccess(inquiryId, token);
  const result = await requestApi<{ inquiryId: number; status: string }>(path, {
    headers,
    signal,
  });
  if (
    result?.inquiryId !== inquiryId ||
    ![
      "COLLECTING",
      "SCHEDULING",
      "OWNER_CHECK",
      "BOOKED",
      "UNSERVICEABLE",
      "CLOSED",
    ].includes(result.status)
  )
    throw new Error("Invalid inquiry status");
  return result.status === "OWNER_CHECK";
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
  const errors = validateVisitInfo(
    visit,
    Object.entries(categoryNames).map(([id, name]) => ({ id, name })),
  );
  if (Object.keys(errors).length)
    throw new VisitInputError("입력한 방문정보를 확인해 주세요.", errors);
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
  const saved = await readInquiry(`${path}/visit-info`, inquiryId, {
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
  return saved.version;
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

  async function upload(file: File) {
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

    // Reuse this file's ticket when retrying the same draft.
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
    }).catch((error: unknown) => {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === "PHOTO_NOT_UPLOADED"
      ) {
        ticket.transferred = false;
      }
      throw error;
    });
    if (complete?.photoId !== ticket.photoId)
      throw new Error("Invalid photo upload result");
    if (complete.uploadStatus === "FAILED") tickets.delete(file);
    if (complete.uploadStatus !== "DONE")
      throw new Error("Photo upload not confirmed");
    return { photoId: ticket.photoId };
  }

  async function cancel(file: File) {
    const ticket = tickets.get(file);
    if (!ticket) return;
    const result = await requestApi<{ photoId: number; uploadStatus: string }>(
      `${path}/photos/${ticket.photoId}`,
      { method: "DELETE", headers, signal: AbortSignal.timeout(10_000) },
    );
    if (result?.photoId !== ticket.photoId || result.uploadStatus !== "FAILED")
      throw new Error("Photo cancellation not confirmed");
    tickets.delete(file);
  }

  return { upload, cancel };
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

export async function requestCustomerHandoff(inquiryId: number, token: string) {
  const { path, headers } = inquiryAccess(inquiryId, token);
  const result = await requestApi<{ handoffId: number; status: string }>(
    `${path}/handoff-requests`,
    { method: "POST", headers, signal: AbortSignal.timeout(10_000) },
  );
  if (
    !Number.isSafeInteger(result?.handoffId) ||
    result.handoffId <= 0 ||
    !["WAITING", "IN_PROGRESS"].includes(result.status)
  )
    throw new Error("Invalid handoff response");
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
