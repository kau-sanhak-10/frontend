import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const base = process.env.OWNER_QA_BASE_URL || "http://127.0.0.1:3112";
const productionBuild = process.argv.includes("--production");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
});
const output = path.resolve(".next/owner-schedule-qa");
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Seoul",
  });
  const page = await context.newPage();
  // HTTP previews on another device do not expose randomUUID.
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", { value: undefined });
  });
  await page.clock.setFixedTime(new Date("2026-11-11T02:00:00Z"));
  await context.route("**/*", (route) =>
    route.request().url().startsWith(base) ? route.continue() : route.abort(),
  );
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/owner/schedule`);
  await page.getByRole("heading", { name: "로그인이 필요해요." }).waitFor();
  await page.getByRole("link", { name: "로그인하러 가기" }).click();
  await page.getByLabel("휴대전화번호", { exact: true }).fill("01011112222");
  await page.getByRole("button", { name: "인증번호 받기" }).click();
  await page.getByLabel("문자 인증번호").fill("123456");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("link", { name: "일정", exact: true }).click();
  const daily = page.getByRole("region", { name: "날짜별 일정" });
  await daily.waitFor();
  const weekdays = daily.getByRole("button", { name: /월 \d+일/ });
  assert.equal(
    await weekdays.first().getAttribute("aria-label"),
    "11월 9일 월요일",
  );
  assert.equal(
    await daily
      .getByRole("button", { name: "11월 11일 수요일" })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByText(/이전 현장에서 약 25분/).waitFor();
  const capture = (file) =>
    page.screenshot({
      path: path.join(output, file),
      fullPage: true,
      style: "nextjs-portal { display: none !important; }",
    });
  await capture("mobile.png");
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    if (width === 1280) {
      await capture("desktop.png");
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /10:00.*작업 완료/ }).press("Enter");
  await page.waitForFunction(
    () => document.activeElement?.textContent === "방문 정보",
  );
  await page.getByRole("button", { name: "완료 기록 정정" }).click();
  await page.getByRole("button", { name: "정정 사유 저장" }).click();
  await page
    .getByRole("alert")
    .getByText(/사유를 입력/)
    .waitFor();
  await page.getByLabel("사유", { exact: true }).fill("작업 기록 보완");
  await page.getByRole("button", { name: "정정 사유 저장" }).click();
  await page
    .getByRole("status")
    .getByText(/정정 사유를 기록/)
    .waitFor();
  await page.waitForFunction(
    () => document.activeElement?.textContent === "일정",
  );

  await page.getByRole("button", { name: /16:00.*변경 요청/ }).click();
  await page.getByRole("button", { name: "변경 시간 제안" }).click();
  await page.getByLabel("날짜").fill("2026-11-12");
  await page.getByLabel("시작 시간").fill("14:00");
  await page.getByLabel("작업시간(분)").fill("120");
  await page.getByLabel("사유", { exact: true }).fill("고객 요청");
  await page.getByRole("button", { name: "변경 제안 미리보기" }).click();
  await page
    .getByRole("status")
    .getByText(/기존 예약은 그대로/)
    .waitFor();
  const proposed = page.getByRole("button", {
    name: /16:00.*17:00.*변경 제안.*예약 유지/,
  });
  await proposed.click();
  const visit = page.getByRole("region", { name: "방문 정보" });
  await visit
    .getByText(/제안:.*14:00–16:00.*120분.*고객 요청/)
    .waitFor({ timeout: 5_000 });
  await capture("change-preview.png");
  await page.getByRole("button", { name: "일정으로 돌아가기" }).click();

  // Opt in when a second mock phone is mapped to biz-teunteun in the QA build.
  const alternateMockPhone = process.env.OWNER_QA_ALT_MOCK_PHONE;
  if (alternateMockPhone) {
    const otherTab = await context.newPage();
    await otherTab.goto(`${base}/manifest.webmanifest`);
    const switchMockSession = (loginPhone) =>
      otherTab.evaluate((number) => {
        const key = "ilro.owner.mockSession";
        const session = JSON.parse(localStorage.getItem(key));
        localStorage.setItem(
          key,
          JSON.stringify({ ...session, loginPhone: number }),
        );
      }, loginPhone);
    await switchMockSession(alternateMockPhone);
    await page
      .getByRole("heading", { name: "잡힌 일정이 없어요." })
      .waitFor({ timeout: 5_000 });
    await switchMockSession("01011112222");
    await page
      .getByRole("button", { name: /16:00.*17:00.*변경 요청/ })
      .waitFor({ timeout: 5_000 });
    assert.equal(await proposed.count(), 0);
    await otherTab.close();
  }

  await page.getByRole("button", { name: "일정 추가" }).click();
  await page.getByRole("button", { name: "시간 비우기" }).click();
  await page.getByLabel("시작 시간").fill("14:00");
  await page.getByLabel("종료 시간").fill("13:00");
  await page.getByRole("button", { name: "차단 시간 저장" }).click();
  await page
    .getByRole("alert")
    .getByText(/종료 시간은 시작 시간보다/)
    .waitFor();
  await page.getByLabel("종료 시간").fill("15:00");
  await page.getByRole("button", { name: "차단 시간 저장" }).click();
  await page
    .getByRole("alert")
    .getByText(/기존 일정/)
    .waitFor();
  await page.getByRole("button", { name: "일정으로 돌아가기" }).click();

  await daily.getByRole("button", { name: "11월 12일 목요일" }).click();
  await page.getByRole("heading", { name: "잡힌 일정이 없어요." }).waitFor();
  await page.getByRole("button", { name: "일정 추가" }).click();
  await page.getByLabel("고객 이름").fill("테스트");
  await page.getByLabel("연락처").fill("01000000000");
  await page.getByLabel("방문 주소").fill("테스트 주소");
  await page.getByLabel("시작 시간").fill("19:00");
  assert.equal(await page.getByLabel("작업시간(분)").inputValue(), "60");
  const dateField = page.getByLabel("날짜");
  await dateField.fill("2026-11-10");
  await page.getByRole("button", { name: "예약 저장 미리보기" }).click();
  await page
    .getByRole("alert")
    .getByText(/이미 지난 시간에는 방문을 잡을 수 없어요/)
    .waitFor();
  await dateField.fill("2026-11-12");
  await page.getByRole("button", { name: "예약 저장 미리보기" }).click();
  await page
    .getByRole("alert")
    .getByText(/영업시간/)
    .waitFor();
  await page.getByLabel("영업시간 밖인 것을 확인했어요.").check();
  await page.getByRole("button", { name: "예약 저장 미리보기" }).click();
  await page
    .getByRole("status")
    .getByText(/실제 예약은 생성되지 않았어요/)
    .waitFor();
  await page.getByRole("button", { name: /19:00.*테스트/ }).click();
  await page.getByRole("button", { name: "예약 취소", exact: true }).click();
  await page.getByRole("button", { name: "예약 취소 미리보기" }).click();
  await page
    .getByRole("alert")
    .getByText(/사유를 입력/)
    .waitFor();
  await page.getByLabel("사유", { exact: true }).fill("고객 요청");
  await page.getByRole("button", { name: "예약 취소 미리보기" }).click();
  await page
    .getByRole("status")
    .getByText(/알림은 보내지 않았어요/)
    .waitFor();
  await page.getByRole("button", { name: "일정 추가" }).click();
  await page.getByRole("button", { name: "시간 비우기" }).click();
  await page.getByLabel("시작 시간").fill("19:00");
  await page.getByLabel("종료 시간").fill("20:00");
  await page.getByRole("button", { name: "차단 시간 저장" }).click();
  await page
    .getByRole("status")
    .getByText(/차단 시간을 추가/)
    .waitFor();
  for (const start of ["14:00", "16:00"]) {
    await page.getByRole("button", { name: "일정 추가" }).click();
    await page.getByLabel("고객 이름").fill("새 방문");
    await page.getByLabel("연락처").fill("01000000000");
    await page.getByLabel("방문 주소").fill("테스트 주소");
    await page.getByLabel("시작 시간").fill(start);
    await page.getByRole("button", { name: "예약 저장 미리보기" }).click();
    const outcome = page.getByText(
      /실제 예약은 생성되지 않았어요|앞뒤 일정의 이동시간/,
    );
    await outcome.waitFor();
    assert.match(
      await outcome.innerText(),
      start === "14:00"
        ? /실제 예약은 생성되지 않았어요/
        : /앞뒤 일정의 이동시간/,
    );
  }
  await page.getByRole("button", { name: "일정으로 돌아가기" }).click();
  await page.getByRole("button", { name: /19:00.*개인 일정/ }).click();
  await page.getByRole("button", { name: "차단 시간 해제" }).click();
  await page
    .getByRole("status")
    .getByText(/차단 시간을 해제/)
    .waitFor();

  await page.goto(`${base}/owner/schedule?mock=fail`);
  const loadFailure = page.getByRole("heading", {
    name: "일정을 불러오지 못했어요.",
  });
  if (productionBuild) {
    await daily.waitFor();
    assert.equal(await loadFailure.count(), 0);
  } else await loadFailure.waitFor();

  // A live session must never mount the local-only schedule or allow mock writes.
  await page.evaluate(() => {
    window.sessionStorage.setItem(
      "ilro.owner.session",
      JSON.stringify({
        accessToken: "own_schedule_test_fixture",
        expiresAt: Date.now() + 60_000,
        name: "일정 테스트",
        loginPhone: "01000000000",
        businessName: "테스트 업체",
        businessPhone: "01000000000",
      }),
    );
  });
  await page.goto(`${base}/owner/schedule`);
  await page
    .getByRole("heading", { name: "일정 연결을 준비하고 있어요." })
    .waitFor();
  assert.equal(
    await page.getByRole("region", { name: "날짜별 일정" }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "일정 추가" }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS: 일정 권한, 실계정에서 목업 차단, 지난 시간·겹침 차단, 빈 일정, ${productionBuild ? "운영에서 개발용 오류 설정 무시" : "개발 조회 실패"}, 영업시간 밖 확인, 기존 예약·제안 소요시간 유지, 취소·정정 사유, 차단·해제, 320·390·1280px${alternateMockPhone ? ", 업체 간 미리보기 분리" : ""}`,
  );
} finally {
  await browser.close();
}
