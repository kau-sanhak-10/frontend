import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";

const fresh = process.argv.includes("--fresh");
const base = fresh ? "http://127.0.0.1:35142" : "http://127.0.0.1:35120";
const api = fresh ? "http://127.0.0.1:35141" : "http://127.0.0.1:35116";
const database = fresh ? "ilro_booking_fresh_nov20" : "ilro";
const backend = fresh ? "ilro-booking-fresh-nov20" : "ilro-wbs-nov19-api";
const link = randomBytes(32).toString("base64url");
const number = () => `0100000${String(randomInt(10_000)).padStart(4, "0")}`;
const phone = number();
let ownerPhone = number();
while (ownerPhone === phone) ownerPhone = number();
const address = "경기 고양시 덕양구 항공대학로 76";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const query = (sql) =>
  execFileSync(
    "docker",
    [
      "exec",
      "ilro-wbs-nov19-db",
      "psql",
      "-U",
      "ilro",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-Atc",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
query(`
    INSERT INTO owner (business_name, phone, link_token, approval_status, status,
      address, lat, lng, auto_booking_enabled, buffer_minutes)
    VALUES ('브라우저 통합 테스트 업체', '${ownerPhone}', '${link}', 'APPROVED', 'ACTIVE',
      '${address}', 37.6000000, 126.8650000, true, 15);
    INSERT INTO owner_business_hour (owner_id, day_of_week, open_time, close_time, is_closed)
    SELECT id, day, '09:00', '18:00', false
    FROM owner CROSS JOIN generate_series(1, 7) AS day WHERE link_token = '${link}';
    INSERT INTO owner_work_type (owner_id, work_category, duration_minutes, is_active, auto_booking_allowed)
    SELECT id, 'REPAIR', 60, true, true FROM owner WHERE link_token = '${link}';
    INSERT INTO owner_service_area(owner_id, region_code, region_name)
    SELECT id, '41281', '고양시 덕양구' FROM owner WHERE link_token = '${link}';
  `);

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
});
async function isolatedPage() {
  const tab = await browser.newPage({ viewport: { width: 390, height: 850 } });
  await tab.route("**/*", (route) => {
    const origin = new URL(route.request().url()).origin;
    return [base, api].includes(origin) ? route.continue() : route.abort();
  });
  return tab;
}
const page = await isolatedPage();
const click = (name, tab = page) =>
  tab.getByRole("button", { name, exact: true }).click();
const seen = (value, tab = page) =>
  tab.getByText(value, { exact: false }).first().waitFor();
const bookingPath = /\/api\/v1\/customer\/inquiries\/\d+\/reservations$/;
const bookingResponse = (res) =>
  res.url().startsWith(api) &&
  bookingPath.test(res.url()) &&
  res.request().method() === "POST";

function otpCodes(customerPhone = phone) {
  const messages = execFileSync("docker", ["logs", backend], {
    encoding: "utf8",
    maxBuffer: 8_000_000,
  });
  const maskedPhone = `010\\*\\*\\*\\*${customerPhone.slice(-4)}`;
  return [
    ...messages.matchAll(
      new RegExp(`${maskedPhone}, message=\\[일로\\] 인증번호는 (\\d{6})`, "g"),
    ),
  ];
}

async function readLocalOtp(index, customerPhone = phone) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const codes = otpCodes(customerPhone);
    if (codes.length > index) return codes.at(-1)[1];
    await setTimeout(250);
  }
  throw new Error("격리 서버의 테스트 문자 기록을 찾지 못했어요.");
}

async function prepareBooking(tab, customerPhone) {
  await tab.goto(`${base}/customer/${link}`);
  await tab.getByRole("checkbox", { name: /개인정보 수집/ }).check();
  await click("동의하고 문의 시작", tab);
  await tab
    .getByRole("textbox", { name: "메시지", exact: true })
    .fill("온수가 나오지 않습니다. 테스트 수리 문의입니다.");
  await click("메시지 보내기", tab);
  await seen("방문 가능한 시간을 골라 주세요", tab);
  await click("접수 내용·방문정보 확인", tab);
  await click("방문정보 입력·수정", tab);
  await tab.getByLabel("이름", { exact: true }).fill("검증고객");
  await tab.getByLabel("휴대전화", { exact: true }).fill(customerPhone);
  await tab.getByRole("combobox").selectOption("REPAIR");
  await tab.getByLabel("방문 주소", { exact: true }).fill("항공대학로 76");
  await click("주소 검색", tab);
  await click(address, tab);
  const [saved] = await Promise.all([
    tab.waitForResponse(
      (res) =>
        res.url().startsWith(api) &&
        res.url().endsWith("/visit-info") &&
        res.request().method() === "PUT",
    ),
    click("접수 내용 확인", tab),
  ]);
  assert.equal(saved.status(), 200);
  await seen("방문정보가 저장됐어요", tab);
  await click("방문시간·예약 확인", tab);
  await tab.getByRole("radio").first().check();
  await click("선택한 시간 확인", tab);
  return saved;
}

