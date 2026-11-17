import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// 독립 로컬 브라우저·모의 응답만 사용한다. 실제 로그인·고객 API에는 접속하지 않는다.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const base = "http://127.0.0.1:35321";
const api = "http://127.0.0.1:35116";
const output = path.resolve(".next/owner-photo-refresh-qa");
await mkdir(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "35321",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
server.stdout.on("data", (data) => (logs += data));
server.stderr.on("data", (data) => (logs += data));
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      ready = (await fetch(base)).ok;
    } catch {
      /* 준비 중 */
    }
    if (ready) break;
    await delay(200);
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 600_000).toISOString();
  const owner = {
    ownerId: 42,
    businessName: "사진 갱신 테스트",
    approvalStatus: "APPROVED",
    status: "ACTIVE",
  };
  await context.addInitScript(
    ({ expiresAt }) => {
      sessionStorage.setItem(
        "ilro.owner.session",
        JSON.stringify({
          name: "시험",
          loginPhone: "01000000000",
          businessName: "사진 갱신 테스트",
          businessPhone: "01000000000",
          accessToken: "own_photo_refresh_test",
          expiresAt: Date.parse(expiresAt),
        }),
      );
    },
    { expiresAt },
  );
  let hasPhoto = false;
  let failRead = false;
  let detailReads = 0;
  let photoReads = 0;
  let imageReads = 0;
  let reportReadFailure;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const { origin, pathname } = new URL(request.url());
    if (origin === base) {
      if (pathname === "/owner/examples/boiler-example.png") imageReads++;
      return route.continue();
    }
    assert.equal(origin, api, "No external requests");
    const headers = {
      "access-control-allow-origin": base,
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    assert.equal(
      request.headers().authorization,
      "Bearer own_photo_refresh_test",
    );
    const reply = (result, status = 200) =>
      route.fulfill({
        status,
        headers,
        json: {
          success: status === 200,
          code: status === 200 ? "OK" : "UNAVAILABLE",
          message: "",
          result,
        },
      });
    if (pathname === "/api/v1/owner/me")
      return reply({
        ...owner,
        ownerName: "시험",
        phone: "01000000000",
        autoBookingEnabled: false,
        intakePaused: false,
      });
    if (pathname === "/api/v1/owner/inquiries/14") {
      detailReads++;
      if (failRead) {
        failRead = false;
        await reply(null, 503);
        reportReadFailure?.();
        return;
      }
      const field = {
        required: false,
        value: null,
        source: null,
        status: "UNCONFIRMED",
        unconfirmedReason: "NOT_PROVIDED",
        photoId: null,
        messageId: null,
        updatedAt: null,
        history: [],
      };
      return reply({
        inquiryId: 14,
        status: "COLLECTING",
        handlerMode: "AI",
        safetyFlag: false,
        ownerCheckReason: null,
        version: 1,
        visitInfo: null,
        reservation: null,
        aiSummary: null,
        createdAt,
        fields: [
          { ...field, fieldKey: "manufacturer" },
          {
            ...field,
            fieldKey: "symptom",
            required: true,
            value: "온수가 안 나와요",
            source: "CUSTOMER",
            status: "CONFIRMED",
            unconfirmedReason: null,
            updatedAt: createdAt,
          },
        ],
        photos: hasPhoto ? [{ photoId: 9, messageId: 2 }] : [],
      });
    }
    if (pathname === "/api/v1/owner/inquiries/14/messages")
      return reply({
        messages: [
          {
            messageId: 2,
            sender: "CUSTOMER",
            content: "온수가 안 나와요",
            photoIds: hasPhoto ? [9] : [],
            createdAt,
          },
        ],
        hasMore: false,
      });
    if (pathname === "/api/v1/owner/inquiries/14/photos/9/url") {
      photoReads++;
      return reply({
        photoId: 9,
        url: `${base}/owner/examples/boiler-example.png?signature=${photoReads}`,
        expiresAt,
      });
    }
    throw new Error(`Unexpected API: ${pathname}`);
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/owner/inquiries/14`);
  await page.getByText("사진 없음", { exact: true }).waitFor();
  hasPhoto = true;
  await page
    .getByAltText("고객 사진 1", { exact: true })
    .waitFor({ timeout: 12_000 });
  await page
    .getByAltText("고객 사진 1", { exact: true })
    .evaluate((img) => img.decode());
  assert.ok(photoReads > 0);
  const firstImageReads = imageReads;
  assert.equal(await page.getByText("사진 없음", { exact: true }).count(), 0);
  const failure = new Promise((resolve) => (reportReadFailure = resolve));
  failRead = true;
  await Promise.race([
    failure,
    delay(12_000).then(() => {
      throw new Error("No background refresh after failure");
    }),
  ]);
  assert.equal(
    await page.getByAltText("고객 사진 1", { exact: true }).count(),
    1,
  );
  await page.evaluate(() =>
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    }),
  );
  const readsWhileVisible = detailReads;
  await delay(5500);
  assert.equal(detailReads, readsWhileVisible, "Hidden page must not poll");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await delay(1000);
  assert.equal(imageReads, firstImageReads, "Valid photo URL must be reused");
  await page.screenshot({
    path: path.join(output, "detail-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: path.join(output, "detail-desktop.png"),
    fullPage: true,
  });
  hasPhoto = false;
  await page.getByRole("link", { name: "대화", exact: true }).click();
  await page
    .getByRole("heading", { name: "고객과 대화", exact: true })
    .waitFor();
  await page.getByText("온수가 안 나와요", { exact: true }).waitFor();
  assert.equal(
    await page.getByAltText("고객 사진 1", { exact: true }).count(),
    0,
  );
  hasPhoto = true;
  await page
    .getByAltText("고객 사진 1", { exact: true })
    .waitFor({ timeout: 12_000 });
  await page.goto(base);
  const readsBeforeUnmountWait = detailReads;
  await delay(5500);
  assert.equal(
    detailReads,
    readsBeforeUnmountWait,
    "Unmounted page must not poll",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: later photo appears in detail/chat without reload; transient failure preserves photo; hidden/unmounted polling stops",
  );
} finally {
  await browser?.close();
  server.kill();
}
