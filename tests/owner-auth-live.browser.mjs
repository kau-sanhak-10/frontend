import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const base = "http://127.0.0.1:35115";
const api = "http://127.0.0.1:35116";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
});
try {
  const context = await browser.newContext();
  const owner = {
    ownerId: 42,
    businessName: "테스트 보일러",
    approvalStatus: "APPROVED",
    status: "ACTIVE",
  };
  const expiresAt = new Date(Date.now() + 600_000).toISOString();
  let logoutAttempts = 0;
  let inquiryReads = 0;
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
      case "GET /api/v1/owner/home":
        assert.equal(request.headers().authorization, "Bearer own_test");
        return reply({ todayVisits: [] });
      case "GET /api/v1/owner/inquiries":
        assert.equal(request.headers().authorization, "Bearer own_test");
        inquiryReads++;
        return reply({
          isLast: true,
          content: [
            {
              inquiryId: 1402,
              status: "COLLECTING",
              handlerMode: "AI",
              safetyFlag: false,
              customerName: "테스트고객",
              customerPhone: "01000000001",
              address: "고양시 덕양구",
              workCategory: "REPAIR",
              symptom: "시연 문의: 온수가 나오지 않아요",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
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
  await page.locator('a[href="/owner/inquiries/1402"]').waitFor();
  assert.ok(
    inquiryReads > 0,
    "실제 로그인에서 인증된 문의 조회가 실행되어야 합니다",
  );
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
    "PASS: owner verification, account lookup, session reload, and logout",
  );
} finally {
  await browser.close();
}
