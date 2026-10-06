import assert from "node:assert/strict";
import { afterEach, test, mock } from "node:test";
import { ApiError, requestApi } from "../src/lib/api.ts";

const previousBase = process.env.NEXT_PUBLIC_API_BASE_URL;
afterEach(() => {
  mock.restoreAll();
  if (previousBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = previousBase;
});

function respond(body, status = 200) {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";
  return mock.method(globalThis, "fetch", async () =>
    Response.json(body, { status }),
  );
}

test("백엔드 성공 응답의 result를 반환한다", async () => {
  respond({
    success: true,
    code: "OK",
    message: "요청 성공",
    result: { id: 1 },
  });
  assert.deepEqual(await requestApi("/api/test"), { id: 1 });
});

test("검증 오류의 HTTP 상태·코드·필드 정보를 유지한다", async () => {
  const errors = [{ field: "address", reason: "필수 항목입니다" }];
  respond(
    {
      success: false,
      code: "INVALID_INPUT",
      message: "입력 오류",
      result: errors,
    },
    400,
  );
  await assert.rejects(requestApi("/api/test"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.code, "INVALID_INPUT");
    assert.deepEqual(error.result, errors);
    return true;
  });
});

test("응답 규격이 다른 health 응답을 성공으로 오인하지 않는다", async () => {
  respond({ status: "UP" });
  await assert.rejects(requestApi("/actuator/health"), {
    code: "INVALID_RESPONSE",
  });
});

test("JSON이 아닌 서버 오류를 안전하게 처리한다", async () => {
  respond(null);
  mock.restoreAll();
  mock.method(
    globalThis,
    "fetch",
    async () => new Response("<html>error</html>", { status: 502 }),
  );
  await assert.rejects(requestApi("/api/test"), {
    status: 502,
    code: "INVALID_RESPONSE",
  });
});

test("FormData의 Content-Type은 브라우저에 맡기고 캐시를 끈다", async () => {
  const fetchMock = respond({
    success: true,
    code: "OK",
    message: "요청 성공",
    result: null,
  });
  const data = new FormData();
  data.set("photo", new Blob(["test"]), "photo.txt");
  await requestApi("/api/test", { method: "POST", body: data });
  const options = fetchMock.mock.calls[0].arguments[1];
  assert.equal(options.headers.has("Content-Type"), false);
  assert.equal(options.cache, "no-store");
});

test("다른 서버로 요청하지 않는다", async () => {
  const fetchMock = respond({
    success: true,
    code: "OK",
    message: "요청 성공",
    result: null,
  });
  await assert.rejects(requestApi("//other.example/api/test"));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("네트워크 오류와 요청 취소를 숨기거나 재시도하지 않는다", async () => {
  respond(null);
  mock.restoreAll();
  const error = new DOMException("취소", "AbortError");
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    throw error;
  });
  await assert.rejects(requestApi("/api/test"), (caught) => caught === error);
  assert.equal(fetchMock.mock.callCount(), 1);
});
