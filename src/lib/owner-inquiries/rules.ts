// 홈과 접수함이 같은 기준으로 건수를 세도록, 분류 규칙을 이 파일 한 곳에 둡니다.
import type {
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
