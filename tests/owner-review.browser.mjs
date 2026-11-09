import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

// 로컬 개발 서버·별도 브라우저만 사용한다. 실제 문자·고객 API는 호출하지 않는다.
const base = process.env.OWNER_QA_BASE_URL || "http://127.0.0.1:3110";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const output = path.resolve(".next/owner-review-qa");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const errors = [];
  await context.route("**/*", (route) =>
    route.request().url().startsWith(base) ? route.continue() : route.abort(),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/owner/login`);
  await page.getByLabel("휴대전화번호", { exact: true }).fill("01011112222");
  await page
    .getByRole("button", { name: "인증번호 받기", exact: true })
    .click();
  await page.getByLabel("문자 인증번호", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page
    .getByRole("heading", { name: "한빛 보일러", exact: true })
    .waitFor();
  assert.match(await page.getByRole("note").innerText(), /예시/);
  await page.screenshot({
    path: path.join(output, "home.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "내 계정", exact: true }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).waitFor();

  await page.goto(`${base}/owner/inquiries/inq-106`);
  const photo = page
    .getByRole("link", {
      name: "보일러 사진 예시 원본 보기 (새 탭)",
      exact: true,
    })
    .first();
  await photo.waitFor();
  await page
    .getByAltText("보일러 사진 예시")
    .first()
    .evaluate((el) => el.decode());
  const popupWait = context.waitForEvent("page");
  await photo.focus();
  await photo.press("Enter");
  const popup = await popupWait;
  await popup.waitForLoadState();
  assert.equal(
    new URL(popup.url()).pathname,
    "/owner/examples/boiler-example.png",
  );
  await popup.close();
  await page.screenshot({
    path: path.join(output, "detail.png"),
    fullPage: true,
  });
  await page.goto(`${base}/owner/inquiries/inq-106/chat`);
  await page
    .getByRole("link", {
      name: "보일러 사진 예시 원본 보기 (새 탭)",
      exact: true,
    })
    .waitFor();
  await page.getByAltText("보일러 사진 예시").evaluate((el) => el.decode());
  await page.goto(`${base}/owner/inquiries/inq-106?mock=summaryfail`);
  await page
    .getByText(
      "접수 요약을 만들지 못했어요. 대화와 사진은 그대로 볼 수 있어요.",
      { exact: true },
    )
    .waitFor();
  await page
    .getByRole("region", { name: "고객 사진", exact: true })
    .getByRole("link")
    .waitFor();
  await page.screenshot({
    path: path.join(output, "summary-failure.png"),
    fullPage: true,
  });
  await page.goto(`${base}/owner/inquiries/inq-106?mock=photos`);
  await page
    .getByRole("link", {
      name: "추가 사진 예시 원본 보기 (새 탭)",
      exact: true,
    })
    .waitFor();

  await page.route("**/owner/examples/boiler-example.png", (route) =>
    route.abort(),
  );
  await page.goto(`${base}/owner/inquiries/inq-106/chat`);
  await page
    .getByRole("status")
    .filter({ hasText: "사진을 불러오지 못했어요." })
    .waitFor();
  await page
    .getByText("보일러가 켜지는데 온수가 안 나와요.", { exact: true })
    .waitFor();
  await page.unroute("**/owner/examples/boiler-example.png");
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await page.getByAltText("보일러 사진 예시").waitFor();
  await page.getByAltText("보일러 사진 예시").evaluate((el) => el.decode());
  await page.goto(`${base}/owner/link`);
  for (const name of ["링크 복사", "링크 공유", "고객 화면 미리보기"]) {
    assert.equal(
      await page.getByRole("button", { name, exact: true }).isDisabled(),
      true,
    );
  }
  assert.equal(await page.locator('a[href*="ilro.example"]').count(), 0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/owner/inquiries/inq-106?mock=photos`);
    await page
      .getByRole("link", {
        name: "추가 사진 예시 원본 보기 (새 탭)",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `overflow: ${width}`,
    );
  }
  await page.goto(`${base}/owner`);
  await page.getByRole("link", { name: "내 계정", exact: true }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page
    .getByRole("heading", { name: "사장님 로그인", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 예시 안내·계정/로그아웃·상세/대화 원본·요약 실패·여러 사진·사진 실패/재시도·예시 링크 차단·4개 화면 폭",
  );
} finally {
  await browser.close();
}
