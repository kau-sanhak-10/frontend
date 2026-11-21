// 사장님 업무 알림·수신 설정·Web Push 실제 API 연결 (FE-16 · BE-14)
// 서버 없이, 백엔드 DTO와 같은 모양의 예시 응답으로 검사합니다.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  kindOf,
  mapNotification,
  mapPrefs,
  notificationTitle,
  prefsRequest,
} from "../src/lib/owner-work/live-mapper.ts";
import {
  NOTIFICATION_PAGE_SIZE,
  fetchNotificationPrefsLive,
  fetchNotificationsLive,
  fetchPushPublicKeyLive,
  markNotificationReadLive,
  saveNotificationPrefsLive,
  subscribePushLive,
  unsubscribePushLive,
} from "../src/lib/owner-work/live-api.ts";
import {
  base64UrlToBytes,
  deviceLabel,
  pushStateOf,
} from "../src/lib/owner-work/push.ts";
import { NOTIFICATION_KIND_LABEL } from "../src/lib/owner-work/rules.ts";

const item = (over = {}) => ({
  notificationId: 31,
  eventType: "NEEDS_CHECK",
  refType: "INQUIRY",
  refId: 12,
  createdAt: "2026-11-21T10:00:00+09:00",
  readAt: null,
  ...over,
});

// ── 응답 바꾸기 ─────────────────────────────

test("서버 알림 유형 9가지를 수신 설정 4종류로 묶고, 모르는 유형은 '알림'으로 둔다", () => {
  assert.equal(kindOf("NEW_RESERVATION"), "NEW_RESERVATION");
  assert.equal(kindOf("RESERVATION_CONFIRMED"), "NEW_RESERVATION");
  assert.equal(kindOf("NEEDS_CHECK"), "NEEDS_CHECK");
  for (const t of ["CHANGE", "CHANGE_PROPOSED", "CHANGE_APPLIED"]) {
    assert.equal(kindOf(t), "CHANGE");
  }
  for (const t of ["CANCEL", "RESERVATION_CANCELED"]) {
    assert.equal(kindOf(t), "CANCEL");
  }
  assert.equal(kindOf("RESULT"), "OTHER");
  assert.equal(kindOf("SOMETHING_NEW"), "OTHER");
  assert.equal(NOTIFICATION_KIND_LABEL.OTHER, "알림");
});

test("서버 알림 한 건을 화면 알림으로 바꾸고, 문구는 비우지 않는다", () => {
  const n = mapNotification(item());
  assert.equal(n.id, "31");
  assert.equal(n.event, "NEEDS_CHECK");
  assert.equal(n.refType, "INQUIRY");
  assert.equal(n.refId, "12");
  assert.equal(n.createdAt, Date.parse("2026-11-21T10:00:00+09:00"));
  assert.equal(n.readAt, null);
  assert.equal(n.safety, false);
  assert.ok(n.title.length > 0);
  assert.match(n.body, /문의 12번/);

  const read = mapNotification(
    item({
      eventType: "RESERVATION_CONFIRMED",
      refType: "RESERVATION",
      refId: 7,
      readAt: "2026-11-21T10:05:00+09:00",
    }),
  );
  assert.equal(read.refType, "RESERVATION");
  assert.match(read.body, /예약 7번/);
  assert.equal(read.readAt, Date.parse("2026-11-21T10:05:00+09:00"));
  assert.equal(notificationTitle("UNKNOWN"), "새 알림이 있어요");
});

test("수신 설정: 서버가 빠뜨린 종류는 켜짐, 저장할 때는 4종류를 모두 보낸다", () => {
  assert.deepEqual(mapPrefs({ NEEDS_CHECK: false }), {
    NEW_RESERVATION: true,
    NEEDS_CHECK: false,
    CHANGE: true,
    CANCEL: true,
  });
  const body = prefsRequest({
    NEW_RESERVATION: true,
    NEEDS_CHECK: false,
    CHANGE: true,
    CANCEL: false,
  });
  assert.deepEqual(Object.keys(body).sort(), [
    "CANCEL",
    "CHANGE",
    "NEEDS_CHECK",
    "NEW_RESERVATION",
  ]);
  assert.equal(body.CANCEL, false);
});

// ── 서버 요청 ─────────────────────────────

const realFetch = globalThis.fetch;
const previousBase = process.env.NEXT_PUBLIC_API_BASE_URL;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (previousBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = previousBase;
});

/** 요청을 기록하고 정해 둔 응답을 돌려주는 가짜 서버 */
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

test("알림 목록: 로그인 토큰으로 최근 알림을 불러와 화면 모양으로 바꾼다", async () => {
  const calls = fakeServer(() => ({
    result: {
      content: [item(), item({ notificationId: 30, eventType: "CANCEL" })],
      page: 0,
      size: NOTIFICATION_PAGE_SIZE,
      totalElements: 2,
      totalPages: 1,
      isLast: true,
    },
  }));
  const res = await fetchNotificationsLive("tok");
  assert.equal(res.ok, true);
  assert.deepEqual(
    res.data.map((n) => [n.id, n.event]),
    [
      ["31", "NEEDS_CHECK"],
      ["30", "CANCEL"],
    ],
  );
  assert.equal(
    calls[0].url,
    `https://api.example.test/api/v1/owner/notifications?page=0&size=${NOTIFICATION_PAGE_SIZE}`,
  );
  assert.equal(calls[0].auth, "Bearer tok");
});

