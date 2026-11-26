// 운영 화면 목업 (FE-19)
// 화면 검수용 예시 로그인에서만 씁니다. 브라우저 메모리에만 저장되고 새로고침하면 처음 값으로 돌아갑니다.
// - 운영자 로그인: 아무 휴대전화번호 + 인증번호 123456
//   (끝자리 0002 번호는 일반 운영자 STAFF, 나머지는 최고 운영자 SUPER, 끝자리 0009는 운영자가 아님)
// - 사장님 번호 확인 인증번호도 123456
import type {
  AdminOwner,
  AdminOwnerFilter,
  AdminOwnerPage,
  AdminResult,
  AdminRole,
  IntakeLink,
  OwnerStatus,
  RegisterOwnerInput,
  VerificationSent,
} from "./types";
import { registerErrors, rejectReasonError } from "./rules.ts";

export const MOCK_ADMIN_CODE = "123456";

export const mockAdminConfig = {
  /** 응답 지연(ms). 테스트에서는 0으로 둡니다. */
  delayMs: 300,
  now: () => Date.now(),
};

const wait = () =>
  mockAdminConfig.delayMs > 0
    ? new Promise((r) => setTimeout(r, mockAdminConfig.delayMs))
    : Promise.resolve();

const DAY = 86_400_000;

function seed(): AdminOwner[] {
  const now = mockAdminConfig.now();
  const base = {
    contactPhone: null,
    address: null,
    serviceDescription: null,
    rejectionReason: null,
    reviewer: null,
    reviewedAt: null,
    autoBookingEnabled: false,
    intakePaused: false,
    intakeLinkActive: false,
  };
  return [
    {
      ...base,
      id: "6",
      businessName: "새봄보일러",
      ownerName: "정○○",
      phone: "01000000106",
      approvalStatus: "PENDING",
      status: "READY",
      contactPhone: "031-000-0106",
      address: "고양시 덕양구 행신동",
      serviceDescription: "가정용 보일러 점검·수리",
      createdAt: now - 2 * 3_600_000,
      updatedAt: now - 2 * 3_600_000,
    },
    {
      ...base,
      id: "5",
      businessName: "온누리설비",
      ownerName: null,
      phone: "01000000105",
      approvalStatus: "PENDING",
      status: "READY",
      createdAt: now - DAY,
      updatedAt: now - DAY,
    },
    {
      ...base,
      id: "1",
      businessName: "한빛보일러",
      ownerName: "김○○",
      phone: "01000000101",
      approvalStatus: "APPROVED",
      status: "ACTIVE",
      contactPhone: "031-000-0101",
      address: "고양시 덕양구 화정동",
      serviceDescription: "보일러 수리·교체, 누수",
      reviewer: { id: "1", name: "운영자" },
      reviewedAt: now - 20 * DAY,
      autoBookingEnabled: true,
      intakeLinkActive: true,
      createdAt: now - 21 * DAY,
      updatedAt: now - 3 * DAY,
    },
    {
      ...base,
      id: "2",
      businessName: "튼튼설비",
      ownerName: "이○○",
      phone: "01000000102",
      approvalStatus: "APPROVED",
      status: "READY",
      reviewer: { id: "1", name: "운영자" },
      reviewedAt: now - 2 * DAY,
      intakeLinkActive: true,
      createdAt: now - 3 * DAY,
      updatedAt: now - 2 * DAY,
    },
    {
      ...base,
      id: "3",
      businessName: "바른난방",
      ownerName: "박○○",
      phone: "01000000103",
      approvalStatus: "APPROVED",
      status: "RESTRICTED",
      reviewer: { id: "1", name: "운영자" },
      reviewedAt: now - 30 * DAY,
      createdAt: now - 31 * DAY,
      updatedAt: now - 5 * DAY,
    },
    {
      ...base,
      id: "4",
      businessName: "우리집수리",
      ownerName: "최○○",
      phone: "01000000104",
      approvalStatus: "REJECTED",
      status: "READY",
      rejectionReason:
        "사업자 정보를 확인하지 못했어요. 운영팀으로 연락해 주세요.",
      reviewer: { id: "1", name: "운영자" },
      reviewedAt: now - 4 * DAY,
      createdAt: now - 5 * DAY,
      updatedAt: now - 4 * DAY,
    },
  ];
}

let owners: AdminOwner[] | null = null;
let nextId = 100;
const linkSerial = new Map<string, number>();
/** 확인 문자를 보낸 번호 (인증 번호 → 번호·확인 여부) */
const verifications = new Map<string, { phone: string; verified: boolean }>();

