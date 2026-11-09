// 백엔드 응답(BE-04·BE-07)을 사장님 화면이 쓰는 모양으로 바꿉니다.
// 화면 코드는 목업과 같은 타입만 보면 되도록, 서버 이름·구조 차이는 이 파일에서만 다룹니다.
// 서버 형식 출처: backend OwnerInquiryListResponse · OwnerInquiryDetailResponse ·
// MessagesResponse · OwnerHomeResponse · IntakeLinkResponse (develop, 11/9 기준)
import type {
  EditableFieldKey,
  FieldHistoryItem,
  InquiryDetail,
  InquiryMessage,
  InquiryPhoto,
  InquiryStatus,
  InquirySummary,
  IntakeLink,
  OwnerCheckReason,
  SummaryField,
  SummarySource,
} from "./types";

// ── 서버가 보내는 모양 ─────────────────────────────

export type ServerInquiryStatus =
  | "COLLECTING"
  | "SCHEDULING"
  | "OWNER_CHECK"
  | "BOOKED"
  | "UNSERVICEABLE"
  | "CLOSED";
export type ServerHandlerMode = "AI" | "OWNER";
export type ServerWorkCategory =
  "INSPECTION" | "REPAIR" | "LEAK" | "REPLACEMENT";
type ServerFieldSource = "CUSTOMER" | "PHOTO" | "OWNER";
type ServerFieldStatus = "CONFIRMED" | "UNCONFIRMED";

export type ServerListItem = {
  inquiryId: number;
  status: ServerInquiryStatus;
  handlerMode: ServerHandlerMode;
  safetyFlag: boolean;
  ownerCheckReason: OwnerCheckReason | null;
  customerName: string | null;
  address: string | null;
  workCategory: ServerWorkCategory | null;
  symptom: string | null;
  lastMessage: { sender: string; preview: string | null } | null;
  createdAt: string;
};

export type ServerListPage = {
  content: ServerListItem[];
  page: number;
  isLast: boolean;
};

export type ServerTodayVisit = {
  inquiryId: number | null;
  status: string;
  startAt: string;
  endAt: string;
  address: string | null;
};

export type ServerHome = { todayVisits: ServerTodayVisit[] };

type ServerFieldHistory = {
  value: string | null;
  source: ServerFieldSource | null;
  createdAt: string;
};

export type ServerFieldDetail = {
  fieldKey: string;
  required: boolean;
  value: string | null;
  source: ServerFieldSource | null;
  status: ServerFieldStatus;
  unconfirmedReason: string | null;
  photoId: number | null;
  messageId: number | null;
  updatedAt: string | null;
  history: ServerFieldHistory[];
};

export type ServerDetail = {
  inquiryId: number;
  status: ServerInquiryStatus;
  handlerMode: ServerHandlerMode;
  safetyFlag: boolean;
  ownerCheckReason: OwnerCheckReason | null;
  version: number;
  visitInfo: {
    name: string | null;
    address: string | null;
    addressDetail?: string | null;
    workCategory: ServerWorkCategory | null;
  } | null;
  fields: ServerFieldDetail[];
  aiSummary: { summary: string | null; decidedAt: string | null } | null;
  photos: { photoId: number; messageId: number | null }[];
  reservation: { status: string; startAt: string; endAt: string } | null;
  createdAt: string;
};

export type ServerMessage = {
  messageId: number;
  sender: "CUSTOMER" | "AI" | "OWNER";
  content: string | null;
  photoIds: number[];
  createdAt: string;
};

/** 사진 보기용 짧은 유효기간 주소 (BE-06) */
export type ServerPhotoUrl = {
  photoId: number;
  url: string | null;
  expiresAt: string;
};

export type ServerIntakeLink = {
  status: string;
  url: string | null;
  businessName: string | null;
};

// ── 바꾸는 규칙 ─────────────────────────────

const WORK_LABEL: Record<ServerWorkCategory, string> = {
  INSPECTION: "점검",
  REPAIR: "수리",
  LEAK: "누수",
  REPLACEMENT: "보일러 교체",
};

