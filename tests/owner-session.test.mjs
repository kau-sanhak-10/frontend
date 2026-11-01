import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import {
  getSessionSnapshot,
  msUntilExpiry,
  subscribeSession,
} from "../src/lib/owner-auth/session.ts";

// 브라우저 없이 구독 동작을 확인하기 위한 최소한의 window·document·localStorage
const KEY = "ilro.owner.mockSession";
const START = 1_000_000;
let store;

function sessionRaw(expiresAt) {
  return JSON.stringify({
    name: "김사장",
    loginPhone: "01011112222",
    businessName: "한빛 보일러",
    businessPhone: "0319001234",
    expiresAt,
  });
}

beforeEach(() => {
  store = new Map();
  const win = new EventTarget();
  win.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  const doc = new EventTarget();
  doc.visibilityState = "visible";
  globalThis.window = win;
  globalThis.document = doc;
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: START });
});

afterEach(() => {
  mock.timers.reset();
  delete globalThis.window;
  delete globalThis.document;
});

test("만료까지 남은 시간을 계산한다", () => {
  assert.equal(msUntilExpiry(sessionRaw(START + 5_000), START), 5_000);
  assert.equal(msUntilExpiry(sessionRaw(START), START), null);
  assert.equal(msUntilExpiry(null, START), null);
});

test("페이지를 켜 둔 채 만료 시각이 지나면 구독자에게 알린다", () => {
  store.set(KEY, sessionRaw(START + 5_000));
  let calls = 0;
  const unsubscribe = subscribeSession(() => (calls += 1));

  mock.timers.tick(4_999);
  assert.equal(calls, 0);
  assert.notEqual(getSessionSnapshot(), "expired");

  mock.timers.tick(2);
  assert.equal(calls, 1);
  assert.equal(getSessionSnapshot(), "expired");
  unsubscribe();
});

test("다른 앱·탭에서 돌아오면 다시 확인한다", () => {
  store.set(KEY, sessionRaw(START + 60_000));
  let calls = 0;
  const unsubscribe = subscribeSession(() => (calls += 1));

  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("focus"));
  assert.equal(calls, 2);
  unsubscribe();
});

test("구독을 끊으면 만료 알림도 멈춘다", () => {
  store.set(KEY, sessionRaw(START + 5_000));
  let calls = 0;
  const unsubscribe = subscribeSession(() => (calls += 1));
  unsubscribe();
  mock.timers.tick(10_000);
  assert.equal(calls, 0);
});

test("로그인하지 않은 상태에서는 만료 타이머를 걸지 않는다", () => {
  let calls = 0;
  const unsubscribe = subscribeSession(() => (calls += 1));
  mock.timers.tick(60 * 60 * 1000);
  assert.equal(calls, 0);
  unsubscribe();
});
