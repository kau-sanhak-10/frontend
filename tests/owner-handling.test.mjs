// 직접 응대·답장·덕구 재개·문의 종료 (FE-10 · B-15·B-16·C-11)
// 목업 규칙, 화면 규칙, 실제 서버 호출(가짜 fetch)을 확인합니다.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  closeInquiry,
  fetchInquiryDetail,
  mockBusinessIdOf,
  mockInquiryConfig,
  resetMockEdits,
  resumeAiInquiry,
  sendOwnerMessage,
  takeOverInquiry,
  updateInquiryFields,
} from "../src/lib/owner-inquiries/mock-api.ts";
import {
  handlingActionsOf,
  resumeBlockersOf,
} from "../src/lib/owner-inquiries/rules.ts";
import { mapDetail } from "../src/lib/owner-inquiries/live-mapper.ts";
import {
  closeInquiryLive,
  resumeAiInquiryLive,
  sendOwnerMessageLive,
  takeOverInquiryLive,
} from "../src/lib/owner-inquiries/live-api.ts";

const NOW = new Date(2026, 10, 10, 11, 0).getTime();
const HANBIT = mockBusinessIdOf("01011112222");

beforeEach(() => {
  mockInquiryConfig.delayMs = 0;
  mockInquiryConfig.fail = false;
  mockInquiryConfig.saveFail = false;
  mockInquiryConfig.handlingFail = false;
  mockInquiryConfig.sendFail = false;
  mockInquiryConfig.now = () => NOW;
  resetMockEdits();
});

async function detailOf(id) {
  const res = await fetchInquiryDetail(HANBIT, id);
  assert.equal(res.ok, true);
  return res.data;
}

// ── 목업: 서버 규칙과 같게 동작하는지 ──

test("직접 응대를 시작하면 사장님이 응대하고 버전이 오른다", async () => {
  const before = await detailOf("inq-104");
  assert.equal(before.handler, "AI");
  assert.deepEqual(handlingActionsOf(before), {
    canTakeOver: true,
    canReply: false,
    canResume: false,
    canClose: true,
  });

  const res = await takeOverInquiry(HANBIT, "inq-104");
  assert.deepEqual(res, { ok: true, data: { handler: "OWNER" } });

  const after = await detailOf("inq-104");
  assert.equal(after.handler, "OWNER");
  assert.equal(after.status, "OWNER_HANDLING");
  assert.equal(after.version, before.version + 1);
  assert.equal(handlingActionsOf(after).canReply, true);
  assert.equal(handlingActionsOf(after).canTakeOver, false);
});

test("확인 필요 문의는 넘겨받아도 확인 필요 단계가 그대로다", async () => {
  await takeOverInquiry(HANBIT, "inq-101");
  const after = await detailOf("inq-101");
  assert.equal(after.handler, "OWNER");
  assert.equal(after.status, "OWNER_CHECK");
});

test("전환이 실패하면 응대 주체가 바뀌지 않는다", async () => {
  mockInquiryConfig.handlingFail = true;
  const res = await takeOverInquiry(HANBIT, "inq-104");
  assert.deepEqual(res, { ok: false, code: "FAILED" });
  mockInquiryConfig.handlingFail = false;
  assert.equal((await detailOf("inq-104")).handler, "AI");
});

test("답장은 직접 응대 중일 때만 보내고, 같은 메시지 ID는 한 번만 저장한다", async () => {
  const request = {
    clientMsgId: "c-1",
    text: "  내일 오전에 방문 가능해요.  ",
  };
  assert.deepEqual(await sendOwnerMessage(HANBIT, "inq-104", request), {
    ok: false,
    code: "NOT_OWNER_MODE",
  });

  await takeOverInquiry(HANBIT, "inq-104");
  const first = await sendOwnerMessage(HANBIT, "inq-104", request);
  assert.equal(first.ok, true);
  assert.equal(first.data.from, "OWNER");
  assert.equal(first.data.text, "내일 오전에 방문 가능해요.");
  assert.equal(first.data.delivery, "SENT");

  const again = await sendOwnerMessage(HANBIT, "inq-104", request);
  assert.deepEqual(again, first);
  const owners = (await detailOf("inq-104")).messages.filter(
    (m) => m.from === "OWNER",
  );
  assert.equal(owners.length, 1);
});

test("답장 전송이 실패하면 대화에 넣지 않는다", async () => {
  await takeOverInquiry(HANBIT, "inq-105");
  const before = (await detailOf("inq-105")).messages.length;
  mockInquiryConfig.sendFail = true;
  const res = await sendOwnerMessage(HANBIT, "inq-105", {
    clientMsgId: "c-2",
    text: "확인했어요",
  });
  assert.deepEqual(res, { ok: false, code: "FAILED" });
  mockInquiryConfig.sendFail = false;
  assert.equal((await detailOf("inq-105")).messages.length, before);
});

