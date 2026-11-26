// 운영 화면 실제 서버 API (FE-19 · BE-17)
// - 운영자 로그인: 문자 인증 ADMIN_LOGIN (운영 권한은 서버가 확인, 토큰 12시간)
// - 업체 등록·목록·상세·승인·거절·운영 상태·로그인 번호 변경: /api/v1/admin/owners
// - 접수 링크 발급·재발급: POST /api/v1/admin/owners/{ownerId}/intake-link
import { ApiError, requestApi } from "../api.ts";
import type {
  AdminErrorCode,
  AdminOwner,
  AdminOwnerFilter,
  AdminOwnerItem,
  AdminOwnerPage,
  AdminResult,
  AdminRole,
  IntakeLink,
  RegisterOwnerInput,
  VerificationSent,
} from "./types";

// ── 서버 응답 모양 ─────────────────────────────

export type ServerAdminOwnerItem = {
  ownerId: number;
  businessName: string;
  ownerName: string | null;
  phone: string;
  approvalStatus: AdminOwnerItem["approvalStatus"];
  status: AdminOwnerItem["status"];
  createdAt: string | null;
  reviewedAt: string | null;
};

export type ServerAdminOwner = ServerAdminOwnerItem & {
  contactPhone: string | null;
  address: string | null;
  serviceDescription: string | null;
  rejectionReason: string | null;
  reviewedBy: { adminId: number; name: string } | null;
  autoBookingEnabled: boolean;
  intakePaused: boolean;
  intakeLinkActive: boolean;
  updatedAt: string | null;
};

export type ServerAdminOwnerPage = {
  content: ServerAdminOwnerItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  isLast: boolean;
};

export type AdminLoginResult = {
  token: string;
  expiresAt: number;
  name: string;
  role: AdminRole;
};

// ── 바꾸기 ─────────────────────────────

const toTime = (v: string | null | undefined) => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? null : t;
};
const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function mapOwnerItem(o: ServerAdminOwnerItem): AdminOwnerItem {
  return {
    id: String(o.ownerId),
    businessName: o.businessName,
    ownerName: o.ownerName?.trim() || null,
    phone: digits(o.phone),
    approvalStatus: o.approvalStatus,
    status: o.status,
    createdAt: toTime(o.createdAt) ?? 0,
    reviewedAt: toTime(o.reviewedAt),
  };
}

export function mapOwner(o: ServerAdminOwner): AdminOwner {
  return {
    ...mapOwnerItem(o),
    contactPhone: o.contactPhone?.trim() || null,
    address: o.address?.trim() || null,
    serviceDescription: o.serviceDescription?.trim() || null,
    rejectionReason: o.rejectionReason?.trim() || null,
    reviewer: o.reviewedBy
      ? { id: String(o.reviewedBy.adminId), name: o.reviewedBy.name }
      : null,
    autoBookingEnabled: Boolean(o.autoBookingEnabled),
    intakePaused: Boolean(o.intakePaused),
    intakeLinkActive: Boolean(o.intakeLinkActive),
    updatedAt: toTime(o.updatedAt) ?? 0,
  };
}

/** 목록 조회 주소 (보낸 조건만 붙입니다) */
export function ownersQuery(filter: AdminOwnerFilter, size = 20): string {
  const params = new URLSearchParams();
  if (filter.approvalStatus)
    params.set("approvalStatus", filter.approvalStatus);
  if (filter.status) params.set("status", filter.status);
  const q = filter.q?.trim();
  if (q) params.set("q", q);
  params.set("page", String(filter.page ?? 0));
  params.set("size", String(size));
  return `/api/v1/admin/owners?${params.toString()}`;
}

