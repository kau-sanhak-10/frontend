// 사장님 방문 작업·메모·완료 실제 API 연결 (FE-16 · BE-13 · B-23~B-25)
// 서버 없이, 백엔드 DTO와 같은 모양의 예시 응답으로 검사합니다.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  kstDate,
  mapReservationDetail,
  mapSchedule,
  mapWorkNote,
  visitRange,
} from "../src/lib/owner-work/live-mapper.ts";
import {
  completeVisitLive,
  correctCompletionLive,
  fetchVisitLive,
  fetchVisitsLive,
  fetchWorkNoteLive,
  saveWorkNoteLive,
} from "../src/lib/owner-work/live-api.ts";

const visit = (over = {}) => ({
  reservationId: 7,
  status: "CONFIRMED",
  startAt: "2026-11-26T14:00:00+09:00",
  endAt: "2026-11-26T15:00:00+09:00",
  workMinutes: 60,
  isManual: false,
  workCategory: "REPAIR",
  inquiryId: 12,
  customerName: "김민수",
  customerPhone: "010-0000-0000",
  address: "고양시 화정동 1",
  ...over,
});

const detail = (over = {}) => ({
  ...visit(),
  version: 3,
  addressDetail: "102동 301호",
  accessNote: "공동현관 #1234",
  completedAt: null,
  activeChange: null,
  ...over,
});

// ── 응답 바꾸기 ─────────────────────────────

test("일정 응답의 날짜별 방문을 시간순 한 줄로 모으고, 같은 예약은 한 번만 둔다", () => {
  const list = mapSchedule({
    from: "2026-11-19",
    to: "2026-12-19",
    days: [
      {
        date: "2026-11-27",
        visits: [
          visit({ reservationId: 9, startAt: "2026-11-27T10:00:00+09:00" }),
        ],
      },
      { date: "2026-11-26", visits: [visit()] },
      { date: "2026-11-28", visits: null },
      { date: "2026-11-27", visits: [visit({ reservationId: 9 })] },
    ],
  });
  assert.deepEqual(
    list.map((v) => v.id),
    ["7", "9"],
  );
  const v = list[0];
  assert.equal(v.customerLabel, "김○○");
  assert.equal(v.workType, "수리");
  assert.equal(v.inquiryId, "12");
  assert.equal(v.startAt, Date.parse("2026-11-26T14:00:00+09:00"));
  assert.deepEqual(v.history, []);
});

test("직접 등록한 예약·이름 없음·작업 종류 없음도 화면이 비지 않는다", () => {
  const [v] = mapSchedule({
    days: [
      {
        date: "2026-11-26",
        visits: [
          visit({
            isManual: true,
            inquiryId: null,
            customerName: null,
            workCategory: null,
            customerPhone: " ",
          }),
        ],
      },
    ],
  });
  assert.equal(v.inquiryId, null);
  assert.equal(v.customerLabel, "고객");
  assert.equal(v.workType, "작업 종류 미정");
  assert.equal(v.contactPhone, null);
});

test("작업정보는 버전·완료 시각·상세 주소·출입 안내까지 바꾼다", () => {
  const v = mapReservationDetail(
    detail({ status: "COMPLETED", completedAt: "2026-11-26T15:10:00+09:00" }),
  );
  assert.equal(v.version, 3);
  assert.equal(v.status, "COMPLETED");
  assert.equal(v.completedAt, Date.parse("2026-11-26T15:10:00+09:00"));
  assert.equal(v.addressDetail, "102동 301호");
  assert.equal(v.accessNote, "공동현관 #1234");
});

test("메모가 없으면 null, 있으면 저장 시각과 함께 바꾼다", () => {
  assert.equal(
    mapWorkNote({ reservationId: 7, content: "", updatedAt: null }),
    null,
  );
  const n = mapWorkNote({
    reservationId: 7,
    content: "배관 교체 필요",
    updatedAt: "2026-11-26T15:00:00+09:00",
  });
  assert.equal(n.content, "배관 교체 필요");
  assert.equal(n.updatedAt, Date.parse("2026-11-26T15:00:00+09:00"));
});

test("불러올 기간은 한국 날짜로 지난 7일 ~ 앞으로 23일 (서버 최대 31일 안)", () => {
  // 한국 11/27 오전 1시 = UTC 11/26 16시
  const now = Date.parse("2026-11-26T16:00:00Z");
  assert.equal(kstDate(now), "2026-11-27");
  assert.deepEqual(visitRange(now), { from: "2026-11-20", to: "2026-12-20" });
});

// ── 서버 요청 ─────────────────────────────

const realFetch = globalThis.fetch;
const previousBase = process.env.NEXT_PUBLIC_API_BASE_URL;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (previousBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = previousBase;
});

function fakeServer(reply) {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: init.method ?? "GET",
      auth: new Headers(init.headers).get("Authorization"),
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const { status = 200, result = null, code = "OK" } = reply(call);
    return Response.json(
      { success: status < 400, code, message: "", result },
      { status },
    );
  };
  return calls;
}

test("방문 일정: 토큰과 기간으로 일정 API를 부르고, 실패는 0건처럼 보이지 않는다", async () => {
  const calls = fakeServer(() => ({
    result: { days: [{ date: "2026-11-26", visits: [visit()] }] },
  }));
  const now = Date.parse("2026-11-26T03:00:00Z");
  const res = await fetchVisitsLive("tok", now);
  assert.equal(res.ok, true);
  assert.equal(res.data.length, 1);
  assert.equal(
    calls[0].url,
    "https://api.example.test/api/v1/owner/schedule?from=2026-11-19&to=2026-12-19",
  );
  assert.equal(calls[0].auth, "Bearer tok");

  fakeServer(() => ({ status: 500, code: "INTERNAL" }));
  assert.deepEqual(await fetchVisitsLive("tok"), {
    ok: false,
    code: "LOAD_FAILED",
  });
});

