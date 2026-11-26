// 운영 업체·계정·웹 접수 링크 관리 (FE-19 · B-01, O-01~O-04)
// 서버 없이, 백엔드 BE-17 DTO와 같은 모양의 예시 응답과 목업으로 검사합니다.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  adminFailure,
  approveOwnerLive,
  changeLoginPhoneLive,
  changeOwnerStatusLive,
  confirmAdminLogin,
  fetchOwnersLive,
  issueIntakeLinkLive,
  mapOwner,
  ownersQuery,
  registerOwnerLive,
  rejectOwnerLive,
  sendAdminLoginCode,
  sendOwnerPhoneCode,
} from "../src/lib/admin/live-api.ts";
import {
  approveOwnerMock,
  changeLoginPhoneMock,
  changeOwnerStatusMock,
  confirmOwnerPhoneCodeMock,
  fetchOwnersMock,
  issueIntakeLinkMock,
  mockAdminConfig,
  registerOwnerMock,
  rejectOwnerMock,
  resetMockAdmin,
  sendOwnerPhoneCodeMock,
} from "../src/lib/admin/mock-api.ts";
import {
  ownerActionsOf,
  registerErrors,
  rejectReasonError,
} from "../src/lib/admin/rules.ts";
import { parseAdminSession } from "../src/lib/admin/session.ts";
import { ApiError } from "../src/lib/api.ts";

const serverOwner = (over = {}) => ({
  ownerId: 7,
  businessName: "한빛보일러",
  ownerName: "김민수",
  phone: "010-1234-5678",
  contactPhone: "031-000-0000",
  address: "고양시",
  serviceDescription: "보일러 수리",
  approvalStatus: "PENDING",
  status: "READY",
  rejectionReason: null,
  reviewedAt: null,
  reviewedBy: null,
  autoBookingEnabled: false,
  intakePaused: false,
  intakeLinkActive: false,
  createdAt: "2026-11-26T10:00:00+09:00",
  updatedAt: "2026-11-26T10:00:00+09:00",
  ...over,
});

// ── 규칙 ─────────────────────────────

test("거절 사유는 필수이고 255자까지", () => {
  assert.ok(rejectReasonError("   "));
  assert.equal(rejectReasonError("사업자 확인 불가"), null);
  assert.ok(rejectReasonError("가".repeat(256)));
});

test("업체 등록: 업체명·로그인 번호는 필수, 나머지는 길이·형식만 본다", () => {
  const ok = {
    businessName: "한빛",
    ownerName: "",
    phone: "01012345678",
    contactPhone: "",
    address: "",
    serviceDescription: "",
  };
  assert.deepEqual(registerErrors(ok), {});
  const bad = registerErrors({
    ...ok,
    businessName: " ",
    phone: "0212345678",
    contactPhone: "12",
  });
  assert.ok(bad.businessName && bad.phone && bad.contactPhone);
});

test("승인 대기만 심사하고, 승인된 업체만 운영 상태·링크를 바꾼다", () => {
  const o = mapOwner(serverOwner());
  assert.deepEqual(ownerActionsOf(o), {
    canReview: true,
    canChangeStatus: false,
    canIssueLink: false,
    canChangePhone: true,
  });
  const approved = { ...o, approvalStatus: "APPROVED" };
  assert.equal(ownerActionsOf(approved).canReview, false);
  assert.equal(ownerActionsOf(approved).canChangeStatus, true);
  const gone = { ...approved, status: "WITHDRAWN" };
  assert.equal(ownerActionsOf(gone).canIssueLink, false);
  assert.equal(ownerActionsOf(gone).canChangePhone, false);
});

test("운영자 로그인 저장값: 사장님 토큰(own_)·만료는 운영 로그인으로 보지 않는다", () => {
  const base = {
    mode: "live",
    token: "adm_abc",
    name: "운영",
    role: "SUPER",
    phone: "01000000000",
    expiresAt: 2000,
  };
  assert.equal(parseAdminSession(JSON.stringify(base), 1000).status, "active");
  assert.equal(
    parseAdminSession(JSON.stringify({ ...base, token: "own_abc" }), 1000)
      .status,
    "none",
  );
  assert.equal(parseAdminSession(JSON.stringify(base), 3000).status, "expired");
  assert.equal(parseAdminSession("{oops", 0).status, "none");
});

