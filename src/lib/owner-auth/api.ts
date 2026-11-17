import { requestApi } from "../api.ts";
import { ownerHeaders } from "../owner-settings-api.ts";

type Verification = {
  verificationId: number;
  expiresAt: string;
  resendAvailableAt: string;
};
export type OwnerMe = {
  ownerId: number;
  businessName: string;
  ownerName: string | null;
  phone: string;
  approvalStatus: "APPROVED";
  status: "ACTIVE";
  autoBookingEnabled: boolean;
  intakePaused: boolean;
};
type OwnerLogin = {
  purpose: "OWNER_LOGIN";
  accessToken: string;
  expiresAt: string;
  owner: {
    ownerId: number;
    businessName: string;
    approvalStatus: "APPROVED";
    status: "ACTIVE";
  };
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object";
const date = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const id = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;

// 실제 인증 API. 화면 확인용 인증과 별개로 호출한다.
export async function requestOwnerVerification(
  phone: string,
  signal?: AbortSignal,
): Promise<Verification> {
  if (
    !/^01[016789][0-9\s-]{7,11}$/.test(phone) ||
    !/^01[016789]\d{7,8}$/.test(phone.replace(/[\s-]/g, ""))
  )
    throw new Error("휴대전화번호 형식을 확인해 주세요.");
  const v = await requestApi<unknown>("/api/v1/auth/verifications", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "OWNER_LOGIN", phone }),
  });
  if (
    !record(v) ||
    !id(v.verificationId) ||
    !date(v.expiresAt) ||
    !date(v.resendAvailableAt)
  )
    throw new Error("인증 요청 결과를 확인하지 못했어요.");
  return v as Verification;
}
export async function confirmOwnerVerification(
  verificationId: number,
  code: string,
  signal?: AbortSignal,
): Promise<OwnerLogin> {
  if (!id(verificationId) || !/^\d{6}$/.test(code))
    throw new Error("인증번호를 확인해 주세요.");
  const v = await requestApi<unknown>(
    `/api/v1/auth/verifications/${verificationId}/confirm`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    },
  );
  if (
    !record(v) ||
    v.purpose !== "OWNER_LOGIN" ||
    typeof v.accessToken !== "string" ||
    !/^own_[A-Za-z0-9_-]+$/.test(v.accessToken) ||
    !date(v.expiresAt) ||
    !record(v.owner) ||
    !id(v.owner.ownerId) ||
    typeof v.owner.businessName !== "string" ||
    v.owner.approvalStatus !== "APPROVED" ||
    v.owner.status !== "ACTIVE"
  )
    throw new Error("사장님 로그인 결과를 확인하지 못했어요.");
  return v as OwnerLogin;
}
function isOwnerMe(v: unknown): v is OwnerMe {
  return (
    record(v) &&
    id(v.ownerId) &&
    typeof v.businessName === "string" &&
    (v.ownerName === null || typeof v.ownerName === "string") &&
    typeof v.phone === "string" &&
    v.approvalStatus === "APPROVED" &&
    v.status === "ACTIVE" &&
    typeof v.autoBookingEnabled === "boolean" &&
    typeof v.intakePaused === "boolean"
  );
}
export async function getOwnerMe(
  token: string,
  signal?: AbortSignal,
): Promise<OwnerMe> {
  const v = await requestApi<unknown>("/api/v1/owner/me", {
    headers: ownerHeaders(token),
    signal,
  });
  if (!isOwnerMe(v)) throw new Error("계정·업체 권한을 확인하지 못했어요.");
  return v;
}
export async function saveOwnerName(
  token: string,
  ownerName: string,
  signal?: AbortSignal,
): Promise<OwnerMe> {
  if (!ownerName.trim() || ownerName.trim().length > 50)
    throw new Error("이름은 1~50자로 입력해 주세요.");
  const v = await requestApi<unknown>("/api/v1/owner/me", {
    method: "PATCH",
    signal,
    headers: ownerHeaders(token),
    body: JSON.stringify({ ownerName: ownerName.trim() }),
  });
  if (!isOwnerMe(v)) throw new Error("저장 결과를 확인하지 못했어요.");
  return v;
}
export async function logoutOwner(
  token: string,
  signal?: AbortSignal,
): Promise<void> {
  await requestApi("/api/v1/auth/logout", {
    method: "POST",
    headers: ownerHeaders(token),
    signal,
  });
}
