import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const base = process.env.PREVIEW_BASE_URL ?? "http://127.0.0.1:35115";
const api = "http://127.0.0.1:35116";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let creates = 0,
    writes = 0,
    fieldWrites = 0,
    version = 3;
  let categoryFailure = true;
  let phoneFailure = true,
    versionFailure = true,
    ownerLocked = false,
    noCoordinates = false;
  let visit = {
    name: "테스트 고객",
    phone: "01000000000",
    address: "테스트 방문 주소",
    addressDetail: "101호",
    lat: 37.5,
    lng: 127,
    accessNote: "",
    workCategory: "REPAIR",
  };
  let fields = [
    {
      fieldKey: "symptom",
      value: "온수가 안 나와요",
      source: "CUSTOMER",
      status: "CONFIRMED",
    },
  ];
  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const headers = {
      "access-control-allow-origin": base,
      "access-control-allow-methods": "GET, POST, PUT, PATCH, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const reply = (result, status = 200, code = "OK") =>
      route.fulfill({
        status,
        headers,
        json: { success: status < 400, code, message: "", result },
      });
    if (pathname.includes("/public/intake/") && request.method() === "GET")
      return reply({
        businessName: "테스트 보일러",
        contactPhone: "020000000",
        customerNotice: "",
        serviceDescription: "",
        workCategories: ["REPAIR"],
        intakeAvailable: true,
        termsVersion: "test-v1",
      });
    if (pathname.endsWith("/inquiries")) {
      creates++;
      return reply(
        {
          inquiryId: 10,
          inquiryToken: "inq_private",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
        201,
      );
    }
    assert.equal(request.headers().authorization, "Bearer inq_private");
    if (pathname.endsWith("/messages"))
      return request.method() === "POST"
        ? reply({ messageId: 2, deliveryStatus: "SENT", aiStatus: "NONE" }, 201)
        : reply({ messages: [], hasMore: false });
    if (pathname.endsWith("/fields")) {
      if (request.method() === "PATCH") {
        fieldWrites++;
        const body = request.postDataJSON();
        assert.equal(body.version, version);
        fields = body.fields.map((f) => ({
          ...f,
          status: "CONFIRMED",
          source: "CUSTOMER",
        }));
        version++;
      }
      return reply({ version, fields });
    }
    if (pathname.endsWith("/visit-info")) {
      writes++;
      const body = request.postDataJSON();
      assert.equal(body.version, version);
      if (ownerLocked) return reply(null, 409, "VISIT_INFO_OWNER_CONFIRMED");
      if (phoneFailure) {
        phoneFailure = false;
        return reply(
          [
            {
              field: "phone",
              reason: "휴대전화 번호 형식을 다시 확인해 주세요.",
            },
          ],
          400,
          "INVALID_INPUT",
        );
      }
      if (categoryFailure) {
        categoryFailure = false;
        return reply(
          [
            {
              field: "workCategory",
              reason: "이 업체가 현재 제공하지 않는 작업이에요.",
            },
          ],
          400,
          "INVALID_INPUT",
        );
      }
      if (versionFailure) {
        versionFailure = false;
        visit = { ...visit, accessNote: "사장님이 추가한 최신 안내" };
        version++;
        return reply(
          { currentVersion: version },
          409,
          "INQUIRY_VERSION_CONFLICT",
        );
      }
      visit = { ...visit, ...body };
      version++;
    }
    return reply({
      inquiryId: 10,
      version,
      visitInfo: noCoordinates
        ? { ...visit, address: null, lat: null, lng: null }
        : visit,
      status: "COLLECTING",
    });
  });
  await page.goto(`${base}/customer/${"a".repeat(43)}`);
  await page.getByRole("checkbox", { name: /개인정보 수집/ }).check();
  await page
    .getByRole("button", { name: "동의하고 문의 시작", exact: true })
    .dblclick();
  await page
    .getByRole("textbox", { name: "메시지", exact: true })
    .fill("온수가 안 나와요");
  await page
    .getByRole("button", { name: "메시지 보내기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "접수 내용·방문정보 확인", exact: true })
    .click();
  await page
    .getByRole("button", { name: "접수 정보 수정", exact: true })
    .click();
  await page
    .getByLabel("수정 내용", { exact: true })
    .fill("온수가 차갑고 난방도 안 돼요");
  await page
    .getByRole("button", { name: "수정 내용 저장", exact: true })
    .click();
  await page.getByText("접수 정보가 저장됐어요.", { exact: true }).waitFor();
  assert.equal(fieldWrites, 1);
  // Field edits changed the inquiry version; load fresh visit snapshot by reopening.
  await page
    .getByRole("button", { name: "상담으로 돌아가기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "접수 내용·방문정보 확인", exact: true })
    .click();
  await page
    .getByRole("button", { name: "방문정보 입력·수정", exact: true })
    .click();
  const phone = page.getByLabel("휴대전화", { exact: true });
  await phone.fill("010-0000-0000");
  const name = page.getByLabel("이름", { exact: true });
  await name.fill("새 테스트 이름");
  assert.equal(
    await page
      .getByLabel("방문 주소", { exact: true })
      .getAttribute("readonly"),
    "",
  );
  const save = page.getByRole("button", {
    name: "접수 내용 확인",
    exact: true,
  });
  await save.click();
  await page
    .getByText("휴대전화 번호 형식을 다시 확인해 주세요.", { exact: true })
    .waitFor();
  assert.equal(await name.inputValue(), "새 테스트 이름");
  assert.equal(await phone.inputValue(), "010-0000-0000");
  await save.click();
  await page
    .getByText("이 업체가 현재 제공하지 않는 작업이에요.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByLabel("작업 유형", { exact: false })
      .getAttribute("aria-invalid"),
    "true",
  );
  await mkdir(".impeccable/review", { recursive: true });
  await page.screenshot({
    path: ".impeccable/review/visit-work-error.png",
    fullPage: true,
  });
  await page.getByLabel("작업 유형", { exact: false }).selectOption("REPAIR");
  assert.equal(
    await page
      .getByLabel("작업 유형", { exact: false })
      .getAttribute("aria-invalid"),
    "false",
  );
  await save.click();
  await page.getByText(/최신 방문정보:/).waitFor();
  assert.equal(await name.inputValue(), "새 테스트 이름");
  await mkdir(".impeccable/review", { recursive: true });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    if (width !== 320)
      await page.screenshot({
        path: `.impeccable/review/visit-${width}.png`,
        fullPage: true,
      });
  }
  await save.click();
  await page.getByText(/방문정보가 저장됐어요/).waitFor();
  assert.equal(writes, 4);
  assert.equal(visit.name, "새 테스트 이름");
  assert.equal(visit.phone, "01000000000");
  assert.equal(creates, 1);
  // Returning to the form reuses the saved value, not a seeded example.
  await page
    .getByRole("button", { name: "방문정보 입력·수정", exact: true })
    .click();
  assert.equal(await name.inputValue(), "새 테스트 이름");
  ownerLocked = true;
  await name.fill("보존할 이름");
  await save.click();
  await page.getByText(/사장님이 확인한 방문정보예요/).waitFor();
  assert.equal(await name.inputValue(), "보존할 이름");
  assert.equal(visit.name, "새 테스트 이름");
  await page.getByRole("button", { name: "이전 화면", exact: true }).click();
  await page
    .getByRole("button", { name: "상담으로 돌아가기", exact: true })
    .click();
  noCoordinates = true;
  await page
    .getByRole("button", { name: "접수 내용·방문정보 확인", exact: true })
    .click();
  await page
    .getByRole("button", { name: "방문정보 입력·수정", exact: true })
    .click();
  await page.getByText(/주소 검색을 연결하고 있어요/).waitFor();
  await save.click();
  assert.equal(writes, 5);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: normal intake, one create on double-click, field edit, phone rejection/input retention, version conflict/latest snapshot, owner guard, no invented coordinates, 3 widths",
  );
} finally {
  await browser.close();
}
