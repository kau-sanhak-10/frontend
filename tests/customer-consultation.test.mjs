import assert from "node:assert/strict";
import { test, afterEach, mock } from "node:test";
import {
  createClientId,
  validatePhoto,
  fieldText,
  consultationError,
} from "../src/lib/customer-consultation.ts";
import {
  createCustomerInquiry,
  createCustomerPhotoUploader,
  getCustomerIntake,
  getCustomerInquiryVersion,
  getCustomerMessages,
  isWaitingForOwner,
  requestCustomerHandoff,
  saveCustomerVisitInfo,
  sendCustomerMessage,
} from "../src/lib/customer-api.ts";
import { isVisitDemoLink } from "../src/lib/customer-visit-demo.ts";

test("방문 시연은 지정된 테스트 링크와 개발 서버에서만 열린다", () => {
  const link = "demo".padEnd(43, "0");
  const dev = "https://dev-api.illo.ai.kr";
  assert.equal(isVisitDemoLink(link, link, dev), true);
  assert.equal(isVisitDemoLink(link, link, "http://127.0.0.1:35112"), true);
  assert.equal(isVisitDemoLink(link, undefined, dev), false);
  assert.equal(isVisitDemoLink(link, "other".padEnd(43, "0"), dev), false);
  assert.equal(isVisitDemoLink("invalid", "invalid", dev), false);
  for (const url of [undefined, "https://api.illo.ai.kr", `${dev}.example`]) {
    assert.equal(isVisitDemoLink(link, link, url), false);
  }
});

test("사장님 확인은 동일 문의의 서버 상태로만 판정한다", async () => {
  const signal = new AbortController().signal;
  respond({ inquiryId: 10, status: "COLLECTING" });
  assert.equal(await isWaitingForOwner(10, "inq_test", signal), false);
  respond({ inquiryId: 10, status: "OWNER_CHECK" });
  assert.equal(await isWaitingForOwner(10, "inq_test", signal), true);
  respond({ inquiryId: 11, status: "OWNER_CHECK" });
  await assert.rejects(
    isWaitingForOwner(10, "inq_test", signal),
    /Invalid inquiry status/,
  );
});

test("짧은 Dev 업체 링크는 지정된 시연 경로에서만 조회한다", async () => {
  const link = "dev-test-qa";
  const dev = "https://dev-api.illo.ai.kr";
  process.env.NEXT_PUBLIC_API_BASE_URL = dev;
  const fetchMock = mock.method(globalThis, "fetch", async () =>
    Response.json({
      success: true,
      code: "OK",
      message: "OK",
      result: {
        businessName: "테스트 업체",
        contactPhone: "01000000000",
        workCategories: [],
        intakeAvailable: true,
        termsVersion: "v1",
      },
    }),
  );
  await assert.rejects(getCustomerIntake(link), /Invalid intake link/);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(isVisitDemoLink(link, link, dev), true);
  assert.equal(isVisitDemoLink(link, "dev-test-other", dev), false);
  assert.equal(isVisitDemoLink(link, link, "https://api.illo.ai.kr"), false);
  assert.equal(isVisitDemoLink("dev-test-../qa", "dev-test-../qa", dev), false);
  const { business, available } = await getCustomerIntake(
    link,
    undefined,
    true,
  );
  assert.equal(business.name, "테스트 업체");
  assert.equal(available, true);
  assert.equal(
    fetchMock.mock.calls[0].arguments[0].href,
    `${dev}/api/v1/public/intake/${link}`,
  );
});

