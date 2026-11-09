// 실제 서버 응답(BE-04·BE-07)을 사장님 화면 모양으로 바꾸는지 확인합니다.
// 서버 없이, 백엔드 DTO와 같은 모양의 예시 응답으로 검사합니다.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  mapDetail,
  mapIntakeLink,
  mapListItem,
  mapStatus,
  maskName,
  mergeTodayVisits,
} from "../src/lib/owner-inquiries/live-mapper.ts";
import { needsOwnerCheck } from "../src/lib/owner-inquiries/rules.ts";

const listItem = (over = {}) => ({
  inquiryId: 12,
  status: "COLLECTING",
  handlerMode: "AI",
  safetyFlag: false,
  ownerCheckReason: null,
  customerName: "김민수",
  customerPhone: "01012345678",
  address: "고양시 덕양구 화정동 1",
  workCategory: "REPAIR",
  symptom: "온수가 안 나와요",
  handoff: null,
  lastMessage: {
    sender: "AI",
    preview: "사진을 보내 주세요.",
    createdAt: "2026-11-09T10:01:00+09:00",
  },
  createdAt: "2026-11-09T10:00:00+09:00",
  updatedAt: "2026-11-09T10:01:00+09:00",
  ...over,
});

const field = (over) => ({
  required: false,
  value: null,
  source: null,
  status: "UNCONFIRMED",
  unconfirmedReason: "NOT_PROVIDED",
  photoId: null,
  messageId: null,
  updatedAt: null,
  history: [],
  ...over,
});

const detail = {
  inquiryId: 12,
  status: "BOOKED",
  handlerMode: "AI",
  safetyFlag: false,
  ownerCheckReason: null,
  version: 3,
  visitInfo: {
    name: "김민수",
    phone: "01012345678",
    address: "화정동 ○○아파트",
    workCategory: "REPAIR",
  },
  phoneVerified: true,
  fields: [
    field({
      fieldKey: "manufacturer",
      value: "경동나비엔",
      source: "CUSTOMER",
      status: "CONFIRMED",
      unconfirmedReason: null,
      messageId: 1,
      updatedAt: "2026-11-09T10:02:00+09:00",
    }),
    field({ fieldKey: "model" }),
    field({ fieldKey: "boiler_type" }),
    field({
      fieldKey: "error_code",
      value: "03",
      source: "PHOTO",
      status: "CONFIRMED",
      unconfirmedReason: null,
      photoId: 7,
      updatedAt: "2026-11-09T10:05:00+09:00",
    }),
    field({
      fieldKey: "symptom",
      required: true,
      value: "온수 불량",
      source: "OWNER",
      status: "CONFIRMED",
      unconfirmedReason: null,
      updatedAt: "2026-11-09T11:00:00+09:00",
      history: [
        {
          value: "온수가 안 나와요",
          source: "CUSTOMER",
          status: "CONFIRMED",
          unconfirmedReason: null,
          createdAt: "2026-11-09T10:01:00+09:00",
        },
      ],
    }),
  ],
  aiSummary: {
    summary: "오류코드 03, 온수 불량",
    decidedAt: "2026-11-09T10:06:00+09:00",
  },
  photos: [
    {
      photoId: 7,
      messageId: 2,
      mimeType: "image/jpeg",
      createdAt: "2026-11-09T10:04:00+09:00",
    },
  ],
  handoffRequests: [],
  reservation: {
    reservationId: 5,
    status: "CONFIRMED",
    startAt: "2026-11-10T14:00:00+09:00",
    endAt: "2026-11-10T15:00:00+09:00",
  },
  consents: [],
  createdAt: "2026-11-09T10:00:00+09:00",
  updatedAt: "2026-11-09T11:00:00+09:00",
};

const messages = [
  {
    messageId: 1,
    sender: "CUSTOMER",
    content: "경동나비엔인데 온수가 안 나와요",
    deliveryStatus: "SENT",
    photoIds: [],
    createdAt: "2026-11-09T10:01:00+09:00",
  },
  {
    messageId: 2,
    sender: "CUSTOMER",
    content: null,
    deliveryStatus: "SENT",
    photoIds: [7],
    createdAt: "2026-11-09T10:04:00+09:00",
  },
  {
    messageId: 3,
    sender: "AI",
    content: "확인했어요.",
    deliveryStatus: "SENT",
    photoIds: [],
    createdAt: "2026-11-09T10:06:00+09:00",
  },
];