test("작업정보: 다른 업체 예약(404)은 '찾을 수 없음'으로 구분한다", async () => {
  fakeServer(() => ({ result: detail() }));
  const ok = await fetchVisitLive("tok", "7");
  assert.equal(ok.ok, true);
  assert.equal(ok.data.version, 3);

  fakeServer(() => ({ status: 404, code: "RESERVATION_NOT_FOUND" }));
  assert.deepEqual(await fetchVisitLive("tok", "99"), {
    ok: false,
    code: "NOT_FOUND",
  });
});

test("메모: 불러오기·저장은 work-note API를 쓰고, 저장은 앞뒤 공백을 지운 전체 내용을 보낸다", async () => {
  let calls = fakeServer(() => ({
    result: { reservationId: 7, content: "", updatedAt: null },
  }));
  assert.deepEqual(await fetchWorkNoteLive("tok", "7"), {
    ok: true,
    data: null,
  });
  assert.match(calls[0].url, /\/api\/v1\/owner\/reservations\/7\/work-note$/);

  calls = fakeServer((c) => ({
    result: {
      reservationId: 7,
      content: c.body.content,
      updatedAt: "2026-11-26T15:00:00+09:00",
    },
  }));
  const saved = await saveWorkNoteLive("tok", "7", "  부품 주문  ");
  assert.equal(calls[0].method, "PUT");
  assert.deepEqual(calls[0].body, { content: "부품 주문" });
  assert.equal(saved.ok, true);
  assert.equal(saved.data.content, "부품 주문");

  fakeServer(() => ({ status: 400, code: "INVALID_INPUT" }));
  assert.deepEqual(await saveWorkNoteLive("tok", "7", "x"), {
    ok: false,
    code: "INVALID",
  });
  fakeServer(() => ({ status: 503, code: "X" }));
  assert.deepEqual(await saveWorkNoteLive("tok", "7", "x"), {
    ok: false,
    code: "SAVE_FAILED",
  });
});

test("완료: 화면이 본 버전을 보내고, 처리 뒤 작업정보를 다시 받아 완료 시각까지 돌려준다", async () => {
  const before = mapReservationDetail(detail());
  const calls = fakeServer((c) =>
    c.method === "POST"
      ? {
          result: {
            reservationId: 7,
            status: "COMPLETED",
            version: 4,
            alreadyCompleted: false,
            closedChangeIds: [],
          },
        }
      : {
          result: detail({
            status: "COMPLETED",
            version: 4,
            completedAt: "2026-11-26T15:10:00+09:00",
          }),
        },
  );
  const res = await completeVisitLive("tok", before);
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].url, /\/reservations\/7\/complete$/);
  assert.deepEqual(calls[0].body, { version: 3 });
  assert.equal(res.ok, true);
  assert.equal(res.data.status, "COMPLETED");
  assert.equal(res.data.version, 4);
  assert.equal(res.data.completedAt, Date.parse("2026-11-26T15:10:00+09:00"));
});

test("완료: 다시 받기에 실패해도 처리는 성공으로 보고 응답의 상태·버전을 쓴다", async () => {
  const before = mapReservationDetail(detail());
  fakeServer((c) =>
    c.method === "POST"
      ? { result: { status: "COMPLETED", version: 4, alreadyCompleted: true } }
      : { status: 500, code: "X" },
  );
  const res = await completeVisitLive("tok", before, 1000);
  assert.equal(res.ok, true);
  assert.equal(res.data.status, "COMPLETED");
  assert.equal(res.data.version, 4);
  assert.equal(res.data.completedAt, 1000);
});

test("완료·정정 오류 코드를 화면 안내로 나눈다", async () => {
  const before = mapReservationDetail(detail());
  const cases = [
    [409, "RESERVATION_VERSION_CONFLICT", "CONFLICT"],
    [409, "RESERVATION_NOT_STARTED", "NOT_STARTED"],
    [409, "RESERVATION_CANCELED", "NOT_ALLOWED"],
    [409, "RESERVATION_NOT_COMPLETED", "NOT_ALLOWED"],
    [404, "RESERVATION_NOT_FOUND", "NOT_FOUND"],
    [400, "INVALID_INPUT", "INVALID"],
    [500, "INTERNAL", "SAVE_FAILED"],
  ];
  for (const [status, code, expected] of cases) {
    fakeServer(() => ({ status, code }));
    assert.deepEqual(
      await completeVisitLive("tok", before),
      { ok: false, code: expected },
      code,
    );
  }
});

test("완료 정정: 버전과 사유를 보내고 확정 상태로 돌아간 예약을 돌려준다", async () => {
  const before = mapReservationDetail(
    detail({
      status: "COMPLETED",
      version: 4,
      completedAt: "2026-11-26T15:10:00+09:00",
    }),
  );
  const calls = fakeServer((c) =>
    c.method === "POST"
      ? { result: { reservationId: 7, status: "CONFIRMED", version: 5 } }
      : { result: detail({ status: "CONFIRMED", version: 5 }) },
  );
  const res = await correctCompletionLive(
    "tok",
    before,
    "  다른 예약을 눌렀어요 ",
  );
  assert.match(calls[0].url, /\/reservations\/7\/complete-correction$/);
  assert.deepEqual(calls[0].body, {
    version: 4,
    reason: "다른 예약을 눌렀어요",
  });
  assert.equal(res.ok, true);
  assert.equal(res.data.status, "CONFIRMED");
  assert.equal(res.data.version, 5);
  assert.equal(res.data.completedAt, null);
});