/** 서버 항목 이름 → 화면 항목 이름. 모르는 항목은 화면에 보이지 않습니다. */
const FIELD_KEY: Record<string, { key: SummaryField["key"]; label: string }> = {
  manufacturer: { key: "manufacturer", label: "제조사" },
  model: { key: "model", label: "모델명" },
  boiler_type: { key: "boilerType", label: "보일러 종류" },
  error_code: { key: "errorCode", label: "오류코드" },
  symptom: { key: "symptom", label: "증상" },
};

/** 화면 항목 이름 → 서버에 보낼 항목 이름 (수정 저장용) */
export const SERVER_FIELD_KEY: Record<EditableFieldKey, string> = {
  manufacturer: "manufacturer",
  model: "model",
  errorCode: "error_code",
  symptom: "symptom",
};

const UNCONFIRMED_REASON: Record<string, string> = {
  NOT_PROVIDED: "아직 고객이 알려 주지 않았어요.",
};

const time = (iso: string) => Date.parse(iso);

/**
 * 서버 상태 + 응대 주체 → 화면 상태
 * - 정보 수집·시간 선택 중: 덕구가 응대하면 '덕구 접수 중', 사장님이 넘겨받았으면 '직접 응대 중'
 * - 서비스 불가·종료는 '처리 완료' 묶음으로 봅니다.
 */
export function mapStatus(
  status: ServerInquiryStatus,
  handlerMode: ServerHandlerMode,
): InquiryStatus {
  if (status === "OWNER_CHECK") return "OWNER_CHECK";
  if (status === "BOOKED") return "RESERVED";
  if (status === "CLOSED" || status === "UNSERVICEABLE") return "COMPLETED";
  return handlerMode === "OWNER" ? "OWNER_HANDLING" : "AI_INTAKE";
}

/** 목록에서는 고객 이름을 가립니다. (예: 김민수 → 김○○) */
export function maskName(name: string | null): string {
  const first = name?.trim().at(0);
  return first ? `${first}○○` : "고객";
}

function titleOf(
  symptom: string | null,
  work: ServerWorkCategory | null,
): string {
  if (symptom?.trim()) return symptom.trim();
  if (work) return `${WORK_LABEL[work]} 문의`;
  return "새 문의";
}

function noteOf(item: ServerListItem, status: InquiryStatus): string {
  if (item.safetyFlag) return "안전 신호가 있어 덕구가 접수를 멈췄어요.";
  if (item.lastMessage?.preview) return item.lastMessage.preview;
  if (status === "AI_INTAKE") return "덕구가 증상과 정보를 받고 있어요.";
  if (status === "OWNER_HANDLING") return "사장님이 응대 중이에요.";
  if (status === "RESERVED") return "방문 예약이 있어요.";
  return "처리를 마쳤어요.";
}

/** 목록 한 건 */
export function mapListItem(item: ServerListItem): InquirySummary {
  const status = mapStatus(item.status, item.handlerMode);
  return {
    id: String(item.inquiryId),
    // 서버가 로그인한 업체 문의만 주므로, 화면 거르기용 값은 하나로 둡니다.
    businessId: "live",
    customerLabel: maskName(item.customerName),
    title: titleOf(item.symptom, item.workCategory),
    receivedAt: time(item.createdAt),
    status,
    ownerCheckReason: item.ownerCheckReason ?? undefined,
    note: noteOf(item, status),
    // 목록 응답에는 항목별 확인 여부가 없습니다. 상세에서 보여 줍니다.
    unconfirmedLabels: [],
  };
}

/**
 * 목록 + 홈의 오늘 방문을 합칩니다.
 * 목록 응답에는 예약 시간이 없어서, 홈(GET /owner/home)의 오늘 방문을 문의에 붙입니다.
 */
export function mergeTodayVisits(
  inquiries: InquirySummary[],
  visits: ServerTodayVisit[],
): InquirySummary[] {
  return inquiries.map((inquiry) => {
    const visit = visits.find((v) => String(v.inquiryId) === inquiry.id);
    if (!visit) return inquiry;
    return {
      ...inquiry,
      reservation: {
        startAt: time(visit.startAt),
        endAt: time(visit.endAt),
        address: visit.address ?? "주소 미확인",
      },
    };
  });
}

function sourceOf(source: ServerFieldSource | null): SummarySource {
  return source ?? "NONE";
}

