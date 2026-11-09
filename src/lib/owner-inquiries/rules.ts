// 홈과 접수함이 같은 기준으로 건수를 세도록, 분류 규칙을 이 파일 한 곳에 둡니다.
import type {
  EditableFieldKey,
  FieldChange,
  InquiryStatus,
  InquirySummary,
  OwnerCheckReason,
  SummaryField,
} from "./types";

/** 접수함 탭 (Figma B02) */
export type InquiryTab = "ALL" | "OWNER_CHECK" | "IN_PROGRESS";

/** 접수함 묶음 (Figma B02: 사장님 확인 / 덕구가 접수 중 / 예약 확정) */
export type InquiryGroup =
  "OWNER_CHECK" | "AI_INTAKE" | "OWNER_HANDLING" | "RESERVED" | "COMPLETED";

/**
 * 사장님 확인이 필요한 문의인지 판단합니다.
 * 서버가 OWNER_CHECK와 사유를 함께 줄 때만 확인 필요로 봅니다.
 * 참고정보 미확인(unconfirmedLabels)은 판단에 쓰지 않습니다. (10/26 기준)
 */
export function needsOwnerCheck(inquiry: InquirySummary): boolean {
  return (
    inquiry.status === "OWNER_CHECK" && inquiry.ownerCheckReason !== undefined
  );
}

/** 문의가 어느 묶음에 들어가는지 */
export function groupOf(inquiry: InquirySummary): InquiryGroup {
  if (needsOwnerCheck(inquiry)) return "OWNER_CHECK";
  // 사유 없이 OWNER_CHECK가 오면 잘못된 값이므로 덕구 접수로 둡니다.
  if (inquiry.status === "OWNER_CHECK") return "AI_INTAKE";
  return inquiry.status;
}

const IN_PROGRESS: InquiryGroup[] = ["AI_INTAKE", "OWNER_HANDLING"];

/** 탭에 보여 줄 문의만 고릅니다. 처리 완료는 '전체' 탭에서만 보입니다. */
export function filterByTab(
  inquiries: InquirySummary[],
  tab: InquiryTab,
): InquirySummary[] {
  if (tab === "ALL") return inquiries;
  if (tab === "OWNER_CHECK") return inquiries.filter(needsOwnerCheck);
  return inquiries.filter((i) => IN_PROGRESS.includes(groupOf(i)));
}

/** 탭별 건수. 홈 '확인할 일' 건수도 이 값의 OWNER_CHECK를 씁니다. */
export function countByTab(
  inquiries: InquirySummary[],
): Record<InquiryTab, number> {
  return {
    ALL: inquiries.length,
    OWNER_CHECK: filterByTab(inquiries, "OWNER_CHECK").length,
    IN_PROGRESS: filterByTab(inquiries, "IN_PROGRESS").length,
  };
}

/** 다른 업체 문의가 섞이지 않게 한 번 더 거릅니다. */
export function onlyBusiness<T extends { businessId: string }>(
  items: T[],
  businessId: string,
): T[] {
  return items.filter((item) => item.businessId === businessId);
}

export const OWNER_CHECK_REASON_LABEL: Record<OwnerCheckReason, string> = {
  REQUIRED_INFO_MISSING: "필수정보 확인",
  SAFETY: "안전 확인",
  CUSTOMER_REQUEST: "고객 상담 요청",
  SCHEDULE_CHANGE: "방문시간 변경",
};

export const STATUS_LABEL: Record<InquiryStatus, string> = {
  AI_INTAKE: "덕구 접수 중",
  OWNER_CHECK: "확인 필요",
  OWNER_HANDLING: "직접 응대 중",
  RESERVED: "예약 확정",
  COMPLETED: "처리 완료",
};

export const SOURCE_LABEL: Record<SummaryField["source"], string> = {
  CUSTOMER: "고객 설명",
  PHOTO: "사진",
  OWNER: "사장님 확인",
  MANUAL: "매뉴얼",
};

