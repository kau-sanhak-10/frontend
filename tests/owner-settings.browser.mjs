import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.PREVIEW_BASE_URL || "http://127.0.0.1:3112";
const origin = new URL(base).origin;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (request) => {
  if (
    /^https?:/.test(request.url()) &&
    new URL(request.url()).origin !== origin
  )
    external.push(request.url());
});
const open = (name) =>
  page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
const back = () => page.getByRole("button", { name: "설정 목록으로" }).click();
const save = async () => {
  await page
    .getByRole("button", { name: "변경사항 저장", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "미리보기에 저장" })
    .waitFor();
};
const check = async (name, run) => {
  await page.goto(`${base}/owner/settings-preview`);
  await run();
  console.log(`PASS ${name}`);
};
try {
  await check("항목별 입력 유지·저장·취소", async () => {
    await open("업체정보");
    await page.getByLabel("업체 이름", { exact: true }).fill("수정한 업체");
    await back();
    await open("영업시간");
    await page
      .getByLabel("하루 최대 방문 건수 (선택)", { exact: true })
      .fill("8");
    await save();
    await back();
    await open("업체정보");
    assert.equal(
      await page.getByLabel("업체 이름", { exact: true }).inputValue(),
      "수정한 업체",
    );
    await page.getByRole("button", { name: "취소", exact: true }).click();
    assert.match(
      await page.getByLabel("업체 이름", { exact: true }).inputValue(),
      /한빛/,
    );
    await back();
    await open("영업시간");
    assert.equal(
      await page
        .getByLabel("하루 최대 방문 건수 (선택)", { exact: true })
        .inputValue(),
      "8",
    );
  });
  await check("공백 입력·필수값 오류·실패 후 재저장", async () => {
    await open("업체정보");
    const name = page.getByLabel("업체 이름", { exact: true });
    await name.fill(" ");
    await page
      .getByRole("button", { name: "변경사항 저장", exact: true })
      .click();
    await page
      .getByText("업체명을 1~100자로 입력해 주세요.", { exact: true })
      .waitFor();
    await page.waitForFunction(
      () => document.activeElement?.id === "businessName",
    );
    await name.fill("확인 업체");
    const service = page.getByLabel("제공 서비스 안내 (선택)", { exact: true });
    await service.fill("");
    await service.pressSequentially("수리 및 점검");
    assert.equal(await service.inputValue(), "수리 및 점검");
    await page.getByLabel("다음 저장 실패 테스트").check();
    await page
      .getByRole("button", { name: "변경사항 저장", exact: true })
      .click();
    await page.getByRole("alert").filter({ hasText: "다시 저장" }).waitFor();
    assert.equal(await name.inputValue(), "확인 업체");
    await save();
  });
  await check("잘못된 대표 연락처 차단·긴 업체명 줄바꿈", async () => {
    await page.setViewportSize({ width: 320, height: 844 });
    await open("업체정보");
    const phone = page.getByLabel("대표 연락처 (선택)", { exact: true });
    await phone.fill("0-------");
    await page
      .getByRole("button", { name: "변경사항 저장", exact: true })
      .click();
    await page
      .getByText("대표 연락처를 확인해 주세요.", { exact: true })
      .waitFor();
    await page.waitForFunction(
      () => document.activeElement?.id === "contactPhone",
    );
    await phone.fill("1588-1234");
    const longName = "W".repeat(100);
    await page.getByLabel("업체 이름", { exact: true }).fill(longName);
    await save();
    await back();
    await page.getByRole("heading", { name: longName, exact: true }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.setViewportSize({ width: 390, height: 844 });
  });
  await check("시간 역전·점심·정수 한도 검증", async () => {
    await open("영업시간");
    await page.getByLabel("월요일 종료", { exact: true }).fill("08:00");
    await page
      .getByRole("button", { name: "변경사항 저장", exact: true })
      .click();
    await page
      .getByText("종료시간을 시작시간보다 늦게 설정해 주세요.", { exact: true })
      .waitFor();
    await page.getByLabel("월요일 종료", { exact: true }).fill("18:00");
    await page
      .getByLabel("하루 최대 방문 건수 (선택)", { exact: true })
      .fill("0");
    await page
      .getByRole("button", { name: "변경사항 저장", exact: true })
      .click();
    await page
      .getByText("방문 한도는 1 이상의 정수로 입력하거나 비워 주세요.", {
        exact: true,
      })
      .waitFor();
    await page
      .getByLabel("하루 최대 방문 건수 (선택)", { exact: true })
      .fill("5");
    await page.getByLabel("점심시간 설정").uncheck();
    await save();
  });
  await check("제공 작업·자동 예약 허용 구분", async () => {
    await open("작업시간");
    const repair = page
      .locator("section")
      .filter({ has: page.getByText("수리·부품교체", { exact: true }) });
    await repair
      .getByRole("checkbox", { name: "수리·부품교체", exact: true })
      .uncheck();
    await repair
      .getByRole("checkbox", { name: "수리·부품교체", exact: true })
      .check();
    assert.equal(
      await repair.getByLabel("자동 예약 허용", { exact: true }).isChecked(),
      false,
    );
    await repair.getByLabel("작업시간 (분)", { exact: true }).fill("0");
    await page
      .getByRole("button", { name: "변경사항 저장", exact: true })
      .click();
    await page
      .getByText("작업시간은 1~1440분의 정수로 입력해 주세요.", { exact: true })
      .waitFor();
    await repair.getByLabel("작업시간 (분)", { exact: true }).fill("90");
    await save();
    await repair.getByLabel("작업시간 (분)", { exact: true }).fill("");
    await repair
      .getByRole("checkbox", { name: "수리·부품교체", exact: true })
      .uncheck();
    await save();
    await back();
    await open("작업시간");
    assert.equal(
      await repair
        .getByRole("checkbox", { name: "수리·부품교체", exact: true })
        .isChecked(),
      false,
    );
    await repair
      .getByRole("checkbox", { name: "수리·부품교체", exact: true })
      .check();
    assert.equal(
      await repair.getByLabel("작업시간 (분)", { exact: true }).inputValue(),
      "90",
    );
  });
  await check("지역 중복 방지·필수 설정 누락·접수 중지 구분", async () => {
    await open("방문지역");
    assert.equal(
      await page
        .getByRole("button", { name: "경기 고양시 덕양구 추가", exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByRole("button", { name: "경기 고양시 덕양구 삭제", exact: true })
      .click();
    await save();
    await back();
    await open("접수·예약");
    await page.getByLabel("자동 예약 켜기", { exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "방문지역" }).waitFor();
    assert.equal(
      await page.getByLabel("자동 예약 켜기", { exact: true }).isChecked(),
      false,
    );
    await page.getByLabel("신규 접수 잠시 중지", { exact: true }).check();
    await page
      .getByText(
        "저장하면 새 고객의 접수를 받지 않아요. 기존 접수와 예약은 그대로예요.",
        { exact: true },
      )
      .waitFor();
    await save();
    await back();
    await page
      .getByRole("button", { name: /신규 접수 중지 · 자동 예약 꺼짐/ })
      .waitFor();
  });
  await check(
    "예약 저장 전 방문지역 재검사·활성화 후 필수 설정 유지",
    async () => {
      await open("접수·예약");
      await page.getByLabel("자동 예약 켜기", { exact: true }).check();
      await back();
      await open("방문지역");
      const remove = page.getByRole("button", {
        name: "경기 고양시 덕양구 삭제",
        exact: true,
      });
      await remove.click();
      await save();
      await back();
      await open("접수·예약");
      await page
        .getByRole("button", { name: "변경사항 저장", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "먼저 방문지역" })
        .waitFor();
      await back();
      await page.getByRole("button", { name: /자동 예약 꺼짐/ }).waitFor();
      await open("방문지역");
      await page
        .getByRole("button", { name: "경기 고양시 덕양구 추가", exact: true })
        .click();
      await save();
      await back();
      await open("접수·예약");
      await save();
      await back();
      await open("방문지역");
      await remove.click();
      await page
        .getByRole("button", { name: "변경사항 저장", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "자동 예약을 끈 뒤 변경" })
        .waitFor();
      await back();
      await page.getByRole("button", { name: /^방문지역 1개 지역$/ }).waitFor();
    },
  );
  const directory = resolve(".impeccable/review");
  await mkdir(directory, { recursive: true });
  for (const width of [320, 390, 411, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/owner/settings-preview`);
    for (const section of [
      null,
      "업체정보",
      "영업시간",
      "작업시간",
      "접수·예약",
    ]) {
      if (section) await open(section);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${width} ${section} overflow`,
      );
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: resolve(
            directory,
            `${width === 390 ? "mobile" : "desktop"}${section ? `-${section}` : ""}.png`,
          ),
          fullPage: true,
        });
      if (section) await back();
    }
    console.log(`PASS ${width}px 화면·줄바꿈`);
  }
  await page.goto(`${base}/owner/settings`);
  await page
    .getByText("실제 업체 설정은 사장님 인증 연결 후 이용할 수 있어요.")
    .waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log("PASS 운영 경로 인증 차단·외부 요청 없음·화면 오류 없음");
} finally {
  await browser.close();
}