function mapField(
  field: ServerFieldDetail,
  messages: ServerMessage[],
): SummaryField | null {
  const known = FIELD_KEY[field.fieldKey];
  if (!known) return null;
  const unconfirmed = field.status === "UNCONFIRMED" || field.value === null;
  const quote = messages.find((m) => m.messageId === field.messageId)?.content;
  const history: FieldHistoryItem[] = field.history.map((h) => ({
    value: h.value,
    source: sourceOf(h.source),
    changedAt: time(h.createdAt),
  }));
  return {
    key: known.key,
    label: known.label,
    value: field.value,
    source: sourceOf(field.source),
    state: unconfirmed ? "UNCONFIRMED" : "CONFIRMED",
    required: field.required,
    reason: unconfirmed
      ? field.unconfirmedReason
        ? (UNCONFIRMED_REASON[field.unconfirmedReason] ??
          field.unconfirmedReason)
        : undefined
      : undefined,
    evidence:
      field.photoId !== null
        ? { type: "PHOTO", photoId: String(field.photoId) }
        : field.messageId !== null && quote
          ? { type: "MESSAGE", messageId: String(field.messageId), quote }
          : undefined,
    history,
  };
}

function mapMessage(m: ServerMessage): InquiryMessage {
  return {
    id: String(m.messageId),
    from: m.sender === "AI" ? "DUKGU" : m.sender,
    text: m.content ?? undefined,
    photoId: m.photoIds.length ? String(m.photoIds[0]) : undefined,
    sentAt: time(m.createdAt),
  };
}

/** 상세 + 대화 → 접수 상세 */
export function mapDetail(
  detail: ServerDetail,
  messages: ServerMessage[],
): InquiryDetail {
  const status = mapStatus(detail.status, detail.handlerMode);
  const summary = detail.fields
    .map((f) => mapField(f, messages))
    .filter((f): f is SummaryField => f !== null);
  const symptom = detail.fields.find((f) => f.fieldKey === "symptom")?.value;
  const firstCustomer = messages.find(
    (m) => m.sender === "CUSTOMER" && m.content,
  );
  const updates = detail.fields
    .map((f) => (f.updatedAt ? time(f.updatedAt) : 0))
    .filter((t) => t > 0);
  // 보기용 주소는 live-api.ts가 사진마다 따로 받아 채웁니다.
  const photos: InquiryPhoto[] = detail.photos.map((p, i) => ({
    id: String(p.photoId),
    url: "",
    alt: `고객 사진 ${i + 1}`,
  }));
  const address = detail.visitInfo?.address ?? null;

  return {
    id: String(detail.inquiryId),
    businessId: "live",
    customerLabel: maskName(detail.visitInfo?.name ?? null),
    title: titleOf(symptom ?? null, detail.visitInfo?.workCategory ?? null),
    receivedAt: time(detail.createdAt),
    status,
    ownerCheckReason: detail.ownerCheckReason ?? undefined,
    note: detail.aiSummary?.summary ?? "",
    unconfirmedLabels: summary
      .filter((f) => !f.required && f.state === "UNCONFIRMED")
      .map((f) => f.label),
    thumbnailPhotoId: photos[0]?.id,
    reservation: detail.reservation
      ? {
          startAt: time(detail.reservation.startAt),
          endAt: time(detail.reservation.endAt),
          address: address ?? "주소 미확인",
        }
      : undefined,
    customerDescription: firstCustomer?.content ?? "",
    visitAddress: address
      ? [address, detail.visitInfo?.addressDetail].filter(Boolean).join(" ")
      : undefined,
    summary,
    // 항목이 하나도 정리되지 않았으면 요약이 없는 것으로 봅니다. 대화·사진은 그대로 보여 줍니다.
    summaryUpdatedAt: updates.length ? Math.max(...updates) : null,
    photos,
    messages: messages.map(mapMessage),
    version: detail.version,
  };
}

/** 접수 링크 (B-11) */
export function mapIntakeLink(link: ServerIntakeLink): IntakeLink {
  if (link.status === "READY" && link.url && link.businessName) {
    return { status: "READY", url: link.url, businessName: link.businessName };
  }
  return link.status === "READY"
    ? { status: "ERROR" }
    : { status: "NOT_ISSUED" };
}