function all(): AdminOwner[] {
  owners ??= seed();
  return owners;
}

/** 테스트용: 처음 값으로 되돌립니다. */
export function resetMockAdmin() {
  owners = null;
  nextId = 100;
  linkSerial.clear();
  verifications.clear();
}

function find(id: string) {
  return all().find((o) => o.id === id) ?? null;
}

function save(updated: AdminOwner) {
  owners = all().map((o) => (o.id === updated.id ? updated : o));
  return updated;
}

const MOCK_REVIEWER = { id: "1", name: "예시 운영자" };

function sent(id: string): VerificationSent {
  const now = mockAdminConfig.now();
  return {
    verificationId: id,
    expiresAt: now + 300_000,
    resendAvailableAt: now + 30_000,
  };
}

// ── 운영자 로그인 ─────────────────────────────

export async function sendAdminLoginCodeMock(
  phone: string,
): Promise<AdminResult<VerificationSent>> {
  await wait();
  if (!/^01[016789]\d{7,8}$/.test(phone)) return { ok: false, code: "INVALID" };
  if (phone.endsWith("0009")) return { ok: false, code: "FORBIDDEN" };
  const id = `login-${phone}`;
  verifications.set(id, { phone, verified: false });
  return { ok: true, data: sent(id) };
}

export async function confirmAdminLoginMock(
  verificationId: string,
  code: string,
): Promise<AdminResult<{ expiresAt: number; name: string; role: AdminRole }>> {
  await wait();
  const v = verifications.get(verificationId);
  if (!v) return { ok: false, code: "NOT_VERIFIED" };
  if (code !== MOCK_ADMIN_CODE) return { ok: false, code: "CODE_MISMATCH" };
  verifications.delete(verificationId);
  return {
    ok: true,
    data: {
      expiresAt: mockAdminConfig.now() + 12 * 3_600_000,
      name: "예시 운영자",
      role: v.phone.endsWith("0002") ? "STAFF" : "SUPER",
    },
  };
}

// ── 사장님 번호 확인 ─────────────────────────────

export async function sendOwnerPhoneCodeMock(
  phone: string,
): Promise<AdminResult<VerificationSent>> {
  await wait();
  if (!/^01[016789]\d{7,8}$/.test(phone)) return { ok: false, code: "INVALID" };
  if (all().some((o) => o.phone === phone))
    return { ok: false, code: "PHONE_DUPLICATED" };
  const id = `owner-${verifications.size + 1}-${phone}`;
  verifications.set(id, { phone, verified: false });
  return { ok: true, data: sent(id) };
}

export async function confirmOwnerPhoneCodeMock(
  verificationId: string,
  code: string,
): Promise<AdminResult<{ verifiedAt: number }>> {
  await wait();
  const v = verifications.get(verificationId);
  if (!v) return { ok: false, code: "NOT_VERIFIED" };
  if (code !== MOCK_ADMIN_CODE) return { ok: false, code: "CODE_MISMATCH" };
  v.verified = true;
  return { ok: true, data: { verifiedAt: mockAdminConfig.now() } };
}

function consumeVerification(id: string, phone: string) {
  const v = verifications.get(id);
  if (!v || !v.verified || v.phone !== phone) return false;
  verifications.delete(id);
  return true;
}

// ── 업체 ─────────────────────────────

const PAGE_SIZE = 20;