test("안전 신호가 있으면 덕구에게 다시 맡길 수 없다", async () => {
  const inquiry = await detailOf("inq-102");
  assert.deepEqual(resumeBlockersOf(inquiry), ["SAFETY"]);
  await takeOverInquiry(HANBIT, "inq-102");
  const res = await resumeAiInquiry(HANBIT, "inq-102");
  assert.deepEqual(res, {
    ok: false,
    code: "RESUME_BLOCKED",
    blockers: ["SAFETY"],
  });
  assert.equal((await detailOf("inq-102")).handler, "OWNER");
});

test("필수 정보(증상)가 확인되지 않았으면 다시 맡길 수 없다", () => {
  const inquiry = {
    safetyFlag: false,
    summary: [
      {
        key: "symptom",
        required: true,
        value: null,
        state: "UNCONFIRMED",
      },
    ],
  };
  assert.deepEqual(resumeBlockersOf(inquiry), ["REQUIRED_FIELD"]);
});

test("덕구에게 다시 맡기면 고친 정보는 그대로 두고 고객에게 전환을 알린다", async () => {
  await takeOverInquiry(HANBIT, "inq-105");
  const taken = await detailOf("inq-105");
  await updateInquiryFields(HANBIT, "inq-105", {
    version: taken.version,
    changes: [{ key: "symptom", value: "온수 온도 낮음" }],
  });

  const res = await resumeAiInquiry(HANBIT, "inq-105");
  assert.deepEqual(res, { ok: true, data: { handler: "AI" } });

  const after = await detailOf("inq-105");
  assert.equal(after.handler, "AI");
  assert.equal(after.status, "AI_INTAKE");
  // 재개해도 사장님이 고친 값을 그대로 씁니다. (처음부터 다시 묻지 않음)
  assert.equal(
    after.summary.find((f) => f.key === "symptom").value,
    "온수 온도 낮음",
  );
  assert.equal(after.messages.at(-1).from, "DUKGU");
});

test("문의를 종료해도 예약은 남고, 종료 뒤에는 응대 동작이 모두 막힌다", async () => {
  const res = await closeInquiry(HANBIT, "inq-106");
  assert.deepEqual(res, { ok: true, data: { reservationKept: true } });

  const after = await detailOf("inq-106");
  assert.equal(after.closed, true);
  assert.ok(after.reservation, "예약이 취소되지 않아야 합니다");
  assert.deepEqual(handlingActionsOf(after), {
    canTakeOver: false,
    canReply: false,
    canResume: false,
    canClose: false,
  });
  assert.deepEqual(await takeOverInquiry(HANBIT, "inq-106"), {
    ok: false,
    code: "CLOSED",
  });

  // 다시 종료해도 그대로 성공이고 버전이 또 오르지 않습니다.
  const again = await closeInquiry(HANBIT, "inq-106");
  assert.equal(again.ok, true);
  assert.equal((await detailOf("inq-106")).version, after.version);
});

test("다른 업체 문의는 응대할 수 없다", async () => {
  assert.deepEqual(await takeOverInquiry(HANBIT, "inq-901"), {
    ok: false,
    code: "NOT_FOUND",
  });
  assert.deepEqual(await closeInquiry(HANBIT, "inq-901"), {
    ok: false,
    code: "NOT_FOUND",
  });
});

// ── 서버 응답 바꾸기 ──

test("상세 응답의 응대 주체·종료·안전·상담 요청을 옮긴다", () => {
  const detail = {
    inquiryId: 12,
    status: "CLOSED",
    handlerMode: "OWNER",
    safetyFlag: true,
    ownerCheckReason: null,
    version: 4,
    visitInfo: null,
    fields: [],
    aiSummary: null,
    photos: [],
    handoffRequests: [
      {
        handoffId: 9,
        requestType: "CALLBACK",
        name: "김민수",
        phone: "01012345678",
        status: "WAITING",
      },
      {
        handoffId: 3,
        requestType: "DIRECT_CHAT",
        name: null,
        phone: null,
        status: "DONE",
      },
    ],
    reservation: null,
    createdAt: "2026-11-09T10:00:00+09:00",
  };
  const messages = [
    {
      messageId: 1,
      sender: "OWNER",
      content: "확인했어요",
      deliveryStatus: "FAILED",
      photoIds: [],
      createdAt: "2026-11-09T10:01:00+09:00",
    },
  ];
  const mapped = mapDetail(detail, messages);
  assert.equal(mapped.handler, "OWNER");
  assert.equal(mapped.closed, true);
  assert.equal(mapped.safetyFlag, true);
  assert.deepEqual(mapped.activeHandoff, {
    id: "9",
    type: "CALLBACK",
    status: "WAITING",
    name: "김민수",
    phone: "01012345678",
  });
  assert.equal(mapped.messages[0].delivery, "FAILED");

  const done = mapDetail(
    {
      ...detail,
      status: "COLLECTING",
      handoffRequests: [detail.handoffRequests[1]],
    },
    [],
  );
  assert.equal(done.closed, false);
  assert.equal(done.activeHandoff, undefined);
});

