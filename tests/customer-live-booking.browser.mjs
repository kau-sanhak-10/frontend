import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const base = process.env.PREVIEW_BASE_URL ?? "http://127.0.0.1:35115";
assert.equal(new URL(base).hostname, "127.0.0.1");
const api = "http://127.0.0.1:35116";
const link = "b".repeat(43);
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
});
const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
const expires = new Date(Date.now() + 600_000).toISOString();
const issues = [];
const keys = [];
const startKeys = [];
let purpose,
  booked = false,
  verified = false,
  failSend = true,
  mismatch = true;
let version = 3;
let ownerReview = false;
let recoveryListChanged = false;
let slotReads = 0;
let visit = {
  name: null,
  phone: null,
  address: null,
  addressDetail: null,
  lat: null,
  lng: null,
  accessNote: null,
  workCategory: null,
};
const click = (name) => page.getByRole("button", { name, exact: true }).click();
const seen = (value) =>
  page.getByText(value, { exact: false }).first().waitFor();
const otp = () => page.getByLabel("문자 인증번호").fill("123456");
const shots = ".impeccable/review";
await mkdir(shots, { recursive: true });
page.on("pageerror", (error) => issues.push(error.message));
await page.route("**/*", (route) => {
  const origin = new URL(route.request().url()).origin;
  return [base, api].includes(origin) ? route.fallback() : route.abort();
});
await page.route(`${api}/**`, async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const path = url.pathname;
  const method = req.method();
  const headers = {
    "access-control-allow-origin": base,
    "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
    "access-control-allow-headers":
      "authorization, content-type, idempotency-key",
  };
  if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
  const respond = (result, status = 200, code = "OK") =>
    route.fulfill({
      status,
      headers,
      json: { success: status < 400, code, message: "", result },
    });
  const slot = (day) => ({
    startAt: `${day}T10:00:00+09:00`,
    endAt: `${day}T11:00:00+09:00`,
  });
  const confirmed = {
    reservationId: 71,
    status: "CONFIRMED",
    version: 1,
    ...slot(new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10)),
    notifications: [
      { recipient: "CUSTOMER", channel: "SMS", sendStatus: "FAILED" },
    ],
  };
  if (path === `/api/v1/public/intake/${link}`)
    return respond({
      businessName: "테스트 보일러",
      contactPhone: "020000000",
      customerNotice: "",
      serviceDescription: "",
      workCategories: ["REPAIR"],
      intakeAvailable: true,
      termsVersion: "test-v1",
    });
  if (path === `/api/v1/public/intake/${link}/inquiries`) {
    startKeys.push(req.headers()["idempotency-key"]);
    if (startKeys.length === 1) return route.abort();
    return respond(
      {
        inquiryId: 10,
        inquiryToken: "inq_test",
        expiresAt: expires,
      },
      200,
    );
  }
  const token = req.headers().authorization;
  if (path === "/api/v1/auth/verifications") {
    const body = req.postDataJSON();
    purpose = body.purpose;
    if (purpose === "CUSTOMER_VERIFY") {
      assert.equal(token, "Bearer inq_test");
      if (failSend) {
        failSend = false;
        return respond(null, 502, "VERIFICATION_SEND_FAILED");
      }
    } else {
      assert.equal(token, undefined);
      assert.equal(body.linkToken, link);
    }
    assert.equal(body.phone, "01000000000");
    return respond(
      {
        verificationId: 51,
        expiresAt: expires,
        resendAvailableAt: new Date().toISOString(),
      },
      201,
    );
  }
  if (path === "/api/v1/auth/verifications/51/confirm") {
    if (purpose === "CUSTOMER_VERIFY") {
      if (mismatch) {
        mismatch = false;
        return respond({ attemptsLeft: 4 }, 400, "VERIFICATION_CODE_MISMATCH");
      }
      verified = true;
      return respond({
        purpose,
        inquiryId: 10,
        verifiedAt: new Date().toISOString(),
      });
    }
    return respond({
      purpose,
      accessToken: purpose === "INQUIRY_ACCESS" ? "cus_recovery" : "cus_lookup",
      expiresAt: expires,
    });
  }
  if (path === "/api/v1/customer/reservations") {
    assert.equal(token, "Bearer cus_lookup");
    return respond({ reservations: [confirmed] });
  }
  if (path === "/api/v1/customer/reservations/71") {
    assert.ok(
      ["Bearer cus_lookup", "Bearer inq_test", "Bearer inq_restored"].includes(
        token,
      ),
    );
    return respond({ ...confirmed, address: "테스트 방문 주소" });
  }
  if (path === "/api/v1/customer/inquiries") {
    assert.equal(token, "Bearer cus_recovery");
    return respond({
      inquiries: [
        {
          inquiryId: 10,
          status: "COLLECTING",
          symptom: "온수가 안 나와요",
          updatedAt: new Date().toISOString(),
        },
        {
          inquiryId: 11,
          status: recoveryListChanged ? "CLOSED" : "COLLECTING",
          symptom: "이전 목록의 상담",
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  }
  if (path.endsWith("/access-token")) {
    assert.equal(token, "Bearer cus_recovery");
    if (path.includes("/11/")) {
      recoveryListChanged = true;
      return respond(null, 409, "INQUIRY_CLOSED");
    }
    return respond(
      { inquiryId: 10, inquiryToken: "inq_restored", expiresAt: expires },
      201,
    );
  }
  assert.ok(["Bearer inq_test", "Bearer inq_restored"].includes(token));
  if (path.endsWith("/messages"))
    return method === "POST"
      ? respond({ messageId: 3, aiStatus: "NONE", deliveryStatus: "SENT" }, 201)
      : respond({
          messages:
            token === "Bearer inq_restored"
              ? [
                  {
                    messageId: 3,
                    sender: "CUSTOMER",
                    deliveryStatus: "SENT",
                    content: "온수가 안 나와요",
                    createdAt: new Date().toISOString(),
                    photos: [],
                  },
                  {
                    messageId: 4,
                    sender: "OWNER",
                    deliveryStatus: "SENT",
                    content: "복구된 테스트 대화입니다",
                    createdAt: new Date().toISOString(),
                    photos: [],
                  },
                ]
              : [],
          hasMore: false,
        });
  if (path.endsWith("/fields")) return respond({ version, fields: [] });
  if (path.endsWith("/addresses")) {
    assert.equal(url.searchParams.get("query"), "테스트로 10");
    return respond({
      addresses: [{ address: "테스트 방문 주소", lat: 37.5, lng: 127 }],
    });
  }
  if (path.endsWith("/visit-info")) {
    assert.equal(method, "PUT");
    const input = req.postDataJSON();
    assert.equal(input.version, version);
    assert.equal(input.address, "테스트 방문 주소");
    assert.equal(input.lat, 37.5);
    assert.equal(input.lng, 127);
    visit = { ...visit, ...input };
    return respond({ inquiryId: 10, version: ++version });
  }
  if (path.endsWith("/available-slots")) {
    slotReads++;
    const next = new Date(Date.parse(url.searchParams.get("from")) + 86400_000)
      .toISOString()
      .slice(0, 10);
    return respond({
      workMinutes: 60,
      days: [{ date: next, emptyReason: null, slots: [slot(next)] }],
    });
  }
  if (path.endsWith("/reservations")) {
    assert.ok(verified);
    keys.push(req.headers()["idempotency-key"]);
    booked = true;
    if (keys.length === 1) return route.abort();
    return respond(confirmed);
  }
  if (path.endsWith("/inquiries/10"))
    return respond({
      inquiryId: 10,
      version,
      status: ownerReview ? "OWNER_CHECK" : booked ? "BOOKED" : "SCHEDULING",
      handlerMode: ownerReview ? "OWNER" : "AI",
      phoneVerified: verified,
      visitInfo: visit,
      consents: [],
      reservation: booked ? { reservationId: 71 } : null,
    });
  issues.push(`unexpected: ${method} ${path}`);
  return respond(null, 404, "NOT_FOUND");
});
try {
  const open = () => page.goto(`${base}/customer/${link}`);
  await open();
  await page.getByRole("checkbox", { name: /개인정보 수집/ }).check();
  await click("동의하고 문의 시작");
  await seen("상담 시작 결과를 확인하지 못했어요");
  assert.equal(
    await page.getByRole("checkbox", { name: /개인정보 수집/ }).isChecked(),
    true,
  );
  await click("동의하고 문의 시작");
  await page
    .getByRole("textbox", { name: "메시지", exact: true })
    .fill("온수가 안 나와요");
  assert.match(startKeys[0], /^[0-9a-f-]{36}$/);
  assert.deepEqual(startKeys, [startKeys[0], startKeys[0]]);
  await click("메시지 보내기");
  await click("접수 내용·방문정보 확인");
  await click("방문정보 입력·수정");
  await page.getByLabel("이름", { exact: true }).fill("테스트");
  await page.getByLabel("휴대전화", { exact: true }).fill("01000000000");
  await page.getByLabel("방문 주소", { exact: true }).fill("테스트로 10");
  await click("주소 검색");
  await click("테스트 방문 주소");
  await click("접수 내용 확인");
  await seen("방문정보가 저장됐어요");
  ownerReview = true;
  await click("상담으로 돌아가기");
  await click("접수 내용·방문정보 확인");
  await page
    .getByRole("button", { name: "방문정보 입력·수정" })
    .and(page.locator("button:not(:disabled)"))
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "방문시간·예약 확인" }).count(),
    0,
  );
  await seen("사장님이 방문시간을 확인할 예정이에요.");
  assert.equal(slotReads, 0);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `${shots}/live-booking-owner-review-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 850 });
  await click("상담으로 돌아가기");
  ownerReview = false;
  await click("접수 내용·방문정보 확인");
  await click("방문시간·예약 확인");
  await page.getByRole("radio").first().check();
  await click("선택한 시간 확인");
  await click("인증번호 받기");
  await seen("문자를 보내지 못했어요");
  await click("인증번호 받기");
  await otp();
  await click("인증번호 확인");
  await seen("남은 입력 4회");
  await page.screenshot({
    path: `${shots}/live-booking-mobile.png`,
    fullPage: true,
  });
  await click("인증번호 확인");
  await click("이 시간으로 예약 확정");
  await click("예약 결과 다시 확인");
  await seen("방문 예약이 확정됐어요");
  await seen("문자·알림 발송은 다시 확인");
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  await open();
  await click("내 문의");
  await click("기존 예약 조회");
  await page.getByLabel("휴대전화번호").fill("010-0000-0000");
  await click("인증번호 받기");
  await otp();
  await click("인증번호 확인");
  await page.getByRole("button", { name: /· 확정/ }).click();
  await seen("테스트 방문 주소");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.screenshot({
    path: `${shots}/live-booking-desktop.png`,
    fullPage: true,
  });
  await open();
  await click("내 문의");
  await click("기존 상담 이어가기");
  await page.getByLabel("휴대전화번호").fill("01000000000");
  await click("인증번호 받기");
  await otp();
  await click("인증번호 확인");
  const outdated = page.getByRole("button", { name: /이전 목록의 상담/ });
  await outdated.click();
  await seen("이 내역은 더 이상 열 수 없어요");
  assert.equal(await outdated.count(), 0);
  await click("목록 다시 불러오기");
  const closed = page.getByRole("button", { name: /종료된 상담/ });
  await closed.waitFor();
  assert.equal(await closed.isDisabled(), true);
  await page.getByRole("button", { name: /온수가 안 나와요/ }).click();
  await seen("복구된 테스트 대화입니다");
  ownerReview = true;
  const readsBeforeLookup = slotReads;
  await click("접수 내용·방문정보 확인");
  await click("방문시간·예약 확인");
  await click("기존 예약 확인");
  await seen("방문 예약이 확정됐어요");
  await page.getByText("71", { exact: true }).waitFor();
  assert.equal(slotReads, readsBeforeLookup);
  assert.equal(keys.length, 2);
  assert.deepEqual(issues, []);
  console.log(
    "PASS: owner review hides new booking; existing reservation stays readable; booking, SMS errors, retry, lookup, and recovery.",
  );
} finally {
  await browser.close();
}