export async function fetchOwnersMock(
  filter: AdminOwnerFilter,
): Promise<AdminResult<AdminOwnerPage>> {
  await wait();
  const q = filter.q?.trim().toLowerCase() ?? "";
  const qDigits = /^[\d-]+$/.test(q) ? q.replace(/-/g, "") : null;
  const matched = all()
    .filter(
      (o) =>
        (!filter.approvalStatus ||
          o.approvalStatus === filter.approvalStatus) &&
        (!filter.status || o.status === filter.status) &&
        (!q ||
          (qDigits !== null
            ? o.phone.includes(qDigits)
            : o.businessName.toLowerCase().includes(q) ||
              (o.ownerName ?? "").toLowerCase().includes(q))),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  const page = filter.page ?? 0;
  const items = matched.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return {
    ok: true,
    data: {
      items,
      page,
      totalElements: matched.length,
      isLast: (page + 1) * PAGE_SIZE >= matched.length,
    },
  };
}

export async function fetchOwnerMock(
  id: string,
): Promise<AdminResult<AdminOwner>> {
  await wait();
  const o = find(id);
  return o ? { ok: true, data: o } : { ok: false, code: "NOT_FOUND" };
}

export async function registerOwnerMock(
  input: RegisterOwnerInput,
): Promise<AdminResult<AdminOwner>> {
  await wait();
  if (Object.keys(registerErrors(input)).length > 0)
    return { ok: false, code: "INVALID" };
  if (all().some((o) => o.phone === input.phone))
    return { ok: false, code: "PHONE_DUPLICATED" };
  if (!consumeVerification(input.phoneVerificationId, input.phone))
    return { ok: false, code: "NOT_VERIFIED" };
  const now = mockAdminConfig.now();
  const created: AdminOwner = {
    id: String(nextId++),
    businessName: input.businessName.trim(),
    ownerName: input.ownerName.trim() || null,
    phone: input.phone,
    approvalStatus: "PENDING",
    status: "READY",
    contactPhone: input.contactPhone.trim() || null,
    address: input.address.trim() || null,
    serviceDescription: input.serviceDescription.trim() || null,
    rejectionReason: null,
    reviewer: null,
    reviewedAt: null,
    autoBookingEnabled: false,
    intakePaused: false,
    intakeLinkActive: false,
    createdAt: now,
    updatedAt: now,
  };
  owners = [created, ...all()];
  return { ok: true, data: created };
}

async function review(
  id: string,
  approve: boolean,
  reason?: string,
): Promise<AdminResult<AdminOwner>> {
  await wait();
  const o = find(id);
  if (!o) return { ok: false, code: "NOT_FOUND" };
  if (o.approvalStatus !== "PENDING")
    return { ok: false, code: "ALREADY_REVIEWED" };
  if (!approve && rejectReasonError(reason ?? ""))
    return { ok: false, code: "INVALID" };
  const now = mockAdminConfig.now();
  return {
    ok: true,
    data: save({
      ...o,
      approvalStatus: approve ? "APPROVED" : "REJECTED",
      rejectionReason: approve ? null : reason!.trim(),
      reviewer: MOCK_REVIEWER,
      reviewedAt: now,
      intakeLinkActive: approve,
      updatedAt: now,
    }),
  };
}

export const approveOwnerMock = (id: string) => review(id, true);
export const rejectOwnerMock = (id: string, reason: string) =>
  review(id, false, reason);

export async function changeOwnerStatusMock(
  id: string,
  status: OwnerStatus,
): Promise<AdminResult<AdminOwner>> {
  await wait();
  const o = find(id);
  if (!o) return { ok: false, code: "NOT_FOUND" };
  if (o.approvalStatus !== "APPROVED")
    return { ok: false, code: "NOT_APPROVED" };
  if (status === "WITHDRAWN" || o.status === "WITHDRAWN")
    return { ok: false, code: "INVALID" };
  return {
    ok: true,
    data: save({ ...o, status, updatedAt: mockAdminConfig.now() }),
  };
}

export async function changeLoginPhoneMock(
  role: AdminRole,
  id: string,
  newPhone: string,
  verificationId: string,
): Promise<AdminResult<AdminOwner>> {
  await wait();
  if (role !== "SUPER") return { ok: false, code: "ROLE_REQUIRED" };
  const o = find(id);
  if (!o) return { ok: false, code: "NOT_FOUND" };
  if (all().some((x) => x.phone === newPhone))
    return { ok: false, code: "PHONE_DUPLICATED" };
  if (!consumeVerification(verificationId, newPhone))
    return { ok: false, code: "NOT_VERIFIED" };
  return {
    ok: true,
    data: save({ ...o, phone: newPhone, updatedAt: mockAdminConfig.now() }),
  };
}

export async function issueIntakeLinkMock(
  id: string,
): Promise<AdminResult<IntakeLink>> {
  await wait();
  const o = find(id);
  if (!o) return { ok: false, code: "NOT_FOUND" };
  if (o.approvalStatus !== "APPROVED")
    return { ok: false, code: "NOT_APPROVED" };
  const n = (linkSerial.get(id) ?? 0) + 1;
  linkSerial.set(id, n);
  save({ ...o, intakeLinkActive: true });
  const origin =
    typeof window === "undefined"
      ? "https://ilro.example"
      : window.location.origin;
  return {
    ok: true,
    data: {
      url: `${origin}/customer/example-${id}-${n}`,
      businessName: o.businessName,
    },
  };
}