// ── 응답 바꾸기·오류 ─────────────────────────────

test("업체 응답: 번호는 숫자만, 심사자·시각을 화면 모양으로", () => {
  const o = mapOwner(
    serverOwner({
      approvalStatus: "APPROVED",
      reviewedAt: "2026-11-26T11:00:00+09:00",
      reviewedBy: { adminId: 1, name: "운영자" },
    }),
  );
  assert.equal(o.id, "7");
  assert.equal(o.phone, "01012345678");
  assert.deepEqual(o.reviewer, { id: "1", name: "운영자" });
  assert.equal(o.reviewedAt, Date.parse("2026-11-26T11:00:00+09:00"));
});

test("목록 주소: 보낸 조건만 붙인다", () => {
  assert.equal(
    ownersQuery({ approvalStatus: "PENDING" }),
    "/api/v1/admin/owners?approvalStatus=PENDING&page=0&size=20",
  );
  assert.equal(
    ownersQuery({ status: "ACTIVE", q: " 한빛 ", page: 2 }),
    "/api/v1/admin/owners?status=ACTIVE&q=%ED%95%9C%EB%B9%9B&page=2&size=20",
  );
});

test("서버 오류 코드를 화면 안내로 나눈다", () => {
  const f = (status, code, result) =>
    adminFailure(new ApiError(status, code, "", result), "SAVE_FAILED").code;
  assert.equal(f(401, "UNAUTHORIZED"), "EXPIRED");
  assert.equal(f(403, "FORBIDDEN"), "FORBIDDEN");
  assert.equal(f(403, "ADMIN_ROLE_REQUIRED"), "ROLE_REQUIRED");
  assert.equal(f(409, "OWNER_ALREADY_REVIEWED"), "ALREADY_REVIEWED");
  assert.equal(f(409, "OWNER_NOT_APPROVED"), "NOT_APPROVED");
  assert.equal(f(409, "OWNER_PHONE_DUPLICATED"), "PHONE_DUPLICATED");
  assert.equal(f(404, "VERIFICATION_NOT_FOUND"), "NOT_VERIFIED");
  assert.equal(f(403, "VERIFICATION_PURPOSE_MISMATCH"), "NOT_VERIFIED");
  assert.equal(f(404, "RESOURCE_NOT_FOUND"), "NOT_FOUND");
  assert.equal(f(500, "INTERNAL"), "SAVE_FAILED");
  assert.equal(adminFailure(new Error("x"), "LOAD_FAILED").code, "LOAD_FAILED");
  const invalid = adminFailure(
    new ApiError(400, "INVALID_INPUT", "", [
      { field: "contactPhone", reason: "전화번호 형식이 아닙니다" },
    ]),
    "SAVE_FAILED",
  );
  assert.equal(invalid.code, "INVALID");
  assert.deepEqual(invalid.fields, {
    contactPhone: "전화번호 형식이 아닙니다",
  });
});

// ── 서버 요청 ─────────────────────────────

const realFetch = globalThis.fetch;
const previousBase = process.env.NEXT_PUBLIC_API_BASE_URL;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (previousBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = previousBase;
});

function fakeServer(reply) {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: init.method ?? "GET",
      auth: new Headers(init.headers).get("Authorization"),
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const { status = 200, result = null, code = "OK" } = reply(call);
    return Response.json(
      { success: status < 400, code, message: "", result },
      { status },
    );
  };
  return calls;
}

test("운영자 로그인: ADMIN_LOGIN으로 보내고, 운영자 토큰만 받아들인다", async () => {
  let calls = fakeServer(() => ({
    result: {
      verificationId: 3,
      expiresAt: "2026-11-26T10:05:00+09:00",
      resendAvailableAt: "2026-11-26T10:01:00+09:00",
    },
  }));
  const sent = await sendAdminLoginCode("01012345678");
  assert.equal(sent.ok, true);
  assert.deepEqual(calls[0].body, {
    purpose: "ADMIN_LOGIN",
    phone: "01012345678",
  });
  assert.equal(calls[0].auth, null);

  fakeServer(() => ({ status: 403, code: "FORBIDDEN" }));
  assert.equal((await sendAdminLoginCode("01012345678")).code, "FORBIDDEN");

  const admin = { adminId: 1, name: "운영", role: "STAFF" };
  fakeServer(() => ({
    result: {
      purpose: "ADMIN_LOGIN",
      accessToken: "adm_xyz",
      expiresAt: "2026-11-26T22:00:00+09:00",
      admin,
    },
  }));
  const ok = await confirmAdminLogin("3", "123456");
  assert.equal(ok.ok, true);
  assert.equal(ok.data.role, "STAFF");

  fakeServer(() => ({
    result: {
      purpose: "OWNER_LOGIN",
      accessToken: "own_xyz",
      expiresAt: "2026-11-26T22:00:00+09:00",
      admin,
    },
  }));
  assert.equal((await confirmAdminLogin("3", "123456")).code, "FORBIDDEN");
});