test("서버 상태를 화면 상태로 바꾼다", () => {
  assert.equal(mapStatus("COLLECTING", "AI"), "AI_INTAKE");
  assert.equal(mapStatus("SCHEDULING", "OWNER"), "OWNER_HANDLING");
  assert.equal(mapStatus("OWNER_CHECK", "AI"), "OWNER_CHECK");
  assert.equal(mapStatus("BOOKED", "AI"), "RESERVED");
  assert.equal(mapStatus("CLOSED", "OWNER"), "COMPLETED");
  assert.equal(mapStatus("UNSERVICEABLE", "AI"), "COMPLETED");
});

test("목록은 이름을 가리고, 확인 필요는 서버 이유가 있을 때만 센다", () => {
  assert.equal(maskName("김민수"), "김○○");
  assert.equal(maskName(null), "고객");
  const normal = mapListItem(listItem());
  assert.equal(normal.id, "12");
  assert.equal(normal.customerLabel, "김○○");
  assert.equal(normal.title, "온수가 안 나와요");
  assert.equal(normal.status, "AI_INTAKE");
  assert.equal(needsOwnerCheck(normal), false);

  const safety = mapListItem(
    listItem({
      status: "OWNER_CHECK",
      ownerCheckReason: "SAFETY",
      safetyFlag: true,
      symptom: null,
    }),
  );
  assert.equal(needsOwnerCheck(safety), true);
  assert.equal(safety.title, "수리 문의");
  assert.match(safety.note, /안전/);
});

test("홈의 오늘 방문을 목록 문의에 붙인다", () => {
  const merged = mergeTodayVisits(
    [mapListItem(listItem())],
    [
      {
        reservationId: 5,
        inquiryId: 12,
        status: "CONFIRMED",
        startAt: "2026-11-09T14:00:00+09:00",
        endAt: "2026-11-09T15:00:00+09:00",
        customerName: "김민수",
        address: "화정동",
        workCategory: "REPAIR",
      },
    ],
  );
  assert.equal(merged[0].reservation.address, "화정동");
  assert.equal(
    merged[0].reservation.startAt,
    Date.parse("2026-11-09T14:00:00+09:00"),
  );
});

test("예약 전 접수에서도 방문 주소가 유지된다", () => {
  const inquiry = mapDetail(
    { ...detail, status: "COLLECTING", reservation: null },
    [],
  );
  assert.equal(inquiry.visitAddress, detail.visitInfo.address);
  assert.equal(inquiry.reservation, undefined);
});

test("최근 AI 분석 실패의 확인 이유를 원문·사진과 분리해서 보여 준다", () => {
  const reason =
    "이번 AI 분석을 완료하지 못했어요. 고객이 보낸 대화와 사진을 확인해 주세요.";
  const failed = {
    ...detail,
    status: "OWNER_CHECK",
    ownerCheckReason: "AI_HANDOFF",
    aiSummary: {
      summary: null,
      decidedAt: null,
      nextAction: null,
      nextActionReason: reason,
    },
  };
  const inquiry = mapDetail(failed, messages);
  assert.equal(inquiry.note, reason);
  assert.equal(inquiry.messages.length, messages.length);
  assert.equal(inquiry.photos.length, detail.photos.length);
  assert.equal(
    mapDetail({ ...failed, status: "COLLECTING" }, messages).note,
    "",
  );
});

test("상세 항목의 출처·미확인 이유·근거·이력을 그대로 옮긴다", () => {
  const d = mapDetail(detail, messages);
  assert.equal(d.version, 3);
  assert.equal(d.status, "RESERVED");
  const byKey = Object.fromEntries(d.summary.map((f) => [f.key, f]));

  assert.equal(byKey.errorCode.value, "03");
  assert.equal(byKey.errorCode.source, "PHOTO");
  assert.deepEqual(byKey.errorCode.evidence, { type: "PHOTO", photoId: "7" });

  // 아직 아무도 알려 주지 않은 항목은 출처 없음 + 미확인 + 이유
  assert.equal(byKey.model.state, "UNCONFIRMED");
  assert.equal(byKey.model.source, "NONE");
  assert.equal(byKey.model.reason, "아직 고객이 알려 주지 않았어요.");
  assert.equal(byKey.boilerType.label, "보일러 종류");

  // 고객 메시지가 근거면 그 문장을 보여 준다
  assert.equal(
    byKey.manufacturer.evidence.quote,
    "경동나비엔인데 온수가 안 나와요",
  );

  // 사장님이 고친 값과 이전 값
  assert.equal(byKey.symptom.source, "OWNER");
  assert.equal(byKey.symptom.history[0].value, "온수가 안 나와요");

  // 참고 항목 미확인은 표시만 (확인 필요로 보내지 않음)
  assert.deepEqual(d.unconfirmedLabels, ["본체 모델명", "보일러 종류"]);
  assert.equal(needsOwnerCheck(d), false);

  assert.equal(d.reservation.address, "화정동 ○○아파트");
  assert.equal(d.messages[2].from, "DUKGU");
  assert.equal(d.messages[1].photoId, "7");
  assert.equal(d.customerDescription, "경동나비엔인데 온수가 안 나와요");
  assert.equal(d.summaryUpdatedAt, Date.parse("2026-11-09T11:00:00+09:00"));
});