/** 오늘 방문 예정 (홈 B01 '오늘 방문'). 시작 시각 순으로 정렬합니다. */
export function todayVisits(
  inquiries: InquirySummary[],
  now: number,
): InquirySummary[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = start.getTime() + 86_400_000;
  return inquiries
    .filter(
      (i) =>
        i.reservation !== undefined &&
        i.status !== "COMPLETED" &&
        i.reservation.startAt >= start.getTime() &&
        i.reservation.startAt < end,
    )
    .sort((a, b) => a.reservation!.startAt - b.reservation!.startAt);
}

/** 요약 값 표시. 미확인은 '미확인', 해석은 값 그대로 두고 화면에서 따로 표시합니다. */
export function displayValue(field: SummaryField): string {
  if (field.state === "UNCONFIRMED" || field.value === null) return "미확인";
  return field.value;
}

const PRODUCT_KEYS: SummaryField["key"][] = [
  "manufacturer",
  "model",
  "errorCode",
  "expectedCause",
];

/** 접수 상세(B03)의 '제품 정보'와 '접수 정보'로 요약 항목을 나눕니다. */
export function splitSummary(fields: SummaryField[]): {
  product: SummaryField[];
  intake: SummaryField[];
} {
  return {
    product: fields.filter((f) => PRODUCT_KEYS.includes(f.key)),
    intake: fields.filter((f) => !PRODUCT_KEYS.includes(f.key)),
  };
}

/** 접수 정보 수정(B-14)에서 사장님이 고칠 수 있는 항목과 화면 문구 */
export const EDITABLE_FIELDS: {
  key: EditableFieldKey;
  label: string;
  placeholder: string;
}[] = [
  { key: "manufacturer", label: "제조사", placeholder: "예: 경동나비엔" },
  { key: "model", label: "모델명", placeholder: "예: NCB353" },
  { key: "errorCode", label: "오류코드", placeholder: "예: 03" },
  { key: "symptom", label: "증상", placeholder: "예: 온수가 나오지 않아요" },
];

export const MAX_FIELD_LENGTH = 255;

export type EditDraft = Record<EditableFieldKey, string>;

/** 수정 화면 입력칸의 처음 값. 미확인 항목은 빈칸으로 시작합니다. */
export function initialDraft(summary: SummaryField[]): EditDraft {
  const valueOf = (key: EditableFieldKey) =>
    summary.find((f) => f.key === key)?.value ?? "";
  return {
    manufacturer: valueOf("manufacturer"),
    model: valueOf("model"),
    errorCode: valueOf("errorCode"),
    symptom: valueOf("symptom"),
  };
}

/**
 * 입력칸에서 실제로 바뀐 항목만 골라 저장 요청을 만듭니다.
 * - 그대로인 항목은 보내지 않습니다. (원래 출처를 지키기 위해)
 * - 값이 있던 항목을 비우거나 너무 길게 쓰면 저장하지 않고 이유를 알려 줍니다.
 * - 미확인 항목은 비워 둬도 됩니다. (10/26 기준: 확인·수정을 강제하지 않음)
 */
export function collectChanges(
  summary: SummaryField[],
  draft: EditDraft,
): {
  changes: FieldChange[];
  errors: Partial<Record<EditableFieldKey, string>>;
} {
  const before = initialDraft(summary);
  const changes: FieldChange[] = [];
  const errors: Partial<Record<EditableFieldKey, string>> = {};
  for (const { key } of EDITABLE_FIELDS) {
    const value = draft[key].trim();
    if (value === before[key].trim()) continue;
    if (value === "") {
      errors[key] = "비워 둘 수 없어요. 원래 값으로 두려면 되돌려 주세요.";
    } else if (value.length > MAX_FIELD_LENGTH) {
      errors[key] = `${MAX_FIELD_LENGTH}자 이하로 입력해 주세요.`;
    } else {
      changes.push({ key, value });
    }
  }
  return { changes, errors };
}
