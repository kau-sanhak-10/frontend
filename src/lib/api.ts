export type ApiResponse<T> = {
  success: boolean;
  code: string;
  message: string;
  result: T;
};

export type FieldError = { field: string; reason: string };

export class ApiError extends Error {
  status: number;
  code: string;
  result: unknown;

  constructor(status: number, code: string, message: string, result?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.result = result;
  }
}

// 백엔드의 ApiResponse를 사용하는 엔드포인트 전용. /actuator/health는 일반 fetch로 조회합니다.
export async function requestApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!configuredBase)
    throw new Error("NEXT_PUBLIC_API_BASE_URL을 설정해주세요.");
  const base = new URL(
    configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`,
  );
  const url = new URL(path, base);
  if (
    !/^https?:$/.test(base.protocol) ||
    url.origin !== base.origin ||
    url.username ||
    url.password
  ) {
    throw new Error("API 요청은 설정된 서버로만 보낼 수 있습니다.");
  }
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const response = await fetch(url, { ...options, headers, cache: "no-store" });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      "INVALID_RESPONSE",
      "서버 응답을 확인할 수 없습니다.",
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("success" in body) ||
    typeof body.success !== "boolean" ||
    !("code" in body) ||
    typeof body.code !== "string" ||
    !("message" in body) ||
    typeof body.message !== "string" ||
    !("result" in body)
  ) {
    throw new ApiError(
      response.status,
      "INVALID_RESPONSE",
      "서버 응답 형식이 올바르지 않습니다.",
    );
  }
  if (!response.ok || !body.success) {
    throw new ApiError(response.status, body.code, body.message, body.result);
  }
  return body.result as T;
}