const previousBase = process.env.NEXT_PUBLIC_API_BASE_URL;
afterEach(() => {
  mock.restoreAll();
  if (previousBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = previousBase;
});

test("사진 업로드 완료 응답이 끊겨도 같은 티켓으로 완료만 다시 확인한다", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://dev-api.illo.ai.kr";
  const signed = "https://demo.s3.ap-northeast-2.amazonaws.com/test.png";
  const reply = (result) =>
    Response.json({ success: true, code: "OK", message: "OK", result });
  const calls = [];
  const file = new File(["test"], "photo.png", { type: "image/png" });
  mock.method(globalThis, "fetch", async (url, options) => {
    calls.push([url.href, options.method]);
    const headers = new Headers(options.headers);
    if (url.href === signed) {
      assert.equal(headers.get("Authorization"), null);
      assert.equal(headers.get("Content-Type"), "image/png");
      assert.equal(options.body, file);
      return new Response(null, { status: 200 });
    }
    assert.equal(headers.get("Authorization"), "Bearer inq_test");
    if (url.pathname.endsWith("/photos")) {
      assert.deepEqual(JSON.parse(options.body), {
        contentType: "image/png",
        sizeBytes: 4,
      });
      return reply({
        photoId: 12,
        method: "PUT",
        uploadUrl: signed,
        headers: { "content-type": "image/png" },
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });
    }
    if (calls.length === 3) throw new TypeError("Connection lost");
    return reply({ photoId: 12, uploadStatus: "DONE" });
  });
  const upload = createCustomerPhotoUploader(1, "inq_test");
  await assert.rejects(upload(file), /Connection lost/);
  assert.deepEqual(await upload(file), { photoId: 12 });
  assert.deepEqual(
    calls.map(([, method]) => method),
    ["POST", "PUT", "POST", "POST"],
  );
  assert.deepEqual(calls[2], calls[3]);
});

test("고객 사진 단독 메시지는 조회에서 빠지지 않는다", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://dev-api.illo.ai.kr";
  mock.method(globalThis, "fetch", async () =>
    Response.json({
      success: true,
      code: "OK",
      message: "OK",
      result: {
        hasMore: false,
        messages: [
          {
            messageId: 5,
            sender: "CUSTOMER",
            content: null,
            deliveryStatus: "SENT",
            photoIds: [12],
          },
        ],
      },
    }),
  );
  const { messages, cursor } = await getCustomerMessages(
    1,
    "inq_test",
    0,
    AbortSignal.timeout(1000),
  );
  assert.deepEqual(messages, [
    { id: "5", role: "CUSTOMER", content: "", photoIds: [12] },
  ]);
  assert.equal(cursor, 5);
});

