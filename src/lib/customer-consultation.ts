export const photoLimits = { count: 10, bytes: 10_000_000 } as const;

export function createClientId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // 같은 Wi-Fi의 HTTP 미리보기에서도 암호학적 난수로 UUID v4를 만든다.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type IntakeField = {
  key: string;
  label: string;
  value: string | null;
  source: "CUSTOMER" | "PHOTO" | "OWNER" | "MANUAL";
  status: "CONFIRMED" | "UNCONFIRMED" | "CONFLICT";
  reason?: string;
};

export type CustomerMessage = {
  id: string;
  role: "CUSTOMER" | "AI" | "OWNER" | "SYSTEM";
  content: string;
  photos?: { id: number; url: string; name: string }[];
};

export type SendCustomerInput = {
  clientMsgId: string;
  content: string;
  photoIds: number[];
};

export type PhotoRequest = { attempt: 1 | 2; reason: string };

export function validatePhoto(
  file: Pick<File, "type" | "size">,
  currentCount: number,
): string | undefined {
  if (currentCount >= photoLimits.count)
    return "문의당 사진은 10장까지 보낼 수 있어요.";
  if (!["image/jpeg", "image/png"].includes(file.type))
    return "JPG·PNG 사진을 선택해 주세요. HEIC는 JPG로 변환한 뒤 보내주세요.";
  if (!file.size) return "내용이 없는 파일이에요. 다른 사진을 선택해 주세요.";
  if (file.size > photoLimits.bytes)
    return "사진 한 장은 10MB 이하로 선택해 주세요.";
}

export function fieldText(field: IntakeField): string {
  if (field.status === "CONFLICT") return "정보 확인 필요";
  return field.status === "CONFIRMED" && field.value?.trim()
    ? field.value
    : "미확인";
}

export const fieldSources = {
  CUSTOMER: "고객 설명",
  PHOTO: "사진 확인",
  OWNER: "사장님 확인",
  MANUAL: "매뉴얼 해석",
} as const;

export function consultationError(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : "";
  if (code === "TOKEN_EXPIRED" || code === "UNAUTHORIZED")
    return "상담 접근 시간이 만료됐어요. 작성 내용은 남아 있어요. 본인 확인 후 다시 연결해 주세요.";
  if (code === "INTAKE_PAUSED")
    return "업체가 새 접수를 잠시 멈췄어요. 작성 내용은 이 화면에 남아 있어요.";
  if (code === "TOO_MANY_REQUESTS")
    return "요청이 많아 잠시 기다려야 해요. 작성 내용은 그대로 있어요.";
  return "전송하지 못했어요. 내용과 사진은 그대로 있어요. 다시 시도해 주세요.";
}
