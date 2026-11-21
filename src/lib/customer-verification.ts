import { ApiError, requestApi } from "./api.ts";

export type InquiryAccess = { inquiryId: number; inquiryToken: string };
export type RecoveryPurpose = "INQUIRY_ACCESS" | "RESERVATION_LOOKUP";
type Target =
  | (InquiryAccess & { purpose: "CUSTOMER_VERIFY" })
  | { purpose: RecoveryPurpose; linkToken: string };

export const validId = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
export const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export const validTimestamp = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
export const activeExpiry = (v: unknown): v is string =>
  validTimestamp(v) && Date.parse(v) > Date.now();
const authPath = "/api/v1/auth/verifications";

export async function sendCustomerVerification(
  target: Target,
  phone: string,
  signal: AbortSignal,
) {
  const normalized = phone.replace(/[ -]/g, "");
  if (!/^01[016789]\d{7,8}$/.test(normalized))
    throw new Error("휴대전화번호 형식을 확인해 주세요.");
  const headers = new Headers({ "Content-Type": "application/json" });
  if (target.purpose === "CUSTOMER_VERIFY") {
    if (
      !validId(target.inquiryId) ||
      !/^inq_[A-Za-z0-9_-]+$/.test(target.inquiryToken)
    )
      throw new Error("문의 접근 권한을 확인해 주세요.");
    headers.set("Authorization", `Bearer ${target.inquiryToken}`);
  } else if (!/^[A-Za-z0-9_-]{43}$/.test(target.linkToken)) {
    throw new Error("업체 접수 링크를 확인해 주세요.");
  }
  const response = asRecord(
    await requestApi(authPath, {
      method: "POST",
      headers,
      body: JSON.stringify({
        purpose: target.purpose,
        phone: normalized,
        ...("linkToken" in target ? { linkToken: target.linkToken } : {}),
      }),
      signal,
    }),
  );
  const { verificationId, expiresAt, resendAvailableAt } = response;
  if (
    !validId(verificationId) ||
    !validTimestamp(expiresAt) ||
    !validTimestamp(resendAvailableAt)
  )
    throw new Error("인증 요청 결과를 확인하지 못했어요.");
  return { verificationId, expiresAt, resendAvailableAt };
}

export async function confirmCustomerVerification(
  target: Target,
  verificationId: number,
  code: string,
  signal: AbortSignal,
) {
  if (!validId(verificationId) || !/^\d{6}$/.test(code))
    throw new Error("6자리 인증번호를 입력해 주세요.");
  const response = asRecord(
    await requestApi(`${authPath}/${verificationId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal,
    }),
  );
  if (response.purpose === target.purpose) {
    if (target.purpose === "CUSTOMER_VERIFY") {
      if (
        response.inquiryId === target.inquiryId &&
        validTimestamp(response.verifiedAt)
      )
        return { purpose: target.purpose };
    } else if (
      typeof response.accessToken === "string" &&
      /^cus_[A-Za-z0-9_-]+$/.test(response.accessToken) &&
      activeExpiry(response.expiresAt)
    ) {
      return {
        purpose: target.purpose,
        accessToken: response.accessToken,
        expiresAt: response.expiresAt,
      };
    }
  }
  throw new Error("인증 결과를 확인하지 못했어요.");
}

export function verificationIssue(error: unknown) {
  if (!(error instanceof ApiError))
    return { message: "연결을 확인하고 다시 시도해 주세요." };
  const result = asRecord(error.result);
  switch (error.code) {
    case "INVALID_INPUT":
      return {
        message:
          "입력한 번호를 확인해 주세요. 예약 인증은 저장된 방문 연락처로 진행해요.",
      };
    case "VERIFICATION_CODE_MISMATCH":
      return {
        message: `인증번호가 맞지 않아요.${validId(result.attemptsLeft) ? ` 남은 입력 ${result.attemptsLeft}회` : ""}`,
      };
    case "VERIFICATION_NOT_FOUND":
    case "VERIFICATION_EXPIRED":
    case "VERIFICATION_ALREADY_USED":
      return {
        message: "이 인증번호를 사용할 수 없어요. 새 번호를 받아 주세요.",
        clear: true,
      };
    case "VERIFICATION_ATTEMPTS_EXCEEDED":
      return {
        message: "입력 가능 횟수를 넘었어요. 새 인증번호를 받아 주세요.",
        clear: true,
      };
    case "VERIFICATION_RESEND_TOO_SOON":
    case "VERIFICATION_SEND_LIMITED":
      return {
        message:
          error.code === "VERIFICATION_SEND_LIMITED"
            ? "문자 요청이 너무 많아요. 잠시 후 다시 시도해 주세요."
            : "잠시 후 인증번호를 다시 받을 수 있어요.",
        wait: validId(result.retryAfterSeconds)
          ? result.retryAfterSeconds * 1000
          : 0,
      };
    case "VERIFICATION_SEND_FAILED":
      return { message: "문자를 보내지 못했어요. 잠시 후 다시 시도해 주세요." };
    case "VERIFICATION_PURPOSE_MISMATCH":
      return {
        message:
          "인증 대상이 바뀌었어요. 방문정보나 조회 목적을 다시 확인해 주세요.",
        clear: true,
      };
    default:
      return {
        message:
          "인증을 진행하지 못했어요. 입력 정보와 접근 권한을 확인해 주세요.",
      };
  }
}
