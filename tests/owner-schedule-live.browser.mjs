import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const base = process.env.OWNER_QA_BASE_URL || "http://127.0.0.1:35115";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const api = "http://127.0.0.1:35116";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
});

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "America/Los_Angeles",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const now = new Date("2026-11-26T00:00:00Z");
  const expiresAt = "2026-11-30T00:00:00Z";
  const owner = {
    ownerId: 42,
    businessName: "테스트 보일러",
    approvalStatus: "APPROVED",
    status: "ACTIVE",
  };
  let visit;
  let block;
  let version = 1;
  let proposal;
  let dropsManualResponse = true;
  let manualKey;
  let reloaded = 0;
  let fallbackDenied = false;
  await page.clock.setFixedTime(now);
  await page.addInitScript(() => {
    if (!location.pathname.startsWith("/owner/schedule")) return;
    sessionStorage.setItem(
      "ilro.owner.session",
      JSON.stringify({
        accessToken: "own_test",
        expiresAt: Date.parse("2026-11-30T00:00:00Z"),
        name: "사장님",
        loginPhone: "01000000000",
        businessName: "테스트 보일러",
        businessPhone: "01000000000",
      }),
    );
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const { origin, pathname, searchParams } = new URL(request.url());
    if (origin === base) return route.continue();
    if (origin !== api) return route.abort();
    const headers = {
      "access-control-allow-origin": base,
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers":
        "authorization, content-type, idempotency-key",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const reply = (result, status = 200, code = "OK") =>
      route.fulfill({
        headers,
        status,
        json: { success: status < 400, code, message: "", result },
      });
    assert.equal(request.headers().authorization, "Bearer own_test");
    switch (`${request.method()} ${pathname}`) {
      case "GET /api/v1/owner/me":
        return reply({
          ...owner,
          ownerName: "사장님",
          phone: "01000000000",
          contactPhone: null,
          expiresAt,
        });
      case "GET /api/v1/owner/schedule": {
        reloaded++;
        assert.equal(searchParams.get("from"), "2026-11-23");
        assert.equal(searchParams.get("to"), "2026-11-29");
        if (fallbackDenied) return reply(null, 401, "UNAUTHORIZED");
        return reply({
          from: searchParams.get("from"),
          to: searchParams.get("to"),
          days: [
            {
              date: "2026-11-26",
              blocks: block ? [block] : [],
              visits: visit ? [visit] : [],
            },
          ],
        });
      }
      case "GET /api/v1/owner/work-types":
        return reply({
          workTypes: [
            {
              workTypeId: 56,
              workCategory: "REPAIR",
              isActive: true,
              durationMinutes: 60,
              autoBookingAllowed: false,
            },
          ],
        });
      case "GET /api/v1/owner/addresses":
        return reply({
          addresses: [{ address: "서울시 가상로 1", lat: 37.5, lng: 126.8 }],
        });
      case "POST /api/v1/owner/reservations": {
        const body = request.postDataJSON();
        if (!body.acknowledgeOutsideHours)
          return reply(
            { reason: "OUTSIDE_BUSINESS_HOURS" },
            409,
            "SLOT_UNAVAILABLE",
          );
        assert.equal(body.workTypeId, 56);
        assert.equal(body.customerPhone, "01000000000");
        assert.equal(body.startAt, "2026-11-26T14:00:00+09:00");
        assert.deepEqual([body.lat, body.lng], [37.5, 126.8]);
        const key = request.headers()["idempotency-key"];
        assert.match(key, /^[0-9a-f-]{36}$/);
        if (dropsManualResponse) {
          dropsManualResponse = false;
          manualKey = key;
          visit = {
            reservationId: 11,
            inquiryId: null,
            status: "CONFIRMED",
            startAt: body.startAt,
            endAt: "2026-11-26T15:00:00+09:00",
            customerName: "가상 예약",
            workCategory: "REPAIR",
            address: body.address,
            isManual: true,
            activeChange: null,
            travelMinutes: 18,
            travelDistanceMeters: 2400,
            travelStatus: "OK",
          };
          return route.abort();
        }
        assert.equal(key, manualKey);
        return reply({ reservationId: 11 });
      }
      case "GET /api/v1/owner/reservations/11":
        return reply({ ...visit, version, activeChange: proposal ?? null });
      case "POST /api/v1/owner/reservations/11/proposals": {
        const body = request.postDataJSON();
        assert.equal(body.baseVersion, version);
        assert.equal(body.proposedStartAt, "2026-11-26T16:00:00+09:00");
        proposal = { changeId: 91, status: "PROPOSED", proposed: null };
        visit.activeChange = proposal;
        version++;
        return reply(proposal);
      }
      case "POST /api/v1/owner/reservations/11/cancel":
        assert.deepEqual(request.postDataJSON(), {
          version,
          reason: "검증용 취소",
        });
        visit = undefined;
        return reply({ status: "CANCELED" });
      case "POST /api/v1/owner/blocks": {
        const body = request.postDataJSON();
        if (!body.acknowledgeConflicts)
          return reply([], 409, "BLOCK_CONFLICTS_RESERVATION");
        block = {
          blockId: 51,
          startAt: body.startAt,
          endAt: body.endAt,
          reason: body.reason,
        };
        return reply(block, 201);
      }
      case "DELETE /api/v1/owner/blocks/51":
        block = undefined;
        return reply(null);
      default:
        throw new Error(
          `Unexpected schedule QA route: ${request.method()} ${pathname}`,
        );
    }
  });
  const heading = (name) => page.getByRole("heading", { name, exact: true });
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto(`${base}/owner/schedule`);
  await heading("잡힌 일정이 없어요.").waitFor();
  await button("일정 추가").click();
  await heading("일정 추가").waitFor();
  await page
    .getByRole("combobox", { name: /작업 종류/ })
    .selectOption("56", { timeout: 6000 });
  await page.getByLabel("고객 휴대전화번호").fill("010-0000-0000");
  await page.getByLabel("방문 주소").fill("가상로");
  await button("주소 검색").click();
  await button("서울시 가상로 1").click();
  await button("예약 저장").click();
  await page.getByText(/영업시간 밖이에요/).waitFor();
  await page
    .getByRole("checkbox", { name: "영업시간 밖인 것을 확인했어요." })
    .check();
  await button("예약 저장").click();
  await page.getByText(/요청 결과를 확인하지 못했어요/).waitFor();
  await button("예약 저장").click();
  await page.getByText("방문 예약을 저장했어요.").waitFor();
  await page.getByText("예상 이동 18분 · 2.4km", { exact: true }).waitFor();
  const savedVisit = page.getByRole("button", { name: /가상 예약.*작업/ });
  await savedVisit.click();
  await button("변경 시간 제안").click();
  await page.getByLabel("시작 시간", { exact: true }).fill("16:00");
  await button("변경 시간 제안").click();
  await page.getByText("변경 제안 · 예약 유지", { exact: true }).waitFor();
  assert.match(await savedVisit.innerText(), /14:00/);
  // Simulate a server-confirmed customer acceptance, not an optimistic owner edit.
  visit.startAt = "2026-11-26T16:00:00+09:00";
  visit.endAt = "2026-11-26T17:00:00+09:00";
  visit.travelMinutes = 6;
  visit.travelDistanceMeters = 850;
  visit.travelStatus = "CONFLICT";
  visit.activeChange = proposal = null;
  version++;
  await page.reload();
  await savedVisit.waitFor();
  assert.match(await savedVisit.innerText(), /16:00/);
  await page
    .getByText("예상 이동 6분 · 850m · 이동시간 부족", { exact: true })
    .waitFor();
  visit.travelDistanceMeters = null;
  await page.reload();
  await page
    .getByText("예상 이동 6분 · 이동시간 부족", { exact: true })
    .waitFor();
  await button("일정 추가").click();
  await button("시간 비우기").click();
  await page.getByLabel("사유 (선택)", { exact: true }).fill("검증 차단");
  await button("차단 시간 저장").click();
  await page.getByText(/확정 예약과 겹쳐요/).waitFor();
  await page
    .getByRole("checkbox", {
      name: "기존 예약을 유지하고 차단 시간을 추가해요.",
    })
    .check();
  await button("차단 시간 저장").click();
  const blockButton = page.getByRole("button", { name: /검증 차단/ });
  await blockButton.waitFor();
  await page.reload();
  await blockButton.click();
  await button("차단 시간 해제").click();
  await page.getByText("차단 시간을 해제했어요.").waitFor();
  await savedVisit.click();
  await button("예약 취소").click();
  await page.getByLabel("취소 사유").fill("검증용 취소");
  await button("예약 취소").click();
  await heading("잡힌 일정이 없어요.").waitFor();
  if (process.env.OWNER_QA_SCREENSHOT)
    await page.screenshot({ path: process.env.OWNER_QA_SCREENSHOT });
  await page.setViewportSize({ width: 1280, height: 820 });
  await heading("일정").waitFor();
  assert.ok(reloaded >= 5);
  fallbackDenied = true;
  await page.reload();
  await page.waitForURL("**/owner/login?reason=expired");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: timezone, server save/replay, travel distance/reload, proposal preserves existing appointment, block warning/reload/delete, cancel and session expiry",
  );
} finally {
  await browser.close();
}
