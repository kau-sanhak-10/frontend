import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const base = process.env.PREVIEW_BASE_URL ?? "http://127.0.0.1:35115";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
});
const errors = [];
const shots = ".impeccable/review";
await mkdir(shots, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => errors.push(e.message));
  // Preview must never call the booking API, send SMS, or use authenticated business data.
  page.on("request", (request) => {
    assert.equal(new URL(request.url()).origin, base);
  });
  async function open(scene = "normal") {
    await page.goto(`${base}/customer/booking-preview?scene=${scene}`);
  }
  async function select() {
    await page.getByRole("radio").first().check();
    await page
      .getByRole("button", { name: "선택한 시간 확인", exact: true })
      .click();
    await page.getByRole("heading", { name: "예약 최종 확인" }).waitFor();
    assert.equal(
      await page.getByText("방문 예약이 확정됐어요", { exact: true }).count(),
      0,
    );
  }
  async function finish() {
    await page
      .getByRole("button", { name: "이 시간으로 예약 확정", exact: true })
      .click();
  }
  await open();
  assert.equal(
    await page
      .getByRole("button", { name: "선택한 시간 확인", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("radio").first().waitFor();
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `${shots}/booking-${width}.png`,
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await select();
  await page.screenshot({
    path: `${shots}/booking-review.png`,
    fullPage: true,
  });
  await finish();
  await page.getByRole("heading", { name: "방문 예약이 확정됐어요" }).waitFor();
  await page.getByText(/확정 요청 1회 · 요청 식별자 1개/).waitFor();
  await open("unverified");
  await select();
  assert.equal(
    await page
      .getByRole("button", { name: "이 시간으로 예약 확정", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "휴대전화 인증", exact: true })
    .click();
  await finish();
  await page.getByRole("heading", { name: "방문 예약이 확정됐어요" }).waitFor();
  await open("network");
  await select();
  await finish();
  await page
    .getByRole("button", { name: "예약 결과 다시 확인", exact: true })
    .click();
  await page.getByRole("heading", { name: "방문 예약이 확정됐어요" }).waitFor();
  await page.getByText(/확정 요청 2회 · 요청 식별자 1개/).waitFor();
  await open("conflict");
  await select();
  await finish();
  await page.getByText(/선택한 시간에 예약할 수 없어요/).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "선택한 시간 확인", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "가능시간 다시 불러오기", exact: true })
    .click();
  await select();
  await finish();
  await page.getByRole("heading", { name: "방문 예약이 확정됐어요" }).waitFor();
  for (const scene of ["empty", "owner", "safety", "expired"]) {
    await open(scene);
    await page.getByRole("heading", { name: "방문시간 선택" }).waitFor();
    await page
      .getByText(
        scene === "empty"
          ? "이날 예약이 마감됐어요."
          : scene === "owner"
            ? "이 업체는 사장님이 방문시간을 확인해 드려요."
            : scene === "safety"
              ? "안전 확인이 필요해 사장님 확인 후 안내해 드려요."
              : "상담 접근 권한을 확인해 주세요. 입력한 내용은 남겨 뒀어요.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.getByRole("radio").count(), 0);
  }
  await open("load-error");
  await page
    .getByRole("button", { name: "가능시간 다시 불러오기", exact: true })
    .click();
  await page.getByRole("radio").first().waitFor();
  await open("notification");
  await select();
  await finish();
  await page.getByRole("heading", { name: "방문 예약이 확정됐어요" }).waitFor();
  await page.getByText(/예약은 확정됐어요. 안내 문자/).waitFor();
  await page.screenshot({
    path: `${shots}/booking-notification.png`,
    fullPage: true,
  });
  await open("existing");
  await select();
  await finish();
  await page
    .getByRole("button", { name: "기존 예약 확인", exact: true })
    .click();
  await page.getByRole("heading", { name: "방문 예약이 확정됐어요" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: booking selection/review/auth gate/confirmation, same-key retry, conflict, existing, notification, empty/blocked/errors, 4 widths; preview has no external requests",
  );
} finally {
  await browser.close();
}
