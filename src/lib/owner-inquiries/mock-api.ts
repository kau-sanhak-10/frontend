// ⚠️ 개발용 가짜 API입니다. 실제 문의·예약·요약은 백엔드가 주며,
// FE-07에서 이 파일의 함수를 requestApi() 호출로 교체합니다.
// 함수 이름과 반환 형태를 유지하면 화면 코드는 바꾸지 않아도 됩니다.
//
// 목업 업체
// - 한빛 보일러 (로그인 010-1111-2222) : 문의 7건
// - 튼튼설비 : 문의 1건. 한빛 보일러 화면에 섞이면 안 됩니다.
import type {
  EditableFieldKey,
  FieldChange,
  Handler,
  HandlingResult,
  InquiryDetail,
  InquiryMessage,
  InquirySummary,
  IntakeLink,
  LoadResult,
  SaveResult,
  SummaryField,
} from "./types";
import { resumeBlockersOf } from "./rules.ts";

/**
 * 개발 화면 확인용 스위치. 주소 뒤에 붙이면 그 상태를 바로 볼 수 있습니다.
 * - ?mock=empty : 문의가 하나도 없는 상태 (B17)
 * - ?mock=fail  : 조회 실패
 * - ?mock=slow  : 3초 동안 불러오는 중
 * - ?mock=nolink : 운영이 아직 접수 링크를 발급하지 않은 상태 (B16)
 * - ?mock=summaryfail : 요약 실패 시에도 사진·대화를 조회
 * - ?mock=photos : 여러 첨부 사진 조회 (같은 예시 자산을 두 번 사용)
 * - ?mock=savefail : 접수 정보 저장 실패 (B-14)
 * - ?mock=conflict : 다른 곳에서 먼저 바뀌어 저장이 거절됨 (B-14)
 * - ?mock=handlingfail : 직접 응대·덕구 재개·문의 종료가 실패 (B-15·B-16)
 * - ?mock=sendfail : 사장님 답장 전송 실패 (B-15)
 * 개발 서버(npm run dev)에서만 동작하고 배포 화면에서는 무시합니다.
 */
export type DevMockMode =
  | "empty"
  | "fail"
  | "slow"
  | "nolink"
  | "summaryfail"
  | "photos"
  | "savefail"
  | "conflict"
  | "handlingfail"
  | "sendfail";

function devMockMode(): DevMockMode | null {
  if (process.env.NODE_ENV === "production") return null;
  if (typeof window === "undefined") return null;
  const mode = new URLSearchParams(window.location.search).get("mock");
  return mode === "empty" ||
    mode === "fail" ||
    mode === "slow" ||
    mode === "nolink" ||
    mode === "summaryfail" ||
    mode === "photos" ||
    mode === "savefail" ||
    mode === "conflict" ||
    mode === "handlingfail" ||
    mode === "sendfail"
    ? mode
    : null;
}

export const mockInquiryConfig = {
  /** 응답 지연(ms). 로딩 화면 확인용이며 테스트에서는 0으로 둡니다. */
  delayMs: 400,
  /** true면 조회가 실패합니다. 조회 실패 화면 확인용입니다. */
  fail: false,
  /** true면 저장이 실패합니다. 저장 실패 안내 확인용입니다. */
  saveFail: false,
  /** true면 직접 응대·재개·종료가 실패합니다. 전환 실패 안내 확인용입니다. */
  handlingFail: false,
  /** true면 답장 전송이 실패합니다. 전송 실패 표시 확인용입니다. */
  sendFail: false,
  now: () => Date.now(),
};

const HANBIT = "biz-hanbit";
const TEUNTEUN = "biz-teunteun";

/** 목업 로그인 번호 → 업체. 실제로는 서버가 로그인 토큰으로 업체를 정합니다. */
const BUSINESS_BY_LOGIN_PHONE: Record<string, string> = {
  "01011112222": HANBIT,
};

export function mockBusinessIdOf(loginPhone: string): string | null {
  return BUSINESS_BY_LOGIN_PHONE[loginPhone] ?? null;
}

const HOUR = 3_600_000;

