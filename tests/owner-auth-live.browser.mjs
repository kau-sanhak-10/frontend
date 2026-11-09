import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const base = "http://127.0.0.1:35115";
const api = "http://127.0.0.1:35116";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const owner = {
    ownerId: 42,
    businessName: "테스트 보일러",
    approvalStatus: "APPROVED",
    status: "ACTIVE",
  };
  const expiresAt = new Date(Date.now() + 600_000).toISOString();
  const createdAt = new Date().toISOString();
  const address = "한국항공대학교";
  const symptom = "시연 테스트 — 보일러 온수가 안 나와요";
  const inquiry = {
    inquiryId: 12,
    status: "COLLECTING",
    handlerMode: "AI",
    safetyFlag: false,
    ownerCheckReason: null,
    createdAt,
  };
  let logoutAttempts = 0;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const { origin, pathname } = new URL(request.url());
    if (origin === base) return route.continue();
    if (origin !== api) return route.abort();
    const headers = {
      "access-control-allow-origin": base,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const reply = (result, status = 200, code = "OK") =>
      route.fulfill({
        headers,
        status,
        json: { success: status < 400, code, message: "", result },
      });
    switch (`${request.method()} ${pathname}`) {
      case "POST /api/v1/auth/verifications":
        assert.deepEqual(request.postDataJSON(), {
          purpose: "OWNER_LOGIN",
          phone: "01000000000",
        });
        return reply(
          {
            verificationId: 101,
            expiresAt,
            resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
          },
          201,
        );
      case "POST /api/v1/auth/verifications/101/confirm":
        if (request.postDataJSON().code === "111111")
          return reply({ attemptsLeft: 4 }, 400, "VERIFICATION_CODE_MISMATCH");
        assert.deepEqual(request.postDataJSON(), { code: "123456" });
        return reply({
          purpose: "OWNER_LOGIN",
          accessToken: "own_test",
          expiresAt,
          owner,
        });
      case "GET /api/v1/owner/me":
        assert.equal(request.headers().authorization, "Bearer own_test");
        return reply({
          ...owner,
          ownerName: "테스트",
          phone: "01000000000",
          autoBookingEnabled: false,
          intakePaused: false,
        });
      case "GET /api/v1/owner/inquiries":
        assert.equal(request.headers().authorization, "Bearer own_test");
        return reply({
          content: [{ ...inquiry, symptom, lastMessage: { preview: symptom } }],
          isLast: true,
        });
      case "GET /api/v1/owner/home":
        assert.equal(request.headers().authorization, "Bearer own_test");
        return reply({ todayVisits: [] });
      case "GET /api/v1/owner/inquiries/12":
        assert.equal(request.headers().authorization, "Bearer own_test");
        return reply({
          ...inquiry,
          version: 1,
          visitInfo: { address, name: null, workCategory: null },
          fields: [],
          photos: [],
          reservation: null,
        });
      case "GET /api/v1/owner/inquiries/12/messages":
        assert.equal(request.headers().authorization, "Bearer own_test");
        return reply({
          messages: [
            {
              messageId: 1,
              sender: "CUSTOMER",
              content: symptom,
              photoIds: [],
              createdAt,
            },
          ],
          hasMore: false,
        });
      case "POST /api/v1/auth/logout":
        assert.equal(request.headers().authorization, "Bearer own_test");
        return ++logoutAttempts === 1
          ? reply(null, 503, "UNAVAILABLE")
          : reply(null);
      default:
        throw new Error(
          `Unexpected API request: ${request.method()} ${pathname}`,
        );
    }
  });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/owner/login`);
  await page.getByLabel("휴대전화번호", { exact: true }).fill("01000000000");
  await page.getByRole("button", { name: "인증번호 받기" }).click();
  const code = page.getByLabel("문자 인증번호", { exact: true });
  const login = page.getByRole("button", { name: "로그인", exact: true });
  await code.fill("111111");
  await login.click();
  await page.getByText(/남은 시도 4회/).waitFor();
  await code.fill("123456");
  await login.click();
  await page.getByRole("heading", { name: owner.businessName }).waitFor();
  assert.equal(await page.getByRole("note").count(), 0);
  await page.getByRole("link", { name: "접수", exact: true }).click();
  await page.getByRole("link", { name: /시연 테스트/ }).click();
  await page.getByRole("heading", { name: "접수 상세" }).waitFor();
  await page.getByText(address, { exact: true }).waitFor();
  await page.getByText(`“${symptom}”`, { exact: true }).waitFor();
  await page.goto(`${base}/owner`);
  await page.reload();
  await page.getByRole("link", { name: "내 계정" }).click();
  await page.getByText("로그인 번호 010-••••-0000").waitFor();
  const logout = page.getByRole("button", { name: "로그아웃" });
  await logout.click();
  await page.getByText(/로그아웃하지 못했어요/).waitFor();
  await logout.click();
  await page.getByText("로그아웃했어요.").waitFor();
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("ilro.owner.session")),
    null,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: owner verification, inquiry list and detail, session reload, and logout",
  );
} finally {
  await browser.close();
}