test("HTTP 휴대폰 접속처럼 randomUUID가 없어도 고유한 UUID v4를 만든다", () => {
  const originalCrypto = globalThis.crypto;
  mock.getter(globalThis, "crypto", () => ({
    getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
  }));
  const ids = Array.from({ length: 100 }, () => createClientId());
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
});
test("사진은 10장·10,000,000바이트까지이며 JPG·PNG만 허용한다", () => {
  assert.equal(
    validatePhoto({ type: "image/jpeg", size: 10_000_000 }, 9),
    undefined,
  );
  for (const [file, count] of [
    [{ type: "image/jpeg", size: 10_000_001 }, 0],
    [{ type: "image/png", size: 1 }, 10],
    [{ type: "image/heic", size: 20 }, 0],
    [{ type: "image/png", size: 0 }, 0],
  ])
    assert.ok(validatePhoto(file, count));
});
test("미확인·충돌 값은 추측해 표시하지 않고 매뉴얼 출처도 구분한다", () => {
  const field = {
    key: "model",
    label: "모델명",
    value: "guess",
    source: "PHOTO",
    status: "UNCONFIRMED",
  };
  assert.equal(fieldText(field), "미확인");
  assert.equal(fieldText({ ...field, status: "CONFLICT" }), "정보 확인 필요");
  assert.equal(fieldText({ ...field, status: "CONFIRMED" }), "guess");
  assert.equal(
    fieldText({ ...field, status: "CONFIRMED", value: null }),
    "미확인",
  );
});
test("만료·발송 제한·통신 실패의 안내는 입력 보존과 복구를 설명한다", () => {
  assert.match(consultationError({ code: "TOKEN_EXPIRED" }), /본인 확인/);
  assert.match(consultationError({ code: "TOO_MANY_REQUESTS" }), /기다려/);
  assert.match(consultationError(new Error("secret")), /다시 시도/);
  assert.doesNotMatch(consultationError(new Error("secret")), /secret/);
});
function respond(result) {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";
  return mock.method(globalThis, "fetch", async () =>
    Response.json({ success: true, code: "OK", message: "성공", result }),
  );
}
test("상담 생성은 필수 동의와 버전을 전달하고 문의 토큰을 반환한다", async () => {
  const fetch = respond({
    inquiryId: 10,
    inquiryToken: "inq_test",
    expiresAt: "2030-01-01T00:00:00Z",
  });
  const result = await createCustomerInquiry("link/value", [
    { type: "PRIVACY_REQUIRED", termsVersion: "v1" },
  ]);
  assert.equal(result.inquiryId, 10);
  assert.match(String(fetch.mock.calls[0].arguments[0]), /link%2Fvalue/);
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), {
    consents: [{ type: "PRIVACY_REQUIRED", termsVersion: "v1" }],
  });
});
test("메시지는 같은 clientMsgId·사진 ID와 토큰 헤더로 전송한다", async () => {
  const fetch = respond({
    messageId: 11,
    deliveryStatus: "SENT",
    aiStatus: "PROCESSING",
  });
  const input = {
    clientMsgId: "stable-id",
    content: "온수가 안 나와요",
    photoIds: [3],
  };
  await sendCustomerMessage(10, "inq_test", input);
  const options = fetch.mock.calls[0].arguments[1];
  assert.equal(
    new Headers(options.headers).get("Authorization"),
    "Bearer inq_test",
  );
  assert.deepEqual(JSON.parse(options.body), input);
  assert.ok(!String(fetch.mock.calls[0].arguments[0]).includes("inq_test"));
});
test("사진만 전송할 때 빈 본문을 서버에 null로 보낸다", async () => {
  const fetch = respond({
    messageId: 11,
    deliveryStatus: "SENT",
    aiStatus: "PROCESSING",
  });
  await sendCustomerMessage(10, "inq_test", {
    clientMsgId: "photo-only",
    content: "  ",
    photoIds: [3],
  });
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), {
    clientMsgId: "photo-only",
    content: null,
    photoIds: [3],
  });
});
test("직접 상담은 문의 토큰으로 Spring에 요청하고 성공한 상태만 안내한다", async () => {
  const fetch = respond({ handoffId: 3, status: "WAITING" });
  await requestCustomerHandoff(10, "inq_test");
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.match(String(url), /\/customer\/inquiries\/10\/handoff-requests$/);
  assert.equal(options.method, "POST");
  assert.equal(
    new Headers(options.headers).get("Authorization"),
    "Bearer inq_test",
  );
  respond({ handoffId: 3, status: "DONE" });
  await assert.rejects(
    requestCustomerHandoff(10, "inq_test"),
    /Invalid handoff response/,
  );
});
test("입력·권한 정보가 잘못되면 요청하지 않고 잘못된 성공 응답을 거절한다", async () => {
  const fetch = respond({});
  await assert.rejects(createCustomerInquiry("x", []));
  await assert.rejects(
    sendCustomerMessage(-1, "token", {
      clientMsgId: "a",
      content: "test",
      photoIds: [],
    }),
  );
  assert.equal(fetch.mock.callCount(), 0);
  await assert.rejects(
    createCustomerInquiry("x", [
      { type: "PRIVACY_REQUIRED", termsVersion: "v1" },
    ]),
  );
  await assert.rejects(
    sendCustomerMessage(1, "token", {
      clientMsgId: "a",
      content: "test",
      photoIds: [],
    }),
  );
  assert.equal(fetch.mock.callCount(), 2);
});

test("방문정보는 같은 문의에 버전과 검증된 좌표로 저장하고 다른 문의 응답을 거절한다", async () => {
  const fetch = respond({ inquiryId: 10, version: 3 });
  const version = await getCustomerInquiryVersion(10, "inq_test");
  const visit = {
    name: " 테스트 ",
    phone: "010-1234-5678",
    address: " 테스트 주소 ",
    addressDetail: " ",
    accessNote: "",
    workTypeId: "",
  };
  await assert.rejects(
    saveCustomerVisitInfo(10, "inq_test", version, visit, {
      lat: NaN,
      lng: 127,
    }),
  );
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(
    await saveCustomerVisitInfo(10, "inq_test", version, visit, {
      lat: 37,
      lng: 127,
    }),
    3,
  );
  const [url, request] = fetch.mock.calls[1].arguments;
  assert.equal(
    new URL(url).pathname,
    "/api/v1/customer/inquiries/10/visit-info",
  );
  assert.equal(request.method, "PUT");
  assert.equal(
    new Headers(request.headers).get("Authorization"),
    "Bearer inq_test",
  );
  assert.deepEqual(JSON.parse(request.body), {
    version: 3,
    name: "테스트",
    phone: "01012345678",
    address: "테스트 주소",
    addressDetail: null,
    lat: 37,
    lng: 127,
    accessNote: null,
    workCategory: null,
  });
  await assert.rejects(getCustomerInquiryVersion(11, "inq_test"));
});
