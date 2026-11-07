// 접수 링크 복사·공유 (B-11). 브라우저 기능을 넘겨받아 화면 없이 테스트할 수 있게 했습니다.

export type ShareOutcome = "SHARED" | "COPIED" | "CANCELLED" | "FAILED";

type ShareTools = {
  share?: (data: { title: string; text: string; url: string }) => Promise<void>;
  copy?: (text: string) => Promise<void>;
};

/** 링크를 클립보드에 복사합니다. */
export async function copyLink(
  url: string,
  tools: ShareTools,
): Promise<ShareOutcome> {
  if (!tools.copy) return "FAILED";
  try {
    await tools.copy(url);
    return "COPIED";
  } catch {
    return "FAILED";
  }
}

/**
 * 휴대폰 공유창으로 링크를 보냅니다. 공유창이 없으면(대부분의 PC) 복사로 대신합니다.
 * 사장님이 공유창을 닫으면 CANCELLED로, 오류로 보지 않습니다.
 */
export async function shareLink(
  url: string,
  businessName: string,
  tools: ShareTools,
): Promise<ShareOutcome> {
  if (!tools.share) return copyLink(url, tools);
  try {
    await tools.share({
      title: `${businessName} 문의`,
      text: `${businessName}에 사진과 증상을 남겨 주세요.`,
      url,
    });
    return "SHARED";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return "CANCELLED";
    }
    return copyLink(url, tools);
  }
}

/** 화면에서 쓰는 브라우저 기능 묶음 */
export function browserShareTools(): ShareTools {
  if (typeof navigator === "undefined") return {};
  return {
    share:
      typeof navigator.share === "function"
        ? (data) => navigator.share(data)
        : undefined,
    copy: navigator.clipboard
      ? (text) => navigator.clipboard.writeText(text)
      : undefined,
  };
}
