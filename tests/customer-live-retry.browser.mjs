import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

// Isolated local BE-05 + PostgreSQL only. Use a synthetic test business link.
const base = "http://127.0.0.1:35111";
const api = "http://127.0.0.1:35112";
const link = process.env.ILRO_TEST_INTAKE_LINK;
assert.match(link ?? "", /^[A-Za-z0-9_-]{43}$/);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const createPath = `/api/v1/public/intake/${link}/inquiries`;
  let creates = 0;
  page.on("request", (request) => {
    if (request.url() === api + createPath && request.method() === "POST")
      creates++;
  });
  const sends = [];
  await page.route(
    `${api}/api/v1/customer/inquiries/*/messages`,
    async (route) => {
      const request = route.request();
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
  assert.equal(
    await page.getByRole("button", { name: "사진 첨부" }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Local BE-05: consent → inquiry → POST 201 / retry 200 → one stored customer message",
  );
} finally {
  await browser.close();
}
