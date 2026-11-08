import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";
import path from "node:path";

// 임시 서버·별도 헤드리스 브라우저로 검사한다. 사용자 브라우저·실제 API는 사용하지 않는다.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const output = path.resolve(
  process.env.CUSTOMER_QA_OUTPUT || ".next/consultation-qa",
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
const passed = [];
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
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  // 키보드가 열릴 때 visualViewport만 줄어드는 실제 휴대폰 조건을 재현한다.
  await context.addInitScript(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let height;
    Object.defineProperty(viewport, "height", {
      get: () => height ?? window.innerHeight,
    });
    window.setKeyboardViewport = (nextHeight) => {
      height = nextHeight;
      viewport.dispatchEvent(new Event("resize"));
    };
  });
  // localhost에서는 지원되지만 휴대폰 HTTP에서는 없는 API를 동일하게 재현한다.
  await context.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined });
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    window.uuidCount = 0;
    crypto.getRandomValues = (bytes) => {
      if (bytes instanceof Uint8Array && bytes.length === 16)
        window.uuidCount++;
      return getRandomValues(bytes);
    };
  });
  const page = await context.newPage();
  const externalRequests = [],
    pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await context.route("**/*", (route) => {
    if (!route.request().url().startsWith(base)) {
      externalRequests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  const open = async (query = "") => {
    await page.goto(`${base}/customer/consultation-preview${query}`);
    await page.getByRole("heading", { level: 1 }).waitFor();
  };
  const send = () =>
    page.getByRole("button", { name: "메시지 보내기", exact: true }).click();
  const file = {
    name: "test-photo.png",
    mimeType: "image/png",
    buffer: await readFile("public/customer/boiler-example.png"),
  };
  await open();
  await page.getByLabel("개인정보 수집·이용 동의").check();
  await page.getByRole("button", { name: "동의하고 문의 시작" }).click();
  await page.getByRole("heading", { name: "덕구와 상담" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "사진 첨부", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("textbox", { name: "메시지", exact: true })
    .fill("온수가 안 나와요");
  await send();
  await page
    .getByRole("log")
    .getByText("온수가 안 나와요", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "정리된 접수 정보 확인" }).click();
  assert.ok((await page.getByText("미확인", { exact: true }).count()) >= 3);
  await page
    .getByRole("button", { name: "방문정보 입력", exact: true })
    .click();
  await page.getByLabel("이름", { exact: true }).fill("입력보존테스트");
  await page.getByRole("button", { name: "이전 화면", exact: true }).click();
  await page.getByRole("button", { name: "정리된 접수 정보 확인" }).click();
  await page
    .getByRole("button", { name: "방문정보 입력", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("이름", { exact: true }).inputValue(),
    "입력보존테스트",
  );
  await page.getByLabel("휴대전화", { exact: true }).fill("010-1234-5678");
  await page
    .getByLabel("방문 주소", { exact: true })
    .fill("경기 고양시 테스트로 1");
  await page
    .getByRole("button", { name: "접수 내용 확인", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "접수 내용 확인", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "방문시간 선택", exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: path.join(output, "flow-summary.png"),
    fullPage: true,
  });
  passed.push(
    "필수 동의→사진 없이 상담→미확인 정보→방문정보→접수 확인, 수정 전 입력 보존",
  );

  await open("?scene=chat");
  await page
    .getByRole("textbox", { name: "메시지", exact: true })
    .fill("키보드 확인");
  await page.evaluate(() => window.setKeyboardViewport(420));
  const composeBounds = await page
    .getByRole("textbox", { name: "메시지", exact: true })
    .boundingBox();
  assert.ok(
    composeBounds.y >= 0 && composeBounds.y + composeBounds.height <= 420,
  );
  const sendBounds = await page
    .getByRole("button", { name: "메시지 보내기", exact: true })
    .boundingBox();
  assert.ok(sendBounds.y >= 0 && sendBounds.y + sendBounds.height <= 420);
  await send();
  await page
    .getByRole("log")
    .getByText("키보드 확인", { exact: true })
    .waitFor();
  await page.evaluate(() => window.setKeyboardViewport(undefined));
  passed.push(
    "키보드로 visualViewport만 축소되어도 메시지 입력·전송 버튼이 화면 안에 유지됨",
  );

  await open("?scene=retake");
  await page.screenshot({
    path: path.join(output, "mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "모델명 사진 추가", exact: true })
    .click();
  await page.getByRole("heading", { name: "사진 보완", exact: true }).waitFor();
  await page.screenshot({
    path: path.join(output, "mobile-retake.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "모델명 없이 계속하기", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "방문정보 입력", exact: true })
      .isEnabled(),
    true,
  );
  passed.push("추가 촬영 가이드·참고정보 미확인 상태로 계속 진행");

  await open("?scene=chat&fail=send");
  await page.getByLabel("사진 파일 선택").setInputFiles(file);
  await page.getByText("전송 대기", { exact: true }).waitFor();
  await page
    .getByRole("textbox", { name: "메시지", exact: true })
    .fill("사진 전송 테스트");
  await send();
  await page.locator('main [role="alert"]').waitFor();
  assert.equal(
    await page
      .getByRole("textbox", { name: "메시지", exact: true })
      .inputValue(),
    "사진 전송 테스트",
  );
  await page
    .getByText("업로드 완료 · 메시지 전송 대기", { exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "mobile-send-failure.png"),
    fullPage: true,
  });
  const uuidCount = await page.evaluate(() => window.uuidCount);
  await page.getByLabel("사진 파일 선택").setInputFiles({
    name: "unsupported.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a photo"),
  });
  await page
    .getByRole("alert")
    .getByText(/JPG·PNG 사진을 선택/)
    .waitFor();
  await send();
  await page
    .getByRole("log")
    .getByText("사진 전송 테스트", { exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.uuidCount),
    uuidCount,
    "유효하지 않은 첨부만 선택한 뒤에는 기존 메시지 ID로 재시도해야 함",
  );
  assert.equal(
    await page
      .getByRole("log")
      .getByText("사진 전송 테스트", { exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("log")
      .getByAltText("보낸 사진: test-photo.png")
      .count(),
    1,
  );
  passed.push(
    "메시지 실패 후 내용·사진 보존, 잘못된 첨부 선택 후에도 메시지 ID·업로드 재사용",
  );

  await open("?scene=chat&fail=upload");
  await page.getByLabel("사진 파일 선택").setInputFiles(file);
  await page.getByText("전송 대기", { exact: true }).waitFor();
  await send();
  await page
    .getByText("사진 전송 실패 · 다시 보내주세요", { exact: true })
    .waitFor();
  await send();
  await page
    .getByRole("log")
    .getByAltText("보낸 사진: test-photo.png")
    .waitFor();
  passed.push("사진만 전송 가능·사진 실패 후 재전송");

  await open("?scene=chat&fail=send");
  await page.getByLabel("사진 파일 선택").setInputFiles(file);
  await page.getByText("전송 대기", { exact: true }).waitFor();
  await page
    .getByRole("textbox", { name: "메시지", exact: true })
    .fill("사진 첨부는 취소하고 글만 보내요");
  await send();
  await page.locator('main [role="alert"]').waitFor();
  await page
    .getByRole("button", { name: "test-photo.png 첨부 취소", exact: true })
    .click();
  assert.equal(
    await page.getByRole("list", { name: "보낼 사진", exact: true }).count(),
    0,
  );
  await send();
  await page
    .getByRole("log")
    .getByText("사진 첨부는 취소하고 글만 보내요", { exact: true })
    .waitFor();
  assert.equal(await page.getByRole("log").locator("img").count(), 0);
  passed.push("사진 업로드 후 메시지 실패→첨부 취소→글만 다시 전송");

  await open("?scene=chat");
  await page.getByLabel("사진 파일 선택").setInputFiles({
    name: "unsupported.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("not-an-image"),
  });
  await page.locator('main [role="alert"]').waitFor();
  assert.match(await page.locator('main [role="alert"]').innerText(), /JPG/);
  await page.getByLabel("사진 파일 선택").setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not-an-image"),
  });
  await page
    .locator('main [role="alert"]')
    .getByText(/읽지 못했어요/)
    .waitFor();
  passed.push("HEIC·사진 디코딩 실패 차단");

  await open("?scene=chat&fail=handoff");
  await page
    .getByRole("button", { name: "사장님과 직접 상담", exact: true })
    .click();
  await page.locator('main [role="alert"]').waitFor();
  assert.equal(
    await page.getByText("사장님과 직접 상담 중", { exact: true }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "사장님과 직접 상담", exact: true })
    .click();
  await page.getByText("사장님과 직접 상담 중", { exact: true }).waitFor();
  passed.push("직접 상담 실패 시 AI 상태 유지·성공 후에만 전환");

  await open("?scene=chat&fail=expired");
  await page
    .getByRole("textbox", { name: "메시지", exact: true })
    .fill("만료되어도 남을 내용");
  await send();
  await page.locator('main [role="alert"]').waitFor();
  assert.match(
    await page.locator('main [role="alert"]').innerText(),
    /본인 확인/,
  );
  assert.equal(
    await page
      .getByRole("textbox", { name: "메시지", exact: true })
      .inputValue(),
    "만료되어도 남을 내용",
  );
  passed.push("접근 만료 안내·미전송 내용 유지");

  await open("?scene=retake");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const input = await page
      .getByRole("textbox", { name: "메시지", exact: true })
      .boundingBox();
    assert.ok(input.y + input.height <= 844);
    assert.ok(
      await page
        .getByRole("textbox", { name: "메시지", exact: true })
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16),
    );
    if (width === 1440)
      await page.screenshot({
        path: path.join(output, "desktop.png"),
        fullPage: true,
      });
  }
  passed.push("320/390/1440px 넘침 없음·입력창 접근 가능·16px 입력 글자");
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(pageErrors, []);
  assert.equal(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
    0,
  );
  passed.push("외부 요청·브라우저 오류·고객정보 브라우저 저장 없음");
  await writeFile(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        scope: "FE-05 목업 UI·FE-03 연결",
        passed,
        externalRequests,
        pageErrors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: passed.length, results: passed, output }, null, 2),
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
}