test("알림 목록 실패는 0건이 아니라 불러오기 실패로 돌려준다", async () => {
  fakeServer(() => ({ status: 500, code: "INTERNAL_ERROR" }));
  assert.deepEqual(await fetchNotificationsLive("tok"), {
    ok: false,
    code: "LOAD_FAILED",
  });
});

test("읽음 처리: POST로 보내고, 다른 업체 알림(404)은 NOT_FOUND", async () => {
  const calls = fakeServer((c) =>
    c.url.endsWith("/31/read")
      ? { result: item({ readAt: "2026-11-21T10:05:00+09:00" }) }
      : { status: 404, code: "NOTIFICATION_NOT_FOUND" },
  );
  const ok = await markNotificationReadLive("tok", "31");
  assert.equal(ok.ok, true);
  assert.notEqual(ok.data.readAt, null);
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(await markNotificationReadLive("tok", "99"), {
    ok: false,
    code: "NOT_FOUND",
  });
});

test("수신 설정: 불러오기·저장이 서버 설정을 쓴다", async () => {
  const calls = fakeServer((c) =>
    c.method === "PUT"
      ? { result: c.body }
      : {
          result: {
            NEW_RESERVATION: true,
            NEEDS_CHECK: true,
            CHANGE: false,
            CANCEL: true,
          },
        },
  );
  const loaded = await fetchNotificationPrefsLive("tok");
  assert.equal(loaded.data.CHANGE, false);
  const saved = await saveNotificationPrefsLive("tok", {
    ...loaded.data,
    CANCEL: false,
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.data.CANCEL, false);
  assert.equal(calls[1].method, "PUT");
  assert.equal(Object.keys(calls[1].body).length, 4);
});

test("수신 설정 저장 실패는 SAVE_FAILED (화면은 선택을 그대로 둔다)", async () => {
  fakeServer(() => ({ status: 502, code: "BAD_GATEWAY" }));
  const res = await saveNotificationPrefsLive("tok", {
    NEW_RESERVATION: true,
    NEEDS_CHECK: true,
    CHANGE: true,
    CANCEL: true,
  });
  assert.deepEqual(res, { ok: false, code: "SAVE_FAILED" });
});

test("푸시: 서버에 키가 없으면(503) UNAVAILABLE, 구독 정보 거절(400)은 INVALID", async () => {
  fakeServer(() => ({ status: 503, code: "PUSH_UNAVAILABLE" }));
  assert.deepEqual(await fetchPushPublicKeyLive("tok"), {
    ok: false,
    code: "UNAVAILABLE",
  });
  fakeServer(() => ({ status: 400, code: "INVALID_INPUT" }));
  assert.deepEqual(
    await subscribePushLive("tok", {
      endpoint: "https://evil.example/x",
      keys: { p256dh: "a", auth: "b" },
    }),
    { ok: false, code: "INVALID" },
  );
});

test("푸시: 공개키를 받고, 구독 등록은 POST·해제는 DELETE로 endpoint를 보낸다", async () => {
  const calls = fakeServer((c) =>
    c.url.endsWith("/push/public-key")
      ? { result: { publicKey: "BEl62iUYgUivxIkv69yViEuiBIa" } }
      : { result: null },
  );
  const key = await fetchPushPublicKeyLive("tok");
  assert.deepEqual(key, { ok: true, data: "BEl62iUYgUivxIkv69yViEuiBIa" });
  const body = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "p", auth: "a" },
    userAgent: "Chrome / Android",
  };
  assert.equal((await subscribePushLive("tok", body)).ok, true);
  assert.equal((await unsubscribePushLive("tok", body.endpoint)).ok, true);
  assert.equal(calls[1].method, "POST");
  assert.deepEqual(calls[1].body, body);
  assert.equal(calls[2].method, "DELETE");
  assert.deepEqual(calls[2].body, { endpoint: body.endpoint });
  assert.ok(calls.every((c) => c.auth === "Bearer tok"));
});

// ── 브라우저 지원 판단 ─────────────────────────────

const env = (over = {}) => ({
  userAgent:
    "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36",
  standalone: false,
  hasNotification: true,
  hasServiceWorker: true,
  hasPushManager: true,
  permission: "default",
  ...over,
});

test("브라우저 상태: iPhone은 홈 화면 앱에서만, 미지원·권한 상태를 구분한다", () => {
  assert.equal(pushStateOf(env()), "default");
  assert.equal(pushStateOf(env({ permission: "denied" })), "denied");
  assert.equal(pushStateOf(env({ hasPushManager: false })), "UNSUPPORTED");
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1";
  assert.equal(pushStateOf(env({ userAgent: iphone })), "NEEDS_INSTALL");
  assert.equal(
    pushStateOf(
      env({ userAgent: iphone, standalone: true, permission: "granted" }),
    ),
    "granted",
  );
});

test("공개키(base64url)를 바이트로 바꾸고, 기기 이름을 짧게 만든다", () => {
  assert.deepEqual([...base64UrlToBytes("AQID_-8")], [1, 2, 3, 255, 239]);
  assert.equal(deviceLabel(env().userAgent), "Chrome / Android");
  assert.equal(
    deviceLabel("Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Edg/130.0"),
    "Edge / Windows",
  );
});