test("사장님 번호 확인 문자는 운영자 토큰과 OWNER_SIGNUP으로 보낸다", async () => {
  const calls = fakeServer(() => ({
    result: {
      verificationId: 9,
      expiresAt: "2026-11-26T10:05:00+09:00",
      resendAvailableAt: "2026-11-26T10:01:00+09:00",
    },
  }));
  await sendOwnerPhoneCode("adm_t", "01011112222");
  assert.equal(calls[0].auth, "Bearer adm_t");
  assert.deepEqual(calls[0].body, {
    purpose: "OWNER_SIGNUP",
    phone: "01011112222",
  });
});

test("업체 등록·승인·거절·운영 상태·번호 변경·링크 발급 요청 모양", async () => {
  const calls = fakeServer((c) =>
    c.url.endsWith("/intake-link")
      ? {
          result: {
            status: "READY",
            url: "https://ilro.test/customer/t1",
            businessName: "한빛",
          },
        }
      : { result: serverOwner() },
  );
  await registerOwnerLive("adm_t", {
    businessName: " 한빛 ",
    ownerName: "",
    phone: "01012345678",
    phoneVerificationId: "9",
    contactPhone: "",
    address: "고양시",
    serviceDescription: "",
  });
  await approveOwnerLive("adm_t", "7");
  await rejectOwnerLive("adm_t", "7", "  확인 불가 ");
  await changeOwnerStatusLive("adm_t", "7", "RESTRICTED");
  await changeLoginPhoneLive("adm_t", "7", "01099998888", "11");
  const link = await issueIntakeLinkLive("adm_t", "7");

  const path = (i) => calls[i].url.replace("https://api.example.test", "");
  assert.equal(calls[0].method, "POST");
  assert.equal(path(0), "/api/v1/admin/owners");
  assert.deepEqual(calls[0].body, {
    businessName: "한빛",
    ownerName: null,
    phone: "01012345678",
    phoneVerificationId: 9,
    contactPhone: null,
    address: "고양시",
    serviceDescription: null,
  });
  assert.equal(path(1), "/api/v1/admin/owners/7/approve");
  assert.equal(calls[1].body, undefined);
  assert.equal(path(2), "/api/v1/admin/owners/7/reject");
  assert.deepEqual(calls[2].body, { reason: "확인 불가" });
  assert.equal(calls[3].method, "PATCH");
  assert.deepEqual(calls[3].body, { status: "RESTRICTED" });
  assert.equal(calls[4].method, "PUT");
  assert.equal(path(4), "/api/v1/admin/owners/7/login-phone");
  assert.deepEqual(calls[4].body, {
    newPhone: "01099998888",
    phoneVerificationId: 11,
  });
  assert.equal(path(5), "/api/v1/admin/owners/7/intake-link");
  assert.deepEqual(link, {
    ok: true,
    data: { url: "https://ilro.test/customer/t1", businessName: "한빛" },
  });
  assert.ok(calls.every((c) => c.auth === "Bearer adm_t"));
});

test("목록 실패는 0건처럼 보이지 않는다", async () => {
  fakeServer(() => ({ status: 500, code: "X" }));
  assert.deepEqual(await fetchOwnersLive("adm_t", {}), {
    ok: false,
    code: "LOAD_FAILED",
  });
});

// ── 목업 흐름 ─────────────────────────────

beforeEach(() => {
  mockAdminConfig.delayMs = 0;
  resetMockAdmin();
});

