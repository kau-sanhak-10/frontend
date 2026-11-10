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
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const owner = {
    ownerId: 42,
    businessName: "테스트 보일러",
    approvalStatus: "APPROVED",
    status: "ACTIVE",
  };
  const expiresAt = new Date(Date.now() + 600_000).toISOString();
  const createdAt = new Date().toISOString();
  const address = "한국항공대학교";
  const symptom = "시연 테스트 — 경동나비엔 보일러인데 온수가 안 나와요";
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
          fields: [
            {
              fieldKey: "manufacturer",
              required: false,
              value: "귀뚜라미",
              source: "PHOTO",
              status: "UNCONFIRMED",
              unconfirmedReason: "CONFLICT",
              photoId: 7,
              messageId: null,
              updatedAt: createdAt,
              history: [],
            },
          ],
          aiSummary: {
            summary: null,
            decidedAt: createdAt,
            conflicts: [
              {
                fieldKey: "manufacturer",
                candidates: [
                  {
                    value: "경동나비엔",
                    source: "CUSTOMER",
                    evidence: { messageId: 1 },
                  },
                  {
                    value: "귀뚜라미",
                    source: "PHOTO",
                    evidence: { photoId: 7 },
                  },
                ],
              },
            ],
          },
          photos: [{ photoId: 7, messageId: null }],
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
      case "GET /api/v1/owner/inquiries/12/photos/7/url":
        assert.equal(request.headers().authorization, "Bearer own_test");
        return reply({
          photoId: 7,
          url: `${base}/owner/examples/boiler-example.png`,
          expiresAt,
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
  await page.getByText("서로 다른 값이 있어 확인이 필요해요.").waitFor();
  await page.getByText("서로 다른 값 보기", { exact: true }).click();
  await page.getByText("고객 설명: 경동나비엔", { exact: true }).waitFor();
  await page.getByText("사진: 귀뚜라미", { exact: true }).waitFor();
  await page.getByText(`고객 메시지: “${symptom}”`, { exact: true }).waitFor();
  const evidence = page
    .locator("details")
    .filter({ hasText: "서로 다른 값 보기" });
  await evidence
    .getByRole("link", { name: "고객 사진 1 원본 보기 (새 탭)" })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
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
    "PASS: owner verification, inquiry details and conflict evidence, session reload, and logout",
  );
} finally {
  await browser.close();
}