/** 서버 오류 → 화면 오류 */
export function adminFailure(
  error: unknown,
  fallback: "LOAD_FAILED" | "SAVE_FAILED",
): { ok: false; code: AdminErrorCode; fields?: Record<string, string> } {
  if (!(error instanceof ApiError)) return { ok: false, code: fallback };
  const byCode: Record<string, AdminErrorCode> = {
    ADMIN_ROLE_REQUIRED: "ROLE_REQUIRED",
    OWNER_ALREADY_REVIEWED: "ALREADY_REVIEWED",
    OWNER_NOT_APPROVED: "NOT_APPROVED",
    OWNER_PHONE_DUPLICATED: "PHONE_DUPLICATED",
    VERIFICATION_NOT_FOUND: "NOT_VERIFIED",
    VERIFICATION_PURPOSE_MISMATCH: "NOT_VERIFIED",
    VERIFICATION_ALREADY_USED: "NOT_VERIFIED",
    VERIFICATION_CODE_MISMATCH: "CODE_MISMATCH",
    VERIFICATION_EXPIRED: "CODE_EXPIRED",
    VERIFICATION_ATTEMPTS_EXCEEDED: "ATTEMPT_LIMIT",
    VERIFICATION_RESEND_TOO_SOON: "SEND_LIMIT",
    VERIFICATION_SEND_LIMITED: "SEND_LIMIT",
    VERIFICATION_SEND_FAILED: "SEND_FAILED",
  };
  const mapped = byCode[error.code];
  if (mapped) return { ok: false, code: mapped };
  if (error.status === 401) return { ok: false, code: "EXPIRED" };
  if (error.status === 403) return { ok: false, code: "FORBIDDEN" };
  if (error.status === 404) return { ok: false, code: "NOT_FOUND" };
  if (error.status === 400) {
    const fields: Record<string, string> = {};
    if (Array.isArray(error.result)) {
      for (const f of error.result as { field?: unknown; reason?: unknown }[]) {
        if (typeof f?.field === "string" && typeof f.reason === "string")
          fields[f.field] = f.reason;
      }
    }
    return { ok: false, code: "INVALID", fields };
  }
  return { ok: false, code: fallback };
}

const json = (token?: string) => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

// ── 운영자 로그인 ─────────────────────────────

type ServerVerification = {
  verificationId: number;
  expiresAt: string;
  resendAvailableAt: string;
};

const mapVerification = (v: ServerVerification): VerificationSent => ({
  verificationId: String(v.verificationId),
  expiresAt: toTime(v.expiresAt) ?? Date.now() + 300_000,
  resendAvailableAt: toTime(v.resendAvailableAt) ?? Date.now() + 60_000,
});

/** 운영자 로그인 인증번호 받기. 운영자 번호가 아니면 서버가 403 */
export async function sendAdminLoginCode(
  phone: string,
): Promise<AdminResult<VerificationSent>> {
  try {
    const v = await requestApi<ServerVerification>(
      "/api/v1/auth/verifications",
      {
        method: "POST",
        headers: json(),
        body: JSON.stringify({ purpose: "ADMIN_LOGIN", phone }),
      },
    );
    return { ok: true, data: mapVerification(v) };
  } catch (error) {
    return adminFailure(error, "SAVE_FAILED");
  }
}

/** 인증번호 확인 → 운영자 토큰 */
export async function confirmAdminLogin(
  verificationId: string,
  code: string,
): Promise<AdminResult<AdminLoginResult>> {
  try {
    const v = await requestApi<{
      purpose: string;
      accessToken: string | null;
      expiresAt: string | null;
      admin: { adminId: number; name: string; role: AdminRole } | null;
    }>(
      `/api/v1/auth/verifications/${encodeURIComponent(verificationId)}/confirm`,
      { method: "POST", headers: json(), body: JSON.stringify({ code }) },
    );
    const expiresAt = toTime(v.expiresAt);
    if (
      v.purpose !== "ADMIN_LOGIN" ||
      typeof v.accessToken !== "string" ||
      !/^adm_[A-Za-z0-9_-]+$/.test(v.accessToken) ||
      expiresAt === null ||
      !v.admin ||
      (v.admin.role !== "SUPER" && v.admin.role !== "STAFF")
    ) {
      return { ok: false, code: "FORBIDDEN" };
    }
    return {
      ok: true,
      data: {
        token: v.accessToken,
        expiresAt,
        name: v.admin.name,
        role: v.admin.role,
      },
    };
  } catch (error) {
    return adminFailure(error, "SAVE_FAILED");
  }
}

export async function logoutAdminLive(token: string): Promise<void> {
  try {
    await requestApi("/api/v1/auth/logout", {
      method: "POST",
      headers: json(token),
    });
  } catch {
    // 서버 로그아웃이 실패해도 이 브라우저의 로그인은 지웁니다.
  }
}

// ── 사장님 번호 문자 확인 (업체 등록·로그인 번호 변경) ─────────────────────────────

/** 운영자 토큰으로 사장님 번호에 확인 문자를 보냅니다. 이미 등록된 번호면 409 */
export async function sendOwnerPhoneCode(
  token: string,
  phone: string,
): Promise<AdminResult<VerificationSent>> {
  try {
    const v = await requestApi<ServerVerification>(
      "/api/v1/auth/verifications",
      {
        method: "POST",
        headers: json(token),
        body: JSON.stringify({ purpose: "OWNER_SIGNUP", phone }),
      },
    );
    return { ok: true, data: mapVerification(v) };
  } catch (error) {
    return adminFailure(error, "SAVE_FAILED");
  }
}

