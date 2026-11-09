import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
  getCustomerInquiryVersion,
  isIntakeLinkToken,
  saveCustomerVisitInfo,
} from "../src/lib/customer-api.ts";
import { demoVisitLocations } from "../src/lib/customer-visit-demo.ts";

// Isolated local BE-05 + PostgreSQL only. Use a synthetic test business link.
const base = "http://127.0.0.1:35111";
const api = "http://127.0.0.1:35112";
process.env.NEXT_PUBLIC_API_BASE_URL = api;
const link = process.env.ILRO_TEST_INTAKE_LINK;
const regularLink = process.env.ILRO_TEST_REGULAR_LINK;
assert.ok(isIntakeLinkToken(link ?? "", true));
assert.match(regularLink ?? "", /^[A-Za-z0-9_-]{43}$/);
assert.notEqual(link, regularLink);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "35111",
  ],
  {
    env: {
      ...process.env,
      CUSTOMER_LIVE_ENABLED: "true",
      CUSTOMER_VISIT_DEMO_LINK_TOKEN: link,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
let logs = "";
server.stdout.on("data", (chunk) => (logs += chunk));
server.stderr.on("data", (chunk) => (logs += chunk));
let browser;

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      ready = (await fetch(base)).ok;
    } catch {}
    if (ready) break;
    await setTimeout(200);
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const createPath = `/api/v1/public/intake/${link}/inquiries`;
  let creates = 0;
  page.on("request", (request) => {
    if (request.url() === api + createPath && request.method() === "POST")
      creates++;
  });
  const sends = [];
  let pollResult = "real";
  await page.route(
    `${api}/api/v1/customer/inquiries/*/messages`,
    async (route) => {
      const request = route.request();
      if (request.method() === "GET" && pollResult === "failure") {
        return route.fulfill({
          status: 503,
          headers: { "Access-Control-Allow-Origin": base },
          json: {
            success: false,
            code: "TEMPORARY_FAILURE",
            message: "테스트용 조회 실패",
            result: null,
          },
        });
      }
      if (request.method() === "GET" && pollResult === "reply") {
        pollResult = "real";
        return route.fulfill({
          headers: { "Access-Control-Allow-Origin": base },
          json: {
            success: true,
            code: "OK",
            message: "OK",
            result: {
              messages: [
                {
                  messageId: sends[1].id + 1,
                  sender: "AI",
                  content: "답변 수신 테스트",
                  deliveryStatus: "SENT",
                },
              ],
              hasMore: false,
            },
          },
        });
      }
      if (request.method() !== "POST") return route.continue();
      const response = await route.fetch();
      const body = await response.json();
      sends.push({
        input: request.postDataJSON(),
        status: response.status(),
        id: body.result?.messageId,
      });
      // First POST reaches PostgreSQL; only its response is lost in the browser.
      if (sends.length === 1) return route.abort("connectionreset");
      return route.fulfill({ response });
    },
  );

  await page.goto(`${base}/customer/${link}`);
  await page.getByText(/실제 이름, 연락처, 주소를 입력하지/).waitFor();
  const start = page.getByRole("button", { name: "동의하고 문의 시작" });
  await start.click();
  await page
    .getByRole("alert")
    .getByText("개인정보 수집·이용에 동의해 주세요.")
    .waitFor();
  assert.equal(creates, 0);
  await page.getByRole("checkbox", { name: /개인정보 수집/ }).check();
  const [created] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === api + createPath &&
        response.request().method() === "POST",
    ),
    start.click(),
  ]);
  assert.equal(created.status(), 201);
  const { inquiryId, inquiryToken } = (await created.json()).result;
  assert.equal(creates, 1);

  const text = "온수가 안 나와요";
  const input = page.getByRole("textbox", { name: "메시지", exact: true });
  const send = page.getByRole("button", { name: "메시지 보내기" });
  await input.fill(text);
  await send.click();
  await page.getByRole("alert").waitFor();
  assert.equal(await input.inputValue(), text);
  await send.click();
  await page.waitForFunction(
    () => document.querySelector("textarea")?.value === "",
  );
  assert.deepEqual(
    sends.map((entry) => entry.status),
    [201, 200],
  );
  assert.ok(sends[0].id);
  assert.equal(sends[0].id, sends[1].id);
  assert.ok(sends[0].input.clientMsgId);
  assert.deepEqual(sends[0].input, sends[1].input);

  const conversation = await fetch(
    `${api}/api/v1/customer/inquiries/${inquiryId}/messages`,
    { headers: { Authorization: `Bearer ${inquiryToken}` } },
  );
  assert.equal(conversation.status, 200);
  const { messages } = (await conversation.json()).result;
  const stored = messages.filter((message) => message.sender === "CUSTOMER");
  assert.deepEqual(
    stored.map(({ messageId, content }) => [messageId, content]),
    [[sends[0].id, text]],
  );
  const log = page.getByRole("log");
  await log.getByText(text, { exact: true }).waitFor();
  assert.equal(await log.getByText(text, { exact: true }).count(), 1);
  const waiting = page.getByRole("status").getByText(/답변을 기다리고/);
  await waiting.waitFor();
  pollResult = "failure";
  await page
    .getByRole("status")
    .getByText(/불러오지 못했어요/)
    .waitFor();
  pollResult = "reply";
  await log.getByText("답변 수신 테스트", { exact: true }).waitFor();
  assert.equal(await waiting.count(), 0);

  const { origin, destination } = demoVisitLocations;
  const visit = {
    name: "일로 시연 고객",
    phone: "01000000001",
    address: destination.address,
    addressDetail: "",
    accessNote: "",
    workTypeId: "",
  };
  const version = await getCustomerInquiryVersion(inquiryId, inquiryToken);
  await page.getByRole("button", { name: "시연용 방문정보 입력" }).click();
  await page.getByRole("heading", { name: "시연용 방문정보" }).waitFor();
  await page.getByText(origin.address, { exact: false }).waitFor();
  await page.getByText(destination.address, { exact: false }).waitFor();
  await page.screenshot({ path: ".next/customer-demo-390.png" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: ".next/customer-demo-1280.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const saveUrl = `${api}/api/v1/customer/inquiries/${inquiryId}/visit-info`;
  const visitSends = [];
  await page.route(saveUrl, (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    visitSends.push(route.request().postDataJSON());
    if (visitSends.length > 1) return route.continue();
    return route.fulfill({
      status: 503,
      headers: { "Access-Control-Allow-Origin": base },
      json: { success: false, code: "TEMPORARY_FAILURE" },
    });
  });
  const save = page.getByRole("button", { name: "한국항공대학교로 저장" });
  await save.click();
  await page
    .getByRole("alert")
    .getByText(/저장 결과를 확인하지/)
    .waitFor();
  const [saved] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === saveUrl && response.request().method() === "PUT",
    ),
    save.click(),
  ]);
  assert.equal(saved.status(), 200);
  const savedVersion = (await saved.json()).result.version;
  await page
    .getByRole("status")
    .getByText(/방문정보가 저장됐어요/)
    .waitFor();
  assert.deepEqual(visitSends[0], visitSends[1]);
  assert.deepEqual(visitSends[1], {
    version,
    name: visit.name,
    phone: visit.phone,
    address: destination.address,
    addressDetail: null,
    lat: destination.lat,
    lng: destination.lng,
    accessNote: null,
    workCategory: null,
  });
  await page.getByRole("button", { name: "상담으로 돌아가기" }).last().click();
  await page.getByRole("log").getByText(text, { exact: true }).waitFor();
  assert.equal(creates, 1);
  assert.ok(savedVersion > version);
  await assert.rejects(
    saveCustomerVisitInfo(inquiryId, inquiryToken, version, visit, destination),
    { status: 409, code: "INQUIRY_VERSION_CONFLICT" },
  );
  const readBack = await fetch(
    `${api}/api/v1/customer/inquiries/${inquiryId}`,
    {
      headers: { Authorization: `Bearer ${inquiryToken}` },
    },
  );
  assert.equal(readBack.status, 200);
  const { result } = await readBack.json();
  assert.equal(result.inquiryId, inquiryId);
  assert.equal(result.visitInfo.address, visit.address);
  assert.equal(result.visitInfo.phone, "01000000001");
  assert.equal(result.version, savedVersion);
  assert.equal(result.reservation, null);
  if (process.env.ILRO_TEST_OWNER_TOKEN) {
    const ownerReadBack = await fetch(
      `${api}/api/v1/owner/inquiries/${inquiryId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.ILRO_TEST_OWNER_TOKEN}`,
        },
      },
    );
    assert.equal(ownerReadBack.status, 200);
    assert.equal(
      (await ownerReadBack.json()).result.visitInfo.address,
      visit.address,
    );
  }
  assert.equal(
    await page.getByRole("button", { name: "사진 첨부" }).count(),
    0,
  );
  const regular = await browser.newPage();
  await regular.goto(`${base}/customer/${regularLink}`);
  await regular.getByRole("checkbox", { name: /개인정보 수집/ }).check();
  await regular.getByRole("button", { name: "동의하고 문의 시작" }).click();
  await regular
    .getByRole("textbox", { name: "메시지", exact: true })
    .fill(text);
  await regular.getByRole("button", { name: "메시지 보내기" }).click();
  await regular.getByRole("log").getByText(text, { exact: true }).waitFor();
  assert.equal(
    await regular.getByText(/실제 이름, 연락처, 주소를 입력하지/).count(),
    0,
  );
  assert.equal(
    await regular.getByRole("button", { name: "시연용 방문정보 입력" }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Local browser: one retried message, reply states, visit failure/retry, destination saved to same inquiry, stale version rejected, demo disabled for regular link",
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
}