try {
  await prepareBooking(page, phone);
  let attempt = otpCodes().length;
  await click("인증번호 받기");
  const code = await readLocalOtp(attempt);
  const otp = page.getByLabel("문자 인증번호");
  await otp.fill(code === "000000" ? "111111" : "000000");
  await click("인증번호 확인");
  await seen("인증번호가 맞지 않아요");
  await otp.fill(code);
  await click("인증번호 확인");
  let droppedConfirmation;
  await page.route(bookingPath, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const response = await route.fetch();
    droppedConfirmation = {
      status: response.status(),
      id: (await response.json()).result?.reservationId,
      key: route.request().headers()["idempotency-key"],
    };
    await route.abort();
  });
  await click("이 시간으로 예약 확정");
  await seen("같은 요청으로 결과를 다시 확인해요");
  await page.unroute(bookingPath);
  assert.equal(droppedConfirmation?.status, 201);
  assert.ok(droppedConfirmation.id && droppedConfirmation.key);
  const reservationId = Number(droppedConfirmation.id);
  assert.ok(Number.isSafeInteger(reservationId) && reservationId > 0);
  // Only the delivery outcome is injected: the reservation and its queued SMS
  // must already exist, and the replay must read both from PostgreSQL.
  const failedDelivery = query(`
    UPDATE notification SET send_status='FAILED', attempt_count=1
    WHERE ref_type='RESERVATION' AND ref_id=${reservationId}
      AND event_type='RESERVATION_CONFIRMED' AND recipient='CUSTOMER'
      AND channel='SMS' AND send_status='PENDING'
      AND owner_id=(SELECT id FROM owner WHERE link_token='${link}')
    RETURNING id;
  `).split("\n")[0];
  assert.match(failedDelivery, /^\d+$/);
  const [replayed] = await Promise.all([
    page.waitForResponse(bookingResponse),
    click("예약 결과 다시 확인"),
  ]);
  assert.equal(replayed.status(), 200);
  assert.equal(
    replayed.request().headers()["idempotency-key"],
    droppedConfirmation.key,
  );
  const replayedBooking = (await replayed.json()).result;
  assert.equal(replayedBooking.reservationId, droppedConfirmation.id);
  assert.equal(replayedBooking.status, "CONFIRMED");
  assert.deepEqual(
    replayedBooking.notifications.filter(
      ({ recipient, channel }) => recipient === "CUSTOMER" && channel === "SMS",
    ),
    [{ recipient: "CUSTOMER", channel: "SMS", sendStatus: "FAILED" }],
  );
  await seen("방문 예약이 확정됐어요");
  await seen("안내 문자·알림 발송은 다시 확인 중이에요");
  const count = query(`
    SELECT count(*) FROM reservation r JOIN inquiry i ON r.inquiry_id=i.id
    JOIN owner o ON r.owner_id=o.id JOIN customer c ON r.customer_id=c.id
    WHERE o.link_token='${link}' AND c.phone='${phone}' AND r.status='CONFIRMED'
      AND i.status='BOOKED' AND i.phone_verified_at IS NOT NULL;
  `);
  assert.equal(count, "1");
  await page.reload();
  await click("내 문의");
  await click("기존 예약 조회");
  await page.getByLabel("휴대전화번호").fill(phone);
  attempt = otpCodes().length;
  await click("인증번호 받기");
  await otp.fill(await readLocalOtp(attempt));
  await click("인증번호 확인");
  await page.getByRole("button", { name: /· 확정/ }).click();
  await seen(address);
  await click("이전");
  const expired = query(`
    UPDATE auth_token SET created_at=now() - interval '20 minutes',
      expires_at=now() - interval '1 second', last_used_at=NULL
    WHERE scope='RESERVATION_LOOKUP' AND customer_phone='${phone}'
      AND owner_id=(SELECT id FROM owner WHERE link_token='${link}')
    RETURNING id;
  `).split("\n")[0];
  assert.match(expired, /^\d+$/);
  const [rejected] = await Promise.all([
    page.waitForResponse((res) =>
      res.url().startsWith(`${api}/api/v1/customer/reservations/`),
    ),
    page.getByRole("button", { name: /· 확정/ }).click(),
  ]);
  assert.equal(rejected.status(), 401);
  await seen("다시 인증해 주세요");
  await page.getByLabel("휴대전화번호").waitFor();
  assert.equal(await page.getByRole("button", { name: /· 확정/ }).count(), 0);
  assert.equal(await page.getByText(address, { exact: true }).count(), 0);
  const unverified = query(`
    INSERT INTO inquiry (owner_id, customer_id, status, handler_mode, symptom)
    SELECT i.owner_id, i.customer_id, 'COLLECTING', 'AI', '번호 미확인 검증용 문의'
    FROM inquiry i JOIN owner o ON i.owner_id=o.id
    WHERE o.link_token='${link}' AND i.status='BOOKED'
    RETURNING id;
  `)
    .split("\n")[0]
    .trim();
  assert.match(unverified, /^\d+$/);
  await page.reload();
  await click("내 문의");
  await click("기존 상담 이어가기");
  await page.getByLabel("휴대전화번호").fill(phone);
  attempt = otpCodes().length;
  await click("인증번호 받기");
  await otp.fill(await readLocalOtp(attempt));
  await click("인증번호 확인");
  await page.getByRole("button", { name: /온수가 나오지 않습니다/ }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: /번호 미확인 검증용 문의/ }).count(),
    0,
  );
  await page.getByRole("button", { name: /온수가 나오지 않습니다/ }).click();
  await seen("테스트 수리 문의입니다");

  const participants = new Set();
  while (participants.size < 2) {
    const candidate = number();
    if (candidate !== phone && candidate !== ownerPhone)
      participants.add(candidate);
  }
  const contenders = [];
  for (const customerPhone of participants) {
    const tab = await isolatedPage();
    await prepareBooking(tab, customerPhone);
    const beforeOtp = otpCodes(customerPhone).length;
    await click("인증번호 받기", tab);
    await tab
      .getByLabel("문자 인증번호")
      .fill(await readLocalOtp(beforeOtp, customerPhone));
    await click("인증번호 확인", tab);
    contenders.push(tab);
  }
  function submitBooking(tab) {
    return Promise.all([
      tab.waitForResponse(bookingResponse),
      click("이 시간으로 예약 확정", tab),
    ]).then(([response]) => response);
  }
  const results = await Promise.all(contenders.map(submitBooking));
  assert.deepEqual(results.map((res) => res.status()).sort(), [201, 409]);
  const attempted = results.map((r) => r.request().postDataJSON().startAt);
  assert.equal(attempted[0], attempted[1]);
  const requestKeys = results.map(
    (r) => r.request().headers()["idempotency-key"],
  );
  assert.ok(requestKeys.every(Boolean));
  assert.notEqual(requestKeys[0], requestKeys[1]);
  const loser = results.findIndex((res) => res.status() === 409);
  const loserTab = contenders[loser];
  assert.equal((await results[loser].json()).code, "SLOT_UNAVAILABLE");
  await seen("방문 예약이 확정됐어요", contenders[1 - loser]);
  await seen("선택한 시간에 예약할 수 없어요", loserTab);
  const reservations = () =>
    query(`SELECT count(*) FROM reservation r JOIN owner o ON r.owner_id=o.id
    JOIN customer c ON r.customer_id=c.id WHERE o.link_token='${link}' AND r.status='CONFIRMED'
    AND c.phone IN (${[...participants].map((n) => `'${n}'`).join(",")});`);
  assert.equal(reservations(), "1");
  await click("가능시간 다시 불러오기", loserTab);
  await loserTab.getByRole("radio").first().check();
  await click("선택한 시간 확인", loserTab);
  const rescheduled = await submitBooking(loserTab);
  assert.equal(rescheduled.status(), 201);
  assert.notEqual(rescheduled.request().postDataJSON().startAt, attempted[0]);
  assert.notEqual(
    rescheduled.request().headers()["idempotency-key"],
    requestKeys[loser],
  );
  await seen("방문 예약이 확정됐어요", loserTab);
  assert.equal(reservations(), "2");

  const usedPhones = new Set([phone, ownerPhone, ...participants]);
  const freshPhone = () => {
    let next = number();
    while (usedPhones.has(next) || otpCodes(next).length) next = number();
    usedPhones.add(next);
    return next;
  };
  const before = freshPhone();
  const intermediate = freshPhone();
  const after = freshPhone();
  const changedTab = await isolatedPage();
  const saved = await prepareBooking(changedTab, before);
  const request = saved.request();
  const inquiryId = (await saved.json()).result.inquiryId;
  assert.ok(Number.isSafeInteger(inquiryId));
  const visitChanged = async (next) => {
    const auth = { Authorization: request.headers().authorization };
    const current = await fetch(request.url().replace(/\/visit-info$/, ""), {
      headers: auth,
    });
    assert.equal(current.status, 200);
    const latest = (await current.json()).result;
    const response = await fetch(request.url(), {
      method: "PUT",
      headers: {
        ...auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...request.postDataJSON(),
        version: latest.version,
        phone: next,
      }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).result.phoneVerified, false);
  };
  await click("인증번호 받기", changedTab);
  const changedOtp = changedTab.getByLabel("문자 인증번호");
  await changedOtp.fill(await readLocalOtp(0, before));
  await visitChanged(intermediate);
  const [oldOtpResponse] = await Promise.all([
    changedTab.waitForResponse((res) =>
      /\/verifications\/\d+\/confirm$/.test(res.url()),
    ),
    click("인증번호 확인", changedTab),
  ]);
  assert.equal(
    (await oldOtpResponse.json()).code,
    "VERIFICATION_PURPOSE_MISMATCH",
  );
  await click("인증번호 받기", changedTab);
  assert.equal(
    await changedTab.getByLabel("휴대전화번호").inputValue(),
    intermediate,
  );
  await changedOtp.fill(await readLocalOtp(0, intermediate));
  await click("인증번호 확인", changedTab);
  await seen("인증 완료", changedTab);

  const recoveryTab = await isolatedPage();
  await recoveryTab.goto(`${base}/customer/${link}`);
  await click("내 문의", recoveryTab);
  await click("기존 상담 이어가기", recoveryTab);
  await recoveryTab.getByLabel("휴대전화번호").fill(intermediate);
  const recoveryOtpBefore = otpCodes(intermediate).length;
  await click("인증번호 받기", recoveryTab);
  await recoveryTab
    .getByLabel("문자 인증번호")
    .fill(await readLocalOtp(recoveryOtpBefore, intermediate));
  await click("인증번호 확인", recoveryTab);
  const oldInquiry = recoveryTab.getByRole("button", {
    name: /온수가 나오지 않습니다/,
  });
  await oldInquiry.waitFor();
  await visitChanged(after);
  const [unavailable] = await Promise.all([
    recoveryTab.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url() ===
          `${api}/api/v1/customer/inquiries/${inquiryId}/access-token`,
    ),
    oldInquiry.click(),
  ]);
  assert.equal(unavailable.status(), 404);
  assert.equal((await unavailable.json()).code, "INQUIRY_NOT_FOUND");
  await recoveryTab
    .getByRole("alert")
    .filter({ hasText: "이 내역은 더 이상 열 수 없어요" })
    .waitFor();
  assert.equal(await oldInquiry.count(), 0);
  await click("목록 다시 불러오기", recoveryTab);
  await seen("조회할 수 있는 내역이 없어요", recoveryTab);
  assert.equal(await recoveryTab.getByLabel("휴대전화번호").count(), 0);
  const noBooking = await submitBooking(changedTab);
  assert.equal(noBooking.status(), 403);
  assert.equal((await noBooking.json()).code, "PHONE_NOT_VERIFIED");
  assert.equal(
    query(`SELECT count(*) FROM reservation WHERE inquiry_id=${inquiryId};`),
    "0",
  );
  await click("인증번호 받기", changedTab);
  assert.equal(await changedTab.getByLabel("휴대전화번호").inputValue(), after);
  await changedOtp.fill(await readLocalOtp(0, after));
  await click("인증번호 확인", changedTab);
  const newBooking = await submitBooking(changedTab);
  assert.equal(newBooking.status(), 201);
  assert.equal(
    newBooking.request().postDataJSON().startAt,
    noBooking.request().postDataJSON().startAt,
  );
  await seen("방문 예약이 확정됐어요", changedTab);
  assert.equal(
    query(
      `SELECT c.phone FROM reservation r JOIN customer c ON c.id=r.customer_id WHERE r.inquiry_id=${inquiryId};`,
    ),
    after,
  );
  console.log(
    "PASS: local Spring/PostgreSQL reservation replay after recorded SMS failure, expired lookup, concurrent same-slot handling, rejected old OTP/recovery after number change, and booking the same time with the new number.",
  );
} finally {
  await browser.close();
}