/** 사장님이 불러 준 인증번호 확인 (번호가 문자를 받는다는 확인만, 토큰 없음) */
export async function confirmOwnerPhoneCode(
  token: string,
  verificationId: string,
  code: string,
): Promise<AdminResult<{ verifiedAt: number }>> {
  try {
    const v = await requestApi<{ purpose: string; verifiedAt: string | null }>(
      `/api/v1/auth/verifications/${encodeURIComponent(verificationId)}/confirm`,
      { method: "POST", headers: json(token), body: JSON.stringify({ code }) },
    );
    if (v.purpose !== "OWNER_SIGNUP")
      return { ok: false, code: "NOT_VERIFIED" };
    return {
      ok: true,
      data: { verifiedAt: toTime(v.verifiedAt) ?? Date.now() },
    };
  } catch (error) {
    return adminFailure(error, "SAVE_FAILED");
  }
}

// ── 업체 ─────────────────────────────

export async function fetchOwnersLive(
  token: string,
  filter: AdminOwnerFilter,
): Promise<AdminResult<AdminOwnerPage>> {
  try {
    const res = await requestApi<ServerAdminOwnerPage>(ownersQuery(filter), {
      headers: json(token),
    });
    return {
      ok: true,
      data: {
        items: res.content.map(mapOwnerItem),
        page: res.page,
        totalElements: res.totalElements,
        isLast: res.isLast,
      },
    };
  } catch (error) {
    return adminFailure(error, "LOAD_FAILED");
  }
}

export async function fetchOwnerLive(
  token: string,
  id: string,
): Promise<AdminResult<AdminOwner>> {
  try {
    const res = await requestApi<ServerAdminOwner>(
      `/api/v1/admin/owners/${encodeURIComponent(id)}`,
      { headers: json(token) },
    );
    return { ok: true, data: mapOwner(res) };
  } catch (error) {
    return adminFailure(error, "LOAD_FAILED");
  }
}

async function ownerAction(
  token: string,
  path: string,
  method: "POST" | "PATCH" | "PUT",
  body?: unknown,
): Promise<AdminResult<AdminOwner>> {
  try {
    const res = await requestApi<ServerAdminOwner>(path, {
      method,
      headers: json(token),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { ok: true, data: mapOwner(res) };
  } catch (error) {
    return adminFailure(error, "SAVE_FAILED");
  }
}

const ownerPath = (id: string, tail = "") =>
  `/api/v1/admin/owners/${encodeURIComponent(id)}${tail}`;

/** 업체 신청 등록 → 승인 대기·준비 중·자동 예약 꺼짐 */
export const registerOwnerLive = (token: string, input: RegisterOwnerInput) =>
  ownerAction(token, "/api/v1/admin/owners", "POST", {
    businessName: input.businessName.trim(),
    ownerName: input.ownerName.trim() || null,
    phone: input.phone,
    phoneVerificationId: Number(input.phoneVerificationId),
    contactPhone: input.contactPhone.trim() || null,
    address: input.address.trim() || null,
    serviceDescription: input.serviceDescription.trim() || null,
  });

export const approveOwnerLive = (token: string, id: string) =>
  ownerAction(token, ownerPath(id, "/approve"), "POST");

export const rejectOwnerLive = (token: string, id: string, reason: string) =>
  ownerAction(token, ownerPath(id, "/reject"), "POST", {
    reason: reason.trim(),
  });

export const changeOwnerStatusLive = (
  token: string,
  id: string,
  status: AdminOwner["status"],
) => ownerAction(token, ownerPath(id, "/status"), "PATCH", { status });

/** 로그인 번호 변경 (최고 운영자). 기존 사장님 로그인은 모두 끊깁니다. */
export const changeLoginPhoneLive = (
  token: string,
  id: string,
  newPhone: string,
  phoneVerificationId: string,
) =>
  ownerAction(token, ownerPath(id, "/login-phone"), "PUT", {
    newPhone,
    phoneVerificationId: Number(phoneVerificationId),
  });

/** 접수 링크 발급·재발급. 재발급하면 기존 링크는 바로 못 씁니다. */
export async function issueIntakeLinkLive(
  token: string,
  id: string,
): Promise<AdminResult<IntakeLink>> {
  try {
    const res = await requestApi<{
      status: string;
      url: string | null;
      businessName: string | null;
    }>(ownerPath(id, "/intake-link"), { method: "POST", headers: json(token) });
    if (!res.url) return { ok: false, code: "SAVE_FAILED" };
    return { ok: true, data: { url: res.url, businessName: res.businessName } };
  } catch (error) {
    return adminFailure(error, "SAVE_FAILED");
  }
}
