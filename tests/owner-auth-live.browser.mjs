import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";

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
  let businessWrites = 0;
  let business = {
    businessName: owner.businessName,
    contactPhone: null,
    address: null,
    lat: null,
    lng: null,
    customerNotice: null,
    serviceDescription: null,
  };
  let intakePaused = false;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const { origin, pathname } = new URL(request.url());
    if (origin === base) return route.continue();
    if (origin !== api) return route.abort();
    const headers = {
      "access-control-allow-origin": base,
      "access-control-allow-methods": "GET, POST, PUT, PATCH, OPTIONS",
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
          intakePaused,
        });
      case "GET /api/v1/owner/business":
        assert.equal(request.headers().authorization, "Bearer own_test");
        return reply(business);
      case "GET /api/v1/owner/booking-settings":
        assert.equal(request.headers().authorization, "Bearer own_test");
        return reply({
          businessHours: Array.from({ length: 7 }, (_, i) => ({
            dayOfWeek: i + 1,
            isClosed: true,
            openTime: null,
            closeTime: null,
          })),
          lunchStart: null,
          lunchEnd: null,
          maxDailyVisits: null,
          bufferMinutes: 0,
          travelMode: "CAR",
          autoBookingEnabled: false,
        });
      case "GET /api/v1/owner/work-types":
        assert.equal(request.headers().authorization, "Bearer own_test");
        return reply({ workTypes: [] });
      case "GET /api/v1/owner/service-areas":
        assert.equal(request.headers().authorization, "Bearer own_test");
        return reply({ serviceAreas: [] });
      case "PUT /api/v1/owner/business":
        assert.equal(request.headers().authorization, "Bearer own_test");
        assert.deepEqual(request.postDataJSON(), {
          ...business,
          businessName: "새 업체명",
        });
        if (++businessWrites === 1) return reply(null, 503, "UNAVAILABLE");
        business = request.postDataJSON();
        return reply(business);
      case "PATCH /api/v1/owner/intake":
        assert.equal(request.headers().authorization, "Bearer own_test");
        assert.deepEqual(request.postDataJSON(), { intakePaused: true });
        intakePaused = true;
        return reply({ intakePaused });
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
  await page.getByRole("link", { name: "업체 설정" }).click();
  await page.getByRole("button", { name: /업체정보/ }).click();
  const businessName = page.getByLabel("업체 이름", { exact: true });
  const saveSettings = page.getByRole("button", { name: "변경사항 저장" });
  await businessName.fill("새 업체명");
  await saveSettings.click();
  await page
    .getByRole("alert")
    .filter({ hasText: "입력은 남겨 뒀어요" })
    .waitFor();
  assert.equal(await businessName.inputValue(), "새 업체명");
  await saveSettings.click();
  await page.getByText("이 항목을 저장했어요.", { exact: true }).waitFor();
  assert.equal(businessWrites, 2);
  await mkdir(".impeccable/review", { recursive: true });
  await page.screenshot({
    path: ".impeccable/review/settings-edit.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("heading", { name: "새 업체명" }).waitFor();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `.impeccable/review/settings-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /접수·예약/ }).click();
  await page.getByRole("checkbox", { name: "신규 접수 잠시 중지" }).check();
  assert.equal(
    await page.getByRole("checkbox", { name: "자동 예약 켜기" }).isDisabled(),
    true,
  );
  await saveSettings.click();
  await page.getByText("이 항목을 저장했어요.", { exact: true }).waitFor();
  assert.equal(intakePaused, true);
  await page.getByRole("button", { name: "설정 목록으로" }).click();
  await page.getByRole("link", { name: "내 계정으로" }).click();
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
    "PASS: owner verification, inquiry details, settings save/retry/reload, intake control and logout",
  );
} finally {
  await browser.close();
}
