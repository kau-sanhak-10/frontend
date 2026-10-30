import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  countByTab,
  displayValue,
  filterByTab,
  groupOf,
  needsOwnerCheck,
  onlyBusiness,
  todayVisits,
} from "../src/lib/owner-inquiries/rules.ts";
import {
  fetchInquiries,
  fetchInquiryDetail,
  fetchIntakeLink,
  mockBusinessIdOf,
  mockInquiryConfig,
} from "../src/lib/owner-inquiries/mock-api.ts";

// 10.20 오전 11시를 '지금'으로 고정합니다.
const NOW = new Date(2026, 9, 20, 11, 0).getTime();
const HANBIT = mockBusinessIdOf("01011112222");

beforeEach(() => {
  mockInquiryConfig.delayMs = 0;
  mockInquiryConfig.fail = false;
  mockInquiryConfig.now = () => NOW;
});

async function hanbitInquiries() {
  const res = await fetchInquiries(HANBIT);
  assert.equal(res.ok, true);
  return res.data;
}

test("로그인 번호로 목업 업체를 찾는다", () => {
  assert.equal(HANBIT, "biz-hanbit");
  assert.equal(mockBusinessIdOf("01099998888"), null);
});

test("다른 업체 문의는 목록과 상세에 나오지 않는다", async () => {
  const list = await hanbitInquiries();
  assert.ok(list.every((i) => i.businessId === HANBIT));
  assert.ok(!list.some((i) => i.id === "inq-901"));

  const other = await fetchInquiryDetail(HANBIT, "inq-901");
  assert.deepEqual(other, { ok: false, code: "NOT_FOUND" });

  const mixed = [...list, { ...list[0], id: "x", businessId: "biz-other" }];
  assert.equal(onlyBusiness(mixed, HANBIT).length, list.length);
});

test("참고정보만 미확인인 문의는 확인 필요로 세지 않는다", async () => {
  const list = await hanbitInquiries();
  const modelUnknown = list.find((i) => i.id === "inq-106");
  assert.deepEqual(modelUnknown.unconfirmedLabels, ["모델명"]);
  assert.equal(needsOwnerCheck(modelUnknown), false);
  assert.equal(groupOf(modelUnknown), "RESERVED");
});

test("확인 필요는 서버가 사유와 함께 준 문의만 센다", () => {
  const base = {
    id: "a",
    businessId: HANBIT,
    customerLabel: "고객",
    title: "제목",
    receivedAt: NOW,
    note: "",
    unconfirmedLabels: [],
  };
  assert.equal(
    needsOwnerCheck({
      ...base,
      status: "OWNER_CHECK",
      ownerCheckReason: "SAFETY",
    }),
    true,
  );
  // 사유가 없는 OWNER_CHECK는 잘못된 값이라 확인 필요로 보지 않는다.
  const noReason = { ...base, status: "OWNER_CHECK" };
  assert.equal(needsOwnerCheck(noReason), false);
  assert.equal(groupOf(noReason), "AI_INTAKE");
});

test("홈 건수와 접수함 탭 건수가 같은 기준이다", async () => {
  const list = await hanbitInquiries();
  const counts = countByTab(list);
  assert.deepEqual(counts, { ALL: 7, OWNER_CHECK: 2, IN_PROGRESS: 3 });
  assert.equal(filterByTab(list, "OWNER_CHECK").length, counts.OWNER_CHECK);
  assert.ok(filterByTab(list, "OWNER_CHECK").every(needsOwnerCheck));
  // 처리 완료와 예약 확정은 '처리 중' 탭에 들어가지 않는다.
  const inProgress = filterByTab(list, "IN_PROGRESS").map((i) => i.status);
  assert.ok(!inProgress.includes("COMPLETED"));
  assert.ok(!inProgress.includes("RESERVED"));
});

test("목록은 최근 접수가 위로 온다", async () => {
  const list = await hanbitInquiries();
  for (let i = 1; i < list.length; i += 1) {
    assert.ok(list[i - 1].receivedAt >= list[i].receivedAt);
  }
});

test("오늘 방문은 시작 시각 순이고 처리 완료는 빠진다", async () => {
  const list = await hanbitInquiries();
  const visits = todayVisits(list, NOW);
  assert.deepEqual(
    visits.map((v) => v.id),
    ["inq-106", "inq-101"],
  );
});

test("조회 실패를 0건으로 바꾸지 않는다", async () => {
  mockInquiryConfig.fail = true;
  assert.deepEqual(await fetchInquiries(HANBIT), {
    ok: false,
    code: "LOAD_FAILED",
  });
  assert.deepEqual(await fetchInquiryDetail(HANBIT, "inq-106"), {
    ok: false,
    code: "LOAD_FAILED",
  });
  assert.deepEqual(await fetchIntakeLink(HANBIT), {
    ok: false,
    code: "LOAD_FAILED",
  });
});

test("요약은 출처를 구분하고 읽지 못한 값은 미확인으로 보인다", async () => {
  const res = await fetchInquiryDetail(HANBIT, "inq-106");
  assert.equal(res.ok, true);
  const byKey = Object.fromEntries(res.data.summary.map((f) => [f.key, f]));

  assert.equal(byKey.model.state, "UNCONFIRMED");
  assert.equal(displayValue(byKey.model), "미확인");
  assert.ok(byKey.model.reason);

  // 매뉴얼 해석은 확인된 사실로 표시하지 않는다.
  assert.equal(byKey.expectedCause.source, "MANUAL");
  assert.equal(byKey.expectedCause.state, "INTERPRETATION");
  assert.equal(byKey.expectedCause.evidence.type, "MANUAL");

  assert.equal(byKey.errorCode.source, "PHOTO");
  assert.equal(byKey.errorCode.state, "CONFIRMED");
});

test("접수 링크는 업체별로 준비 상태를 알려준다", async () => {
  const ready = await fetchIntakeLink(HANBIT);
  assert.equal(ready.ok, true);
  assert.equal(ready.data.status, "READY");

  const notIssued = await fetchIntakeLink("biz-teunteun");
  assert.deepEqual(notIssued, { ok: true, data: { status: "NOT_ISSUED" } });
});
