import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";
import path from "node:path";

// 임시 로컬 서버와 독립 브라우저만 사용한다. 사용자 브라우저·실제 API에는 연결하지 않는다.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const output = path.resolve(
  process.env.CUSTOMER_QA_OUTPUT || ".next/customer-qa",
);
await mkdir(output, { recursive: true });
const listener = createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    env: { ...process.env, CUSTOMER_PREVIEW_ENABLED: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
server.stdout.on("data", (chunk) => (logs += chunk));
server.stderr.on("data", (chunk) => (logs += chunk));
const base = `http://127.0.0.1:${port}`;
const results = [];
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      ready = (await fetch(base)).ok;
    } catch {
      /* 서버 준비 중 */
    }
    if (ready) break;
    await setTimeout(200);
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const externalRequests = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await context.route("**/*", (route) => {
    if (!route.request().url().startsWith(base)) {
      externalRequests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  async function open(query = "") {
    await page.goto(`${base}/customer/preview${query}`);
    await page.getByRole("heading", { level: 1 }).waitFor();
  }
  async function goVisit(query = "") {
    await open(query);
    await page.getByLabel("개인정보 수집·이용 동의").check();
    await page.getByRole("button", { name: "동의하고 문의 시작" }).click();
    await page.getByRole("button", { name: "방문정보 화면 확인" }).click();
    await page.getByLabel("이름", { exact: true }).waitFor();
  }
  async function fillVisit() {
    await page.getByLabel("이름", { exact: true }).fill("화면테스트");
    await page.getByLabel("휴대전화", { exact: true }).fill("010-1234-5678");
    await page
      .getByLabel("방문 주소", { exact: true })
      .fill("경기 고양시 테스트로 1");
  }
  async function noOverflow() {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await open();
  assert.equal(await page.locator("input:not([type=checkbox])").count(), 0);
  assert.equal(
    await page
      .getByText("화면 확인용 · 실제 접수·저장·문자 인증은 하지 않아요.")
      .count(),
    1,
  );
  await page.getByRole("button", { name: "동의하고 문의 시작" }).click();
  await page.locator('main [role="alert"]').waitFor();
  assert.match(
    await page.locator('main [role="alert"]').innerText(),
    /동의해 주세요/,
  );
  results.push("필수 동의 전 개인정보 입력·상담 시작 차단");
  await page.getByLabel("개인정보 수집·이용 동의").check();
  await page
    .getByRole("button", { name: "수집 항목·이용 목적·보관 기간 보기" })
    .click();
  await page
    .getByRole("heading", { name: "상담 전 확인", exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "mobile-terms.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "내용 확인 · 돌아가기" }).click();
  assert.equal(
    await page.getByLabel("개인정보 수집·이용 동의").isChecked(),
    true,
  );
  results.push("동의 상세·복귀 후 선택 유지");
  await page.screenshot({
    path: path.join(output, "mobile-entry.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "동의하고 문의 시작" }).click();
  await page.getByRole("button", { name: "방문정보 화면 확인" }).click();
  await page.getByRole("button", { name: "접수 내용 확인" }).click();
  assert.equal(await page.locator('[aria-invalid="true"]').count(), 3);
  results.push("필수값 누락 항목별 오류·첫 오류 포커스");
  assert.equal(
    await page
      .getByLabel("이름", { exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await fillVisit();
  await noOverflow();
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: path.join(output, "mobile-visit.png"),
    fullPage: false,
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const finalInput = await page.locator("#visit-accessNote").boundingBox();
  const mobileFooter = await page.locator("main footer").boundingBox();
  assert.ok(
    finalInput.y + finalInput.height <= mobileFooter.y,
    "추가 요청 입력이 하단 버튼에 가려짐",
  );
  await page.getByLabel("추가 요청", { exact: false }).fill("출입 안내 테스트");
  await page.screenshot({
    path: path.join(output, "mobile-visit-bottom.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: "접수 내용 확인" }).click();
  await page
    .getByRole("heading", { name: "입력한 방문정보", exact: true })
    .waitFor();
  assert.match(await page.locator("main").innerText(), /선택 안 함/);
  assert.match(await page.locator("main").innerText(), /미인증/);
  assert.match(
    await page.locator("main").innerText(),
    /서버 저장·주소 확인·예약 확정은 하지 않았어요/,
  );
  results.push("사진·작업 유형·선택 동의 없이 진행·저장/인증 오인 방지");
  await page.getByRole("button", { name: "방문정보 수정" }).click();
  assert.equal(
    await page.getByLabel("방문 주소", { exact: true }).inputValue(),
    "경기 고양시 테스트로 1",
  );
  await page.getByRole("button", { name: "이전 화면" }).click();
  await page.getByRole("button", { name: "방문정보 화면 확인" }).click();
  assert.equal(
    await page.getByLabel("이름", { exact: true }).inputValue(),
    "화면테스트",
  );
  results.push("수정·앱 뒤로 이동 후 입력 유지");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow();
    assert.ok(
      await page
        .locator("#visit-phone")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16),
    );
  }
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: path.join(output, "desktop-visit.png"),
    fullPage: false,
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const desktopInput = await page.locator("#visit-accessNote").boundingBox();
  const desktopFooter = await page.locator("main footer").boundingBox();
  assert.ok(desktopInput.y + desktopInput.height <= desktopFooter.y);
  await page.screenshot({
    path: path.join(output, "desktop-visit-bottom.png"),
    fullPage: false,
  });
  results.push("320/390/1440px 가로 넘침 없음·입력 글자 16px 이상");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const failure of ["visit", "address", "region"]) {
    await goVisit(`?fail=${failure}`);
    await fillVisit();
    await page.getByRole("button", { name: "접수 내용 확인" }).click();
    if (failure === "visit")
      await page.locator('main [role="alert"]').waitFor();
    else await page.locator('[aria-invalid="true"]').waitFor();
    assert.equal(
      await page.getByLabel("이름", { exact: true }).inputValue(),
      "화면테스트",
    );
    assert.equal(
      await page.getByLabel("방문 주소", { exact: true }).inputValue(),
      "경기 고양시 테스트로 1",
    );
  }
  results.push("통신 실패·주소 확인 실패·서비스 지역 밖에서 입력 유지");
  await open("?fail=start");
  await page.getByLabel("개인정보 수집·이용 동의").check();
  await page.getByRole("button", { name: "동의하고 문의 시작" }).click();
  await page.locator('main [role="alert"]').waitFor();
  assert.equal(
    await page.getByLabel("개인정보 수집·이용 동의").isChecked(),
    true,
  );
  results.push("상담 시작 실패 시 동의 유지·재시도 가능");
  for (const [state, expected] of [
    ["invalid", "사용할 수 없는 접수 링크예요"],
    ["paused", "지금은 새 문의를 받고 있지 않아요"],
    ["unavailable", "지금은 이 업체에 접수할 수 없어요"],
    ["loading", "업체 정보를 확인하고 있어요"],
    ["error", "업체 정보를 불러오지 못했어요"],
  ]) {
    await open(`?state=${state}`);
    await page.getByRole("heading", { name: expected, exact: true }).waitFor();
    assert.equal(await page.locator("input").count(), 0);
  }
  results.push("링크·접수 중지·업체 제한·로딩·통신 실패 구분");
  await page.getByRole("button", { name: "다시 불러오기" }).click();
  await page.getByRole("button", { name: "동의하고 문의 시작" }).waitFor();
  await open("?state=paused");
  await page.getByRole("button", { name: "기존 예약 조회" }).click();
  await page
    .getByRole("heading", {
      name: "본인 확인 후 조회할 수 있어요",
      exact: true,
    })
    .waitFor();
  results.push("조회 실패 재시도·접수 중지 상태의 기존 예약 조회 연결");
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(pageErrors, []);
  assert.equal(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
    0,
  );
  results.push("외부 요청·브라우저 오류·개인정보 브라우저 저장 없음");
  await writeFile(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        scope: "FE-03 화면 확인용 흐름",
        passed: results.length,
        results,
        externalRequests,
        pageErrors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: results.length, results, output }, null, 2),
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
}