test("예약 전에도 고객이 저장한 방문 주소를 유지한다", () => {
  const waiting = {
    ...detail,
    status: "COLLECTING",
    reservation: null,
    visitInfo: { ...detail.visitInfo, addressDetail: "101동" },
  };
  assert.equal(
    mapDetail(waiting, messages).visitAddress,
    "화정동 ○○아파트 101동",
  );
});

test("조절기와 본체 모델을 별도 사진 근거로 표시한다", () => {
  const data = mapDetail(
    {
      ...detail,
      fields: [
        field({
          fieldKey: "model",
          value: "NCB-500",
          source: "PHOTO",
          status: "CONFIRMED",
          photoId: 7,
        }),
        field({
          fieldKey: "controller_model",
          value: "CTRL-1",
          source: "PHOTO",
          status: "CONFIRMED",
          photoId: 8,
        }),
      ],
    },
    messages,
  );
  assert.deepEqual(
    data.summary.map((row) => [row.label, row.value, row.evidence?.photoId]),
    [
      ["본체 모델명", "NCB-500", "7"],
      ["조절기 모델명", "CTRL-1", "8"],
    ],
  );
});

test("항목이 하나도 정리되지 않았으면 요약 없음으로 보고 대화는 유지한다", () => {
  const empty = {
    ...detail,
    fields: detail.fields.map((f) =>
      field({ fieldKey: f.fieldKey, required: f.required }),
    ),
  };
  const d = mapDetail(empty, messages);
  assert.equal(d.summaryUpdatedAt, null);
  assert.equal(d.messages.length, 3);
  assert.equal(d.photos.length, 1);
});

test("접수 링크 상태를 구분한다", () => {
  assert.deepEqual(
    mapIntakeLink({
      status: "READY",
      url: "https://ilro.kr/i/abc",
      businessName: "한빛 보일러",
    }),
    {
      status: "READY",
      url: "https://ilro.kr/i/abc",
      businessName: "한빛 보일러",
    },
  );
  assert.deepEqual(
    mapIntakeLink({ status: "READY", url: null, businessName: null }),
    { status: "ERROR" },
  );
  assert.deepEqual(
    mapIntakeLink({ status: "PAUSED", url: null, businessName: null }),
    { status: "NOT_ISSUED" },
  );
});

// ── 실제 API 호출 (fetch를 가짜로 바꿔 서버 없이 확인) ──
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
      path: u.pathname + u.search,
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: init.body,
    });
    const [status, body] = handler(u.pathname + u.search, init);
    return new Response(JSON.stringify(body), { status });
  };
  return calls;
}
const ok = (result) => [
  200,
  { success: true, code: "OK", message: "", result },
];

test("수정 저장은 version과 서버 항목 이름으로 보내고, 충돌은 CONFLICT로 알린다", async () => {
  const { updateInquiryFieldsLive } =
    await import("../src/lib/owner-inquiries/live-api.ts");
  const calls = fakeServer((path, init) =>
    init.method === "PATCH"
      ? [
          409,
          {
            success: false,
            code: "INQUIRY_VERSION_CONFLICT",
            message: "다른 곳에서 먼저 바뀌었어요",
            result: null,
          },
        ]
      : ok(null),
  );
  const res = await updateInquiryFieldsLive("own_token", "12", {
    version: 3,
    changes: [{ key: "errorCode", value: "E03" }],
  });
  assert.deepEqual(res, { ok: false, code: "CONFLICT" });
  assert.equal(calls[0].method, "PATCH");
  assert.equal(calls[0].path, "/api/v1/owner/inquiries/12");
  assert.equal(calls[0].headers.get("Authorization"), "Bearer own_token");
  assert.deepEqual(JSON.parse(calls[0].body), {
    version: 3,
    fields: [{ fieldKey: "error_code", value: "E03" }],
  });
});