// ── 실제 서버 호출 (fetch를 가짜로 바꿔 서버 없이 확인) ──

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeServer(handler) {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({
      path: u.pathname,
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: init.body,
    });
    const [status, body] = handler(u.pathname, init);
    return new Response(JSON.stringify(body), { status });
  };
  return calls;
}
const ok = (result, status = 200) => [
  status,
  { success: true, code: "OK", message: "", result },
];
const fail = (status, code, result = null) => [
  status,
  { success: false, code, message: "", result },
];

test("직접 응대 시작은 takeover로 보내고 바뀐 응대 주체를 돌려준다", async () => {
  const calls = fakeServer(() =>
    ok({
      inquiryId: 12,
      handlerMode: "OWNER",
      status: "OWNER_CHECK",
      version: 5,
    }),
  );
  const res = await takeOverInquiryLive("own_token", "12");
  assert.deepEqual(res, { ok: true, data: { handler: "OWNER" } });
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].path, "/api/v1/owner/inquiries/12/takeover");
  assert.equal(calls[0].headers.get("Authorization"), "Bearer own_token");
});

test("종료된 문의와 네트워크 실패를 구분한다", async () => {
  fakeServer(() => fail(409, "INQUIRY_CLOSED"));
  assert.deepEqual(await takeOverInquiryLive("t", "12"), {
    ok: false,
    code: "CLOSED",
  });
  fakeServer(() => fail(500, "INTERNAL_SERVER_ERROR"));
  assert.deepEqual(await takeOverInquiryLive("t", "12"), {
    ok: false,
    code: "FAILED",
  });
  fakeServer(() => fail(404, "INQUIRY_NOT_FOUND"));
  assert.deepEqual(await closeInquiryLive("t", "12"), {
    ok: false,
    code: "NOT_FOUND",
  });
});

test("답장은 clientMsgId와 내용을 보내고, 직접 응대 전이면 NOT_OWNER_MODE로 알린다", async () => {
  const calls = fakeServer(() =>
    ok(
      {
        messageId: 30,
        sender: "OWNER",
        content: "내일 갈게요",
        deliveryStatus: "SENT",
        photoIds: [],
        createdAt: "2026-11-10T11:00:00+09:00",
      },
      201,
    ),
  );
  const res = await sendOwnerMessageLive("t", "12", {
    clientMsgId: "uuid-1",
    text: "내일 갈게요",
  });
  assert.equal(res.ok, true);
  assert.equal(res.data.id, "30");
  assert.equal(res.data.from, "OWNER");
  assert.equal(calls[0].path, "/api/v1/owner/inquiries/12/messages");
  assert.deepEqual(JSON.parse(calls[0].body), {
    clientMsgId: "uuid-1",
    content: "내일 갈게요",
  });

  fakeServer(() => fail(409, "NOT_IN_OWNER_MODE"));
  assert.deepEqual(
    await sendOwnerMessageLive("t", "12", { clientMsgId: "u", text: "x" }),
    { ok: false, code: "NOT_OWNER_MODE" },
  );
});

test("서버가 전송 실패로 저장한 답장은 성공으로 보지 않는다", async () => {
  fakeServer(() =>
    ok({
      messageId: 31,
      sender: "OWNER",
      content: "x",
      deliveryStatus: "FAILED",
      photoIds: [],
      createdAt: "2026-11-10T11:00:00+09:00",
    }),
  );
  assert.deepEqual(
    await sendOwnerMessageLive("t", "12", { clientMsgId: "u", text: "x" }),
    { ok: false, code: "FAILED" },
  );
});

test("재개가 막히면 서버가 준 이유를 그대로 돌려준다", async () => {
  const calls = fakeServer(() =>
    fail(422, "AI_RESUME_BLOCKED", { reasons: ["SAFETY", "REQUIRED_FIELD"] }),
  );
  assert.deepEqual(await resumeAiInquiryLive("t", "12"), {
    ok: false,
    code: "RESUME_BLOCKED",
    blockers: ["SAFETY", "REQUIRED_FIELD"],
  });
  assert.equal(calls[0].path, "/api/v1/owner/inquiries/12/resume-ai");
});

test("종료하면 예약이 남았는지 알려 준다", async () => {
  const calls = fakeServer(() =>
    ok({
      inquiryId: 12,
      status: "CLOSED",
      version: 6,
      reservationKept: true,
      reservationId: 5,
    }),
  );
  assert.deepEqual(await closeInquiryLive("t", "12"), {
    ok: true,
    data: { reservationKept: true },
  });
  assert.equal(calls[0].path, "/api/v1/owner/inquiries/12/close");
  assert.equal(calls[0].method, "POST");
});
