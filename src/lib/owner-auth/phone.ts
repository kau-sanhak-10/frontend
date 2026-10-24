// 휴대전화번호 입력값 정리·검사·표시 도우미

/** 숫자만 남기고 최대 11자리로 자릅니다. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "").slice(0, 11);
}

/** 010 등 국내 휴대전화번호 형식인지 확인합니다. */
export function isValidPhone(digits: string): boolean {
  return /^01[016789]\d{7,8}$/.test(digits);
}

/** 입력 중인 번호를 010-1234-5678 형태로 보여줍니다. */
export function formatPhone(digits: string): string {
  const d = normalizePhone(digits);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  const middle = d.length === 10 ? 3 : 4;
  return `${d.slice(0, 3)}-${d.slice(3, 3 + middle)}-${d.slice(3 + middle)}`;
}

/** 가운데 자리를 가린 번호 (010-••••-5678) */
export function maskPhone(digits: string): string {
  const d = normalizePhone(digits);
  if (d.length < 10) return formatPhone(d);
  return `${d.slice(0, 3)}-••••-${d.slice(-4)}`;
}

/** 인증번호 입력값을 숫자 6자리 이내로 정리합니다. */
export function normalizeCode(input: string): string {
  return input.replace(/\D/g, "").slice(0, 6);
}

/** 남은 초를 m:ss 로 보여줍니다. */
export function formatSeconds(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