test("저장 성공 응답의 새 버전과 값을 사용하며 추가 조회 실패에 영향을 받지 않는다", async () => {
  const { updateInquiryFieldsLive } =
    await import("../src/lib/owner-inquiries/live-api.ts");
  const calls = fakeServer((path, init) => {
    if (init.method === "PATCH")
      return ok({
        ...detail,
        version: 4,
        fields: [
          field({
            fieldKey: "model",
            value: "NCB353",
            source: "OWNER",
            status: "CONFIRMED",
            unconfirmedReason: null,
          }),
        ],
      });
    assert.fail(`Unexpected follow-up request: ${path}`);
  });
  const res = await updateInquiryFieldsLive("own_token", "12", {
    version: 3,
    changes: [{ key: "model", value: "NCB353" }],
  });
  assert.equal(res.ok, true);
  assert.equal(res.data.version, 4);
  assert.equal(
    res.data.summary.find((f) => f.key === "model")?.value,
    "NCB353",
  );
  assert.deepEqual(
    calls.map((c) => c.method),
    ["PATCH"],
  );
});

test("서버가 실패하면 저장 실패로, 조회 실패는 0건이 아니라 실패로 알린다", async () => {
  const {
    updateInquiryFieldsLive,
    fetchInquiriesLive,
    fetchInquiryDetailLive,
  } = await import("../src/lib/owner-inquiries/live-api.ts");
  fakeServer(() => [
    500,
    { success: false, code: "INTERNAL", message: "오류", result: null },
  ]);
  assert.deepEqual(
    await updateInquiryFieldsLive("own_token", "12", {
      version: 3,
      changes: [{ key: "model", value: "A" }],
    }),
    {
      ok: false,
      code: "SAVE_FAILED",
    },
  );
  assert.deepEqual(await fetchInquiriesLive("own_token"), {
    ok: false,
    code: "LOAD_FAILED",
  });

  fakeServer(() => [
    404,
    {
      success: false,
      code: "INQUIRY_NOT_FOUND",
      message: "없음",
      result: null,
    },
  ]);
  assert.deepEqual(await fetchInquiryDetailLive("own_token", "999"), {
    ok: false,
    code: "NOT_FOUND",
  });
});

test("목록은 마지막 쪽까지 이어서 불러온다", async () => {
  const { fetchInquiriesLive } =
    await import("../src/lib/owner-inquiries/live-api.ts");
  const calls = fakeServer((path) => {
    if (path.startsWith("/api/v1/owner/home")) return ok({ todayVisits: [] });
    const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
    return ok({
      content: [
        listItem({
          inquiryId: page + 1,
          createdAt: `2026-11-0${page + 1}T10:00:00+09:00`,
        }),
      ],
      page,
      isLast: page === 1,
    });
  });
  const res = await fetchInquiriesLive("own_token");
  assert.equal(res.ok, true);
  assert.deepEqual(
    res.data.map((i) => i.id),
    ["2", "1"],
  );
  assert.equal(
    calls.filter((c) => c.path.startsWith("/api/v1/owner/inquiries")).length,
    2,
  );
});

test("상세 사진은 같은 ID의 주소만 붙이고, 한 장이 실패해도 상세는 보여 준다", async () => {
  const { fetchInquiryDetailLive } =
    await import("../src/lib/owner-inquiries/live-api.ts");
  const twoPhotos = {
    ...detail,
    photos: [
      {
        photoId: 7,
        messageId: 2,
        mimeType: "image/jpeg",
        createdAt: "2026-11-09T10:04:00+09:00",
      },
      {
        photoId: 8,
        messageId: 2,
        mimeType: "image/jpeg",
        createdAt: "2026-11-09T10:04:30+09:00",
      },
    ],
  };
  const calls = fakeServer((path) => {
    if (path === "/api/v1/owner/inquiries/12") return ok(twoPhotos);
    if (path.startsWith("/api/v1/owner/inquiries/12/messages"))
      return ok({ messages, hasMore: false });
    if (path === "/api/v1/owner/inquiries/12/photos/7/url") {
      return ok({
        photoId: 7,
        url: "https://files.example.test/7.jpg?sig=a",
        expiresAt: "2026-11-09T10:10:00+09:00",
      });
    }
    // 8번 사진 조회에 7번 주소를 응답하면 엉뚱한 근거 사진을 보여주지 않는다.
    return ok({
      photoId: 7,
      url: "https://files.example.test/7.jpg?sig=b",
      expiresAt: "2026-11-09T10:10:00+09:00",
    });
  });
  const res = await fetchInquiryDetailLive("own_token", "12");
  assert.equal(res.ok, true);
  assert.equal(
    res.data.photos[0].url,
    "https://files.example.test/7.jpg?sig=a",
  );
  assert.equal(res.data.photos[1].url, "");
  assert.ok(
    calls.some((c) => c.path === "/api/v1/owner/inquiries/12/photos/8/url"),
  );
});