/** 오늘 h시 m분 (목업 기준 시각) */
function todayAt(h: number, m = 0) {
  const d = new Date(mockInquiryConfig.now());
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

type BaseInquiry = Omit<
  InquiryDetail,
  "version" | "handler" | "closed" | "safetyFlag"
>;

function buildInquiries(): InquiryDetail[] {
  return baseInquiries().map((inquiry) =>
    applyMockState({
      ...inquiry,
      version: 1,
      // 목업 예시는 상태에서 응대 주체를 정합니다. 실제로는 서버가 handlerMode를 줍니다.
      handler: inquiry.status === "OWNER_HANDLING" ? "OWNER" : "AI",
      closed: inquiry.status === "COMPLETED",
      safetyFlag: inquiry.ownerCheckReason === "SAFETY",
    }),
  );
}

function baseInquiries(): BaseInquiry[] {
  const now = mockInquiryConfig.now();
  return [
    {
      id: "inq-101",
      businessId: HANBIT,
      customerLabel: "박○○",
      title: "보일러 점검",
      receivedAt: now - 26 * HOUR,
      status: "OWNER_CHECK",
      ownerCheckReason: "SCHEDULE_CHANGE",
      note: "고객이 방문시간 변경을 요청했어요. 확정 전까지 기존 예약은 유지돼요.",
      unconfirmedLabels: [],
      reservation: {
        startAt: todayAt(16),
        endAt: todayAt(17),
        address: "행신동 ○○빌라 3층",
        changeRequest: { requestedLabel: "내일 · 오후" },
      },
      customerDescription:
        "정기 점검 받고 싶어요. 오늘 말고 내일 오후가 좋아요.",
      summary: [
        field("manufacturer", "제조사", "귀뚜라미", "CUSTOMER"),
        field("symptom", "증상", "정기 점검", "CUSTOMER", true),
        field("address", "주소", "행신동 ○○빌라 3층", "CUSTOMER", true),
      ],
      summaryUpdatedAt: now - 2 * HOUR,
      photos: [],
      messages: [
        msg("m1", "CUSTOMER", now - 26 * HOUR, "정기 점검 받고 싶어요."),
        msg("m2", "CUSTOMER", now - 2 * HOUR, "오늘 말고 내일 오후가 좋아요."),
      ],
    },
    {
      id: "inq-102",
      businessId: HANBIT,
      customerLabel: "윤○○",
      title: "가스 냄새",
      receivedAt: now - 0.5 * HOUR,
      status: "OWNER_CHECK",
      ownerCheckReason: "SAFETY",
      note: "가스 냄새가 난다고 해서 덕구가 접수를 멈추고 안전 안내를 했어요.",
      unconfirmedLabels: [],
      customerDescription: "보일러 쪽에서 가스 냄새가 나요.",
      summary: [
        field("symptom", "증상", "가스 냄새", "CUSTOMER", true),
        field("address", "주소", "화정동 ○○아파트 201동", "CUSTOMER", true),
      ],
      summaryUpdatedAt: now - 0.5 * HOUR,
      photos: [],
      messages: [
        msg(
          "m1",
          "CUSTOMER",
          now - 0.5 * HOUR,
          "보일러 쪽에서 가스 냄새가 나요.",
        ),
        msg(
          "m2",
          "DUKGU",
          now - 0.5 * HOUR,
          "안전을 위해 가스 밸브를 잠그고 창문을 열어 주세요. 사장님께 바로 전달할게요.",
        ),
      ],
    },
    {
      id: "inq-103",
      businessId: HANBIT,
      customerLabel: "이○○",
      title: "누수 문의",
      receivedAt: now - 1 * HOUR,
      status: "AI_INTAKE",
      note: "덕구가 추가 사진을 요청했어요.",
      unconfirmedLabels: [],
      customerDescription: "보일러 아래에 물이 고여 있어요.",
      summary: [field("symptom", "증상", "보일러 하단 누수", "CUSTOMER", true)],
      summaryUpdatedAt: now - 1 * HOUR,
      photos: [],
      messages: [
        msg(
          "m1",
          "CUSTOMER",
          now - 1 * HOUR,
          "보일러 아래에 물이 고여 있어요.",
        ),
        msg(
          "m2",
          "DUKGU",
          now - 1 * HOUR,
          "물이 고인 곳과 보일러 아래쪽이 보이게 사진을 찍어 주실 수 있을까요?",
        ),
      ],
    },
    {
      id: "inq-104",
      businessId: HANBIT,
      customerLabel: "최○○",
      title: "난방 불량",
      receivedAt: now - 1.5 * HOUR,
      status: "AI_INTAKE",
      note: "증상과 주소를 확인하고 있어요.",
      unconfirmedLabels: [],
      customerDescription: "난방을 켜도 방이 안 따뜻해요.",
      summary: [field("symptom", "증상", "난방 불량", "CUSTOMER", true)],
      summaryUpdatedAt: now - 1.5 * HOUR,
      photos: [],
      messages: [
        msg(
          "m1",
          "CUSTOMER",
          now - 1.5 * HOUR,
          "난방을 켜도 방이 안 따뜻해요.",
        ),
      ],
    },
    {
      id: "inq-105",
      businessId: HANBIT,
      customerLabel: "정○○",
      title: "온수 온도 문제",
      receivedAt: now - 3 * HOUR,
      status: "OWNER_HANDLING",
      note: "사장님이 응대 중이에요. 덕구 자동 답변은 멈춰 있어요.",
      unconfirmedLabels: [],
      customerDescription: "온수가 미지근하게만 나와요.",
      summary: [
        field("symptom", "증상", "온수 미지근함", "CUSTOMER", true),
        field("address", "주소", "주엽동 ○○아파트 5동", "CUSTOMER", true),
      ],
      summaryUpdatedAt: now - 3 * HOUR,
      photos: [],
      messages: [
        msg("m1", "CUSTOMER", now - 3 * HOUR, "온수가 미지근하게만 나와요."),
        msg("m2", "OWNER", now - 2.5 * HOUR, "언제부터 그러셨나요?"),
      ],
    },
    {
      // 모델명을 못 읽었지만 참고정보라 확인 필요로 보내지 않는 예시 (10/26 기준)
      id: "inq-106",
      businessId: HANBIT,
      customerLabel: "김○○",
      title: "온수 작동 불량",
      receivedAt: todayAt(9, 42),
      status: "RESERVED",
      note: "방문 예약 확정. 모델명은 미확인이에요.",
      unconfirmedLabels: ["모델명"],
      thumbnailPhotoId: "p1",
      reservation: {
        startAt: todayAt(14),
        endAt: todayAt(15),
        address: "화정동 ○○아파트 102동",
      },
      customerDescription: "전원을 껐다 켜도 온수가 나오지 않아요.",
      summary: [
        field("manufacturer", "제조사", "경동나비엔", "CUSTOMER"),
        {
          key: "errorCode",
          label: "오류코드",
          value: "03",
          source: "PHOTO",
          state: "CONFIRMED",
          required: false,
          evidence: { type: "PHOTO", photoId: "p1" },
        },
        {
          key: "model",
          label: "모델명",
          value: null,
          source: "PHOTO",
          state: "UNCONFIRMED",
          required: false,
          reason: "사진에서 모델명을 읽지 못했어요. 미확인 상태로 접수했어요.",
          evidence: { type: "PHOTO", photoId: "p1" },
        },
        {
          key: "expectedCause",
          label: "예상 원인",
          value: "점화 불량 가능성",
          source: "MANUAL",
          state: "INTERPRETATION",
          required: false,
          reason:
            "오류코드 03을 매뉴얼에서 찾아본 해석이에요. 현장 확인이 필요해요.",
          evidence: {
            type: "MANUAL",
            title: "경동나비엔 사용설명서 (예시)",
            location: "오류코드 표",
          },
        },
        field("address", "주소", "화정동 ○○아파트 102동", "CUSTOMER", true),
      ],
      summaryUpdatedAt: todayAt(9, 50),
      photos: [
        {
          id: "p1",
          url: "/owner/examples/boiler-example.png",
          alt: "보일러 사진 예시",
        },
      ],
      messages: [
        msg(
          "m1",
          "CUSTOMER",
          todayAt(9, 42),
          "보일러가 켜지는데 온수가 안 나와요.",
        ),
        { id: "m2", from: "CUSTOMER", photoId: "p1", sentAt: todayAt(9, 43) },
        msg(
          "m3",
          "DUKGU",
          todayAt(9, 44),
          "모델명 라벨을 가까이 찍어 주실 수 있을까요?",
        ),
        msg("m4", "CUSTOMER", todayAt(9, 45), "좁은 곳이라 더 찍기 어려워요."),
      ],
    },
    {
      id: "inq-107",
      businessId: HANBIT,
      customerLabel: "한○○",
      title: "보일러 교체 상담",
      receivedAt: now - 72 * HOUR,
      status: "COMPLETED",
      note: "처리를 마쳤어요.",
      unconfirmedLabels: [],
      customerDescription: "오래된 보일러 교체 비용이 궁금해요.",
      summary: [field("symptom", "문의", "교체 상담", "CUSTOMER", true)],
      summaryUpdatedAt: now - 72 * HOUR,
      photos: [],
      messages: [
        msg(
          "m1",
          "CUSTOMER",
          now - 72 * HOUR,
          "오래된 보일러 교체 비용이 궁금해요.",
        ),
      ],
    },
    {
      // 다른 업체 문의. 한빛 보일러 화면에 나오면 안 됩니다.
      id: "inq-901",
      businessId: TEUNTEUN,
      customerLabel: "오○○",
      title: "보일러 소음",
      receivedAt: now - 2 * HOUR,
      status: "OWNER_CHECK",
      ownerCheckReason: "CUSTOMER_REQUEST",
      note: "고객이 사장님과 직접 통화를 원해요.",
      unconfirmedLabels: [],
      activeHandoff: { id: "h-901", type: "DIRECT_CHAT", status: "WAITING" },
      customerDescription: "보일러에서 소리가 크게 나요.",
      summary: [field("symptom", "증상", "보일러 소음", "CUSTOMER", true)],
      summaryUpdatedAt: now - 2 * HOUR,
      photos: [],
      messages: [
        msg("m1", "CUSTOMER", now - 2 * HOUR, "보일러에서 소리가 크게 나요."),
      ],
    },
  ];
}

function field(
  key: InquiryDetail["summary"][number]["key"],
  label: string,
  value: string,
  source: "CUSTOMER" | "OWNER",
  required = false,
): InquiryDetail["summary"][number] {
  return { key, label, value, source, state: "CONFIRMED", required };
}

function msg(
  id: string,
  from: "CUSTOMER" | "DUKGU" | "OWNER",
  sentAt: number,
  text: string,
): InquiryDetail["messages"][number] {
  return { id, from, sentAt, text };
}

function wait() {
  const ms = devMockMode() === "slow" ? 3000 : mockInquiryConfig.delayMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldFail() {
  return mockInquiryConfig.fail || devMockMode() === "fail";
}

function toSummary(detail: InquiryDetail): InquirySummary {
  return {
    id: detail.id,
    businessId: detail.businessId,
    customerLabel: detail.customerLabel,
    title: detail.title,
    receivedAt: detail.receivedAt,
    status: detail.status,
    ownerCheckReason: detail.ownerCheckReason,
    note: detail.note,
    unconfirmedLabels: detail.unconfirmedLabels,
    thumbnailPhotoId: detail.thumbnailPhotoId,
    reservation: detail.reservation,
  };
}

/** 접수함 목록. 최근 접수가 위로 옵니다. */
export async function fetchInquiries(
  businessId: string,
): Promise<LoadResult<InquirySummary[]>> {
  await wait();
  if (shouldFail()) return { ok: false, code: "LOAD_FAILED" };
  if (devMockMode() === "empty") return { ok: true, data: [] };
  const data = buildInquiries()
    .filter((i) => i.businessId === businessId)
    .sort((a, b) => b.receivedAt - a.receivedAt)
    .map(toSummary);
  return { ok: true, data };
}

/** 접수 상세. 다른 업체 문의는 없는 문의처럼 다룹니다. */
export async function fetchInquiryDetail(
  businessId: string,
  inquiryId: string,
): Promise<LoadResult<InquiryDetail>> {
  await wait();
  if (shouldFail()) return { ok: false, code: "LOAD_FAILED" };
  const found = buildInquiries().find(
    (i) => i.id === inquiryId && i.businessId === businessId,
  );
  if (found && devMockMode() === "summaryfail") found.summaryUpdatedAt = null;
  if (found?.photos.length && devMockMode() === "photos") {
    found.photos.push({ ...found.photos[0], id: "p2", alt: "추가 사진 예시" });
  }
  return found ? { ok: true, data: found } : { ok: false, code: "NOT_FOUND" };
}

// ── 접수 정보 수정 (B-14) ─────────────────────────────
// 목업은 브라우저 메모리에 저장합니다. 새로고침하면 처음 값으로 돌아갑니다.

const FIELD_LABEL: Record<EditableFieldKey, string> = {
  manufacturer: "제조사",
  model: "모델명",
  errorCode: "오류코드",
  symptom: "증상",
};

const MAX_VALUE_LENGTH = 255;

/** 문의별로 사장님이 고친 뒤의 항목들 */
const savedEdits = new Map<string, SummaryField[]>();

/** 문의별 버전. 고치거나 응대를 바꿀 때마다 1씩 오릅니다. (없으면 1) */
const versions = new Map<string, number>();

/** 직접 응대·재개·종료로 바뀐 값과 새로 생긴 메시지 */
type HandlingPatch = Partial<
  Pick<
    InquiryDetail,
    | "handler"
    | "status"
    | "closed"
    | "ownerCheckReason"
    | "activeHandoff"
    | "note"
  >
> & { messages?: InquiryMessage[] };

const handlingPatches = new Map<string, HandlingPatch>();

function applyMockState(inquiry: InquiryDetail): InquiryDetail {
  const summary = savedEdits.get(inquiry.id) ?? inquiry.summary;
  const { messages: extra = [], ...patch } =
    handlingPatches.get(inquiry.id) ?? {};
  return {
    ...inquiry,
    ...patch,
    summary,
    messages: [...inquiry.messages, ...extra],
    version: versions.get(inquiry.id) ?? 1,
  };
}

function bumpVersion(inquiryId: string, current: number) {
  versions.set(inquiryId, current + 1);
}

/** 테스트끼리 저장 결과가 섞이지 않게 비웁니다. */
export function resetMockEdits() {
  savedEdits.clear();
  versions.clear();
  handlingPatches.clear();
}

/**
 * 사장님이 확인한 값으로 접수 항목을 고칩니다.
 * 실제 API: PATCH /api/v1/owner/inquiries/{id} (version + fields)
 * - 고친 항목은 출처 '사장님 확인'·확인됨이 되고, 고치기 전 값은 이력에 남습니다.
 * - 화면이 본 version과 지금 version이 다르면 CONFLICT로 거절합니다.
 */
export async function updateInquiryFields(
  businessId: string,
  inquiryId: string,
  request: { version: number; changes: FieldChange[] },
): Promise<SaveResult<InquiryDetail>> {
  await wait();
  if (mockInquiryConfig.saveFail || devMockMode() === "savefail") {
    return { ok: false, code: "SAVE_FAILED" };
  }
  const current = buildInquiries().find(
    (i) => i.id === inquiryId && i.businessId === businessId,
  );
  if (!current) return { ok: false, code: "NOT_FOUND" };

  const values = request.changes.map((c) => c.value.trim());
  if (
    request.changes.length === 0 ||
    values.some((v) => v === "" || v.length > MAX_VALUE_LENGTH)
  ) {
    return { ok: false, code: "INVALID" };
  }
  if (devMockMode() === "conflict" || request.version !== current.version) {
    return { ok: false, code: "CONFLICT" };
  }

  const changedAt = mockInquiryConfig.now();
  const summary = current.summary.map((f) => ({ ...f }));
  request.changes.forEach((change, index) => {
    const value = values[index];
    const before = summary.find((f) => f.key === change.key);
    if (!before) {
      summary.push({
        key: change.key,
        label: FIELD_LABEL[change.key],
        value,
        source: "OWNER",
        state: "CONFIRMED",
        required: change.key === "symptom",
        history: [],
      });
      return;
    }
    if (before.value === value && before.source === "OWNER") return;
    before.history = [
      ...(before.history ?? []),
      { value: before.value, source: before.source, changedAt },
    ];
    before.value = value;
    before.source = "OWNER";
    before.state = "CONFIRMED";
    before.reason = undefined;
    before.evidence = undefined;
  });

  savedEdits.set(inquiryId, summary);
  bumpVersion(inquiryId, current.version);
  return {
    ok: true,
    data: { ...current, version: current.version + 1, summary },
  };
}

// ── 직접 응대·답장·덕구 재개·문의 종료 (FE-10 · B-15·B-16) ─────────────
// 실제 API: POST /api/v1/owner/inquiries/{id}/takeover · messages · resume-ai · close
// 목업도 서버 규칙을 따릅니다. (backend OwnerHandlingService, 11/10 기준)

function findOwned(businessId: string, inquiryId: string) {
  return buildInquiries().find(
    (i) => i.id === inquiryId && i.businessId === businessId,
  );
}

function patchHandling(inquiryId: string, patch: HandlingPatch) {
  const before = handlingPatches.get(inquiryId) ?? {};
  handlingPatches.set(inquiryId, {
    ...before,
    ...patch,
    messages: [...(before.messages ?? []), ...(patch.messages ?? [])],
  });
}

function handlingFails() {
  return mockInquiryConfig.handlingFail || devMockMode() === "handlingfail";
}

/**
 * 직접 응대 시작 (B-15). 덕구 답변·자동 예약이 멈춥니다.
 * 서버처럼 진행 단계는 그대로 두고 응대 주체만 바꿉니다. 이미 직접 응대 중이면 그대로 성공입니다.
 */
export async function takeOverInquiry(
  businessId: string,
  inquiryId: string,
): Promise<HandlingResult<{ handler: Handler }>> {
  await wait();
  if (handlingFails()) return { ok: false, code: "FAILED" };
  const current = findOwned(businessId, inquiryId);
  if (!current) return { ok: false, code: "NOT_FOUND" };
  if (current.closed) return { ok: false, code: "CLOSED" };
  if (current.handler === "OWNER")
    return { ok: true, data: { handler: "OWNER" } };

  const handoff = current.activeHandoff;
  patchHandling(inquiryId, {
    handler: "OWNER",
    status: current.status === "AI_INTAKE" ? "OWNER_HANDLING" : current.status,
    activeHandoff:
      handoff?.type === "DIRECT_CHAT" && handoff.status === "WAITING"
        ? { ...handoff, status: "IN_PROGRESS" }
        : handoff,
  });
  bumpVersion(inquiryId, current.version);
  return { ok: true, data: { handler: "OWNER" } };
}

/**
 * 사장님 답장 (B-15). 직접 응대 중일 때만 보낼 수 있습니다.
 * 같은 clientMsgId로 다시 보내면 새로 만들지 않고 처음 저장한 메시지를 돌려줍니다. (중복 방지)
 */
export async function sendOwnerMessage(
  businessId: string,
  inquiryId: string,
  request: { clientMsgId: string; text: string },
): Promise<HandlingResult<InquiryMessage>> {
  await wait();
  if (mockInquiryConfig.sendFail || devMockMode() === "sendfail") {
    return { ok: false, code: "FAILED" };
  }
  const current = findOwned(businessId, inquiryId);
  if (!current) return { ok: false, code: "NOT_FOUND" };
  const id = `owner-${request.clientMsgId}`;
  const sent = current.messages.find((m) => m.id === id);
  if (sent) return { ok: true, data: sent };
  if (current.closed) return { ok: false, code: "CLOSED" };
  if (current.handler !== "OWNER") return { ok: false, code: "NOT_OWNER_MODE" };
  const text = request.text.trim();
  if (!text || text.length > 2000) return { ok: false, code: "FAILED" };

  const message: InquiryMessage = {
    id,
    from: "OWNER",
    text,
    sentAt: mockInquiryConfig.now(),
    delivery: "SENT",
  };
  patchHandling(inquiryId, { messages: [message] });
  return { ok: true, data: message };
}

/**
 * 덕구에게 다시 맡기기 (B-16).
 * 안전 신호가 있거나 필수 정보(증상)가 확인되지 않았으면 막고 이유를 돌려줍니다.
 */
export async function resumeAiInquiry(
  businessId: string,
  inquiryId: string,
): Promise<HandlingResult<{ handler: Handler }>> {
  await wait();
  if (handlingFails()) return { ok: false, code: "FAILED" };
  const current = findOwned(businessId, inquiryId);
  if (!current) return { ok: false, code: "NOT_FOUND" };
  if (current.closed) return { ok: false, code: "CLOSED" };
  const waitingOwner = current.status === "OWNER_CHECK";
  if (current.handler === "AI" && !waitingOwner) {
    return { ok: true, data: { handler: "AI" } };
  }
  const blockers = resumeBlockersOf(current);
  if (blockers.length) return { ok: false, code: "RESUME_BLOCKED", blockers };

  const handoff = current.activeHandoff;
  const backToIntake =
    current.status === "OWNER_CHECK" || current.status === "OWNER_HANDLING";
  patchHandling(inquiryId, {
    handler: "AI",
    status: backToIntake ? "AI_INTAKE" : current.status,
    ownerCheckReason: backToIntake ? undefined : current.ownerCheckReason,
    note: backToIntake ? "덕구가 이어서 접수하고 있어요." : current.note,
    // 직접 상담 요청은 끝냅니다. 전화 회신 요청은 남깁니다. (서버와 같음)
    activeHandoff: handoff?.type === "DIRECT_CHAT" ? undefined : handoff,
    // 고객에게 전환 사실을 알립니다. (C-11) 실제로는 서버·AI가 보냅니다.
    messages: [
      {
        id: `dukgu-resume-${current.version}`,
        from: "DUKGU",
        text: "사장님 확인을 마쳤어요. 이어서 덕구가 도와드릴게요.",
        sentAt: mockInquiryConfig.now(),
      },
    ],
  });
  bumpVersion(inquiryId, current.version);
  return { ok: true, data: { handler: "AI" } };
}

/**
 * 문의 종료 (B-16). 덕구 응대를 멈추고 기록은 남깁니다.
 * 연결된 예약은 취소하지 않습니다. 예약이 남았는지 reservationKept로 알려 줍니다.
 */
export async function closeInquiry(
  businessId: string,
  inquiryId: string,
): Promise<HandlingResult<{ reservationKept: boolean }>> {
  await wait();
  if (handlingFails()) return { ok: false, code: "FAILED" };
  const current = findOwned(businessId, inquiryId);
  if (!current) return { ok: false, code: "NOT_FOUND" };
  if (!current.closed) {
    patchHandling(inquiryId, {
      status: "COMPLETED",
      closed: true,
      ownerCheckReason: undefined,
      activeHandoff: undefined,
      note: current.reservation
        ? "문의를 종료했어요. 방문 예약은 그대로 있어요."
        : "문의를 종료했어요.",
    });
    bumpVersion(inquiryId, current.version);
  }
  return { ok: true, data: { reservationKept: Boolean(current.reservation) } };
}

const INTAKE_LINKS: Record<string, IntakeLink> = {
  [HANBIT]: {
    status: "READY",
    url: "https://ilro.example/r/hanbit",
    businessName: "한빛 보일러",
    isExample: true,
  },
  [TEUNTEUN]: { status: "NOT_ISSUED" },
};

/** 운영이 발급한 업체 전용 접수 링크 (B-11). QR은 10/30 회의에서 제외했습니다. */
export async function fetchIntakeLink(
  businessId: string,
): Promise<LoadResult<IntakeLink>> {
  await wait();
  if (shouldFail()) return { ok: false, code: "LOAD_FAILED" };
  if (devMockMode() === "nolink") {
    return { ok: true, data: { status: "NOT_ISSUED" } };
  }
  return {
    ok: true,
    data: INTAKE_LINKS[businessId] ?? { status: "NOT_ISSUED" },
  };
}
