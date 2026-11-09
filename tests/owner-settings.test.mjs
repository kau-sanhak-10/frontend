import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import {
  validateBooking,
  validateBusiness,
  validateWorkTypes,
  validateServiceAreas,
  missingAutoBookingSetup,
  isSettingsSectionDirty,
  refreshSettingsDraft,
} from "../src/lib/owner-settings.ts";
import {
  getBusiness,
  saveBusiness,
  saveBookingSettings,
  saveWorkTypes,
  setAutoBooking,
  setIntakePaused,
} from "../src/lib/owner-settings-api.ts";
import {
  requestOwnerVerification,
  confirmOwnerVerification,
  getOwnerMe,
  saveOwnerName,
  logoutOwner,
} from "../src/lib/owner-auth/api.ts";

const previousBase = process.env.NEXT_PUBLIC_API_BASE_URL;
afterEach(() => {
  mock.restoreAll();
  if (previousBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = previousBase;
});
const business = {
  businessName: "확인용 업체",
  contactPhone: null,
  address: null,
  lat: null,
  lng: null,
  customerNotice: null,
  serviceDescription: null,
};
const booking = {
  businessHours: Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i + 1,
    openTime: i < 5 ? "09:00" : null,
    closeTime: i < 5 ? "18:00" : null,
    isClosed: i > 4,
  })),
  lunchStart: "12:00",
  lunchEnd: "13:00",
  maxDailyVisits: null,
  bufferMinutes: 0,
  travelMode: "CAR",
  autoBookingEnabled: false,
};
const workTypes = [
  {
    workCategory: "REPAIR",
    isActive: true,
    durationMinutes: 60,
    autoBookingAllowed: true,
  },
];
function response(result, status = 200, code = "OK") {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";
  return mock.method(globalThis, "fetch", async () =>
    Response.json(
      { success: status < 400, code, message: "확인용 응답", result },
      { status },
    ),
  );
}
test("영업시간 7일·점심 구간·방문 한도·여유시간 경계를 검사한다", () => {
  assert.deepEqual(validateBooking(booking), {});
  assert.ok(
    validateBooking({
      ...booking,
      businessHours: booking.businessHours.slice(0, 6),
    }).businessHours,
  );
  assert.ok(
    validateBooking({
      ...booking,
      businessHours: booking.businessHours.map((h) => ({ ...h, dayOfWeek: 1 })),
    }).businessHours,
  );
  assert.ok(validateBooking({ ...booking, lunchEnd: "08:00" }).lunchEnd);
  assert.ok(validateBooking({ ...booking, lunchStart: null }).lunchEnd);
  assert.ok(
    validateBooking({ ...booking, lunchStart: "08:00", lunchEnd: "09:00" })
      .lunchEnd,
  );
  for (const value of [0, -1, 1.5, NaN, Infinity])
    assert.ok(
      validateBooking({ ...booking, maxDailyVisits: value }).maxDailyVisits,
    );
  for (const value of [-1, 1441, 0.5])
    assert.ok(
      validateBooking({ ...booking, bufferMinutes: value }).bufferMinutes,
    );
  assert.deepEqual(
    validateBooking({
      ...booking,
      lunchStart: null,
      lunchEnd: null,
      maxDailyVisits: 1,
      bufferMinutes: 1440,
    }),
    {},
  );
});
test("작업 제공과 자동 예약 허용을 구분하고 잘못된 시간·중복을 막는다", () => {
  assert.deepEqual(validateWorkTypes(workTypes), {});
  assert.ok(
    validateWorkTypes([{ ...workTypes[0], isActive: false }])[
      "workTypes[0].autoBookingAllowed"
    ],
  );
  for (const value of [0, -1, 1.5, 1441])
    assert.ok(
      validateWorkTypes([{ ...workTypes[0], durationMinutes: value }])[
        "workTypes[0].durationMinutes"
      ],
    );
  assert.ok(validateWorkTypes([...workTypes, ...workTypes]).workTypes);
});
test("업체 기본정보와 검색 결과의 주소·좌표·지역을 함께 검증한다", () => {
  assert.deepEqual(validateBusiness(business), {});
  assert.ok(validateBusiness({ ...business, businessName: " " }).businessName);
  assert.ok(validateBusiness({ ...business, address: "주소만 입력" }).address);
  assert.ok(validateBusiness({ ...business, lat: 37 }).address);
  assert.deepEqual(
    validateBusiness({
      ...business,
      address: "확인용 출발지",
      lat: 37,
      lng: 127,
    }),
    {},
  );
  assert.ok(
    validateServiceAreas([
      { regionCode: "12345", regionName: "예시 지역" },
      { regionCode: "12345", regionName: "중복" },
    ]).serviceAreas,
  );
});
test("자동 예약의 필수 설정은 저장된 정보로 확인하고 접수 중지와 분리한다", () => {
  const data = {
    business,
    booking,
    workTypes,
    serviceAreas: [],
    intakePaused: false,
  };
  assert.deepEqual(missingAutoBookingSetup(data), ["방문지역", "출발지 주소"]);
  assert.deepEqual(
    missingAutoBookingSetup({
      ...data,
      business: { ...business, address: "출발지", lat: 37, lng: 127 },
      serviceAreas: [{ regionCode: "12345", regionName: "예시" }],
    }),
    [],
  );
});
test("대표 연락처는 구분자를 빼고 서버와 같은 번호 형식을 검사한다", () => {
  for (const contactPhone of ["0-------", "02-1234", "1234-5678"])
    assert.ok(validateBusiness({ ...business, contactPhone }).contactPhone);
  for (const contactPhone of [
    null,
    "010-1234-5678",
    "02-123-4567",
    "1588-1234",
  ])
    assert.deepEqual(validateBusiness({ ...business, contactPhone }), {});
});
test("저장 응답은 수정하지 않은 설정에 반영하고 다른 미저장 입력은 남긴다", () => {
  const previous = {
    business,
    booking,
    workTypes,
    serviceAreas: [],
    intakePaused: false,
  };
  const draft = {
    ...previous,
    business: { ...business, businessName: "내 입력" },
    workTypes: [{ ...workTypes[0], durationMinutes: 90 }],
    intakePaused: true,
  };
  const saved = {
    ...previous,
    business: { ...business, businessName: "서버 저장값" },
    booking: { ...booking, bufferMinutes: 20, autoBookingEnabled: true },
    serviceAreas: [{ regionCode: "12345", regionName: "서버 방문지역" }],
  };
  const refreshed = refreshSettingsDraft("business", draft, previous, saved);
  assert.deepEqual(refreshed, {
    ...saved,
    workTypes: draft.workTypes,
    intakePaused: true,
  });
  assert.equal(isSettingsSectionDirty("hours", refreshed, saved), false);
  assert.equal(isSettingsSectionDirty("work", refreshed, saved), true);

  const hours = { ...draft, booking: { ...booking, bufferMinutes: 35 } };
  assert.deepEqual(
    refreshSettingsDraft("business", hours, previous, saved).booking,
    { ...saved.booking, bufferMinutes: 35 },
  );
});
test("설정 저장은 own 토큰 헤더와 정확한 DTO만 보내며 상태 변경을 분리한다", async () => {
  let fetch = response(booking);
  await saveBookingSettings("own_test", booking);
  let options = fetch.mock.calls[0].arguments[1];
  assert.equal(
    new Headers(options.headers).get("Authorization"),
    "Bearer own_test",
  );
  assert.equal(JSON.parse(options.body).autoBookingEnabled, undefined);
  mock.restoreAll();
  fetch = response({ autoBookingEnabled: true });
  await setAutoBooking("own_test", true);
  assert.match(
    String(fetch.mock.calls[0].arguments[0]),
    /booking-settings\/auto-booking$/,
  );
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), {
    enabled: true,
  });
  mock.restoreAll();
  fetch = response({ intakePaused: true });
  await setIntakePaused("own_test", true);
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), {
    intakePaused: true,
  });
});
test("잘못된 입력·가짜 세션은 요청하지 않으며 오류·만료를 성공으로 바꾸지 않는다", async () => {
  const fetch = response(business);
  assert.throws(() =>
    saveBusiness("own_test", { ...business, address: "임의 주소" }),
  );
  assert.throws(() =>
    saveWorkTypes("own_test", [{ ...workTypes[0], durationMinutes: 0 }]),
  );
  await assert.rejects(getBusiness("mock-session"));
  assert.equal(fetch.mock.callCount(), 0);
  mock.restoreAll();
  response(null, 401, "TOKEN_EXPIRED");
  await assert.rejects(getBusiness("own_test"), {
    status: 401,
    code: "TOKEN_EXPIRED",
  });
  mock.restoreAll();
  response({ businessName: "빠진 응답" });
  await assert.rejects(getBusiness("own_test"));
});
test("문자 인증·로그인·계정 수정·로그아웃은 실제 계약으로 호출하고 원문 번호 형식은 유지한다", async () => {
  let fetch = response({
    verificationId: 1,
    expiresAt: "2030-01-01T00:05:00Z",
    resendAvailableAt: "2030-01-01T00:01:00Z",
  });
  await requestOwnerVerification("010-1234-5678");
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), {
    purpose: "OWNER_LOGIN",
    phone: "010-1234-5678",
  });
  mock.restoreAll();
  response({
    purpose: "CUSTOMER_VERIFY",
    accessToken: "cus_test",
    expiresAt: "2030-01-01T00:05:00Z",
    owner: {
      ownerId: 1,
      businessName: "예시",
      approvalStatus: "APPROVED",
      status: "ACTIVE",
    },
  });
  await assert.rejects(confirmOwnerVerification(1, "123456"));
  const me = {
    ownerId: 1,
    businessName: "예시",
    ownerName: "확인용",
    phone: "01012345678",
    approvalStatus: "APPROVED",
    status: "ACTIVE",
    autoBookingEnabled: false,
    intakePaused: false,
  };
  mock.restoreAll();
  fetch = response(me);
  await getOwnerMe("own_test");
  await saveOwnerName("own_test", " 수정 ");
  assert.deepEqual(JSON.parse(fetch.mock.calls[1].arguments[1].body), {
    ownerName: "수정",
  });
  mock.restoreAll();
  fetch = response(null);
  await logoutOwner("own_test");
  assert.match(String(fetch.mock.calls[0].arguments[0]), /auth\/logout$/);
});