async function verifiedPhone(phone) {
  const sent = await sendOwnerPhoneCodeMock(phone);
  assert.equal(sent.ok, true);
  const ok = await confirmOwnerPhoneCodeMock(
    sent.data.verificationId,
    "123456",
  );
  assert.equal(ok.ok, true);
  return sent.data.verificationId;
}

test("목업: 문자 확인한 번호로만 등록되고, 결과는 승인 대기·준비 중·자동 예약 꺼짐", async () => {
  const input = {
    businessName: "새업체",
    ownerName: "",
    phone: "01055556666",
    contactPhone: "",
    address: "",
    serviceDescription: "",
  };
  assert.equal(
    (await registerOwnerMock({ ...input, phoneVerificationId: "nope" })).code,
    "NOT_VERIFIED",
  );
  const vid = await verifiedPhone("01055556666");
  const res = await registerOwnerMock({ ...input, phoneVerificationId: vid });
  assert.equal(res.ok, true);
  assert.equal(res.data.approvalStatus, "PENDING");
  assert.equal(res.data.status, "READY");
  assert.equal(res.data.autoBookingEnabled, false);
  // 같은 번호는 다시 문자 확인부터 막힌다
  assert.equal(
    (await sendOwnerPhoneCodeMock("01055556666")).code,
    "PHONE_DUPLICATED",
  );
});

test("목업: 승인은 한 번만, 거절은 사유 필수, 승인해도 자동 예약은 켜지지 않는다", async () => {
  assert.equal((await rejectOwnerMock("6", " ")).code, "INVALID");
  const approved = await approveOwnerMock("6");
  assert.equal(approved.data.approvalStatus, "APPROVED");
  assert.equal(approved.data.autoBookingEnabled, false);
  assert.ok(approved.data.reviewer);
  assert.equal((await approveOwnerMock("6")).code, "ALREADY_REVIEWED");
  const rejected = await rejectOwnerMock("5", "사업자 확인 불가");
  assert.equal(rejected.data.rejectionReason, "사업자 확인 불가");
});

test("목업: 승인 전에는 운영 상태·링크를 바꾸지 못하고, 이용 제한은 업체를 지우지 않는다", async () => {
  assert.equal(
    (await changeOwnerStatusMock("5", "ACTIVE")).code,
    "NOT_APPROVED",
  );
  assert.equal((await issueIntakeLinkMock("5")).code, "NOT_APPROVED");
  const restricted = await changeOwnerStatusMock("1", "RESTRICTED");
  assert.equal(restricted.data.status, "RESTRICTED");
  assert.equal(restricted.data.approvalStatus, "APPROVED");
  const list = await fetchOwnersMock({ status: "RESTRICTED" });
  assert.ok(list.data.items.some((o) => o.id === "1"));
});

test("목업: 재발급할 때마다 새 링크가 나온다", async () => {
  const a = await issueIntakeLinkMock("1");
  const b = await issueIntakeLinkMock("1");
  assert.notEqual(a.data.url, b.data.url);
});

test("목업: 로그인 번호 변경은 최고 운영자 + 새 번호 문자 확인이 있어야 한다", async () => {
  const vid = await verifiedPhone("01077778888");
  assert.equal(
    (await changeLoginPhoneMock("STAFF", "1", "01077778888", vid)).code,
    "ROLE_REQUIRED",
  );
  assert.equal(
    (await changeLoginPhoneMock("SUPER", "1", "01077778888", "nope")).code,
    "NOT_VERIFIED",
  );
  const ok = await changeLoginPhoneMock("SUPER", "1", "01077778888", vid);
  assert.equal(ok.data.phone, "01077778888");
  assert.equal(ok.data.businessName, "한빛보일러");
});

test("목업 목록: 심사 상태·검색으로 거른다", async () => {
  const pending = await fetchOwnersMock({ approvalStatus: "PENDING" });
  assert.ok(pending.data.items.every((o) => o.approvalStatus === "PENDING"));
  const byPhone = await fetchOwnersMock({ q: "010-0000-0101" });
  assert.deepEqual(
    byPhone.data.items.map((o) => o.id),
    ["1"],
  );
  const byName = await fetchOwnersMock({ q: "튼튼" });
  assert.deepEqual(
    byName.data.items.map((o) => o.id),
    ["2"],
  );
});
