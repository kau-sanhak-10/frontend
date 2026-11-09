// 사장님 문의 실제 API (BE-04·BE-07). 응답 모양 바꾸기는 live-mapper.ts가 맡습니다.
// 로그인 토큰은 FE-07(#15)의 실제 로그인 세션에서 받습니다.
import { ApiError, requestApi } from "../api.ts";
import {
  SERVER_FIELD_KEY,
  mapDetail,
  mapIntakeLink,
  mapListItem,
  mergeTodayVisits,
  type ServerDetail,
  type ServerHome,
  type ServerIntakeLink,
  type ServerListPage,
  type ServerMessage,
  type ServerPhotoUrl,
} from "./live-mapper.ts";
import type {
  FieldChange,
  InquiryDetail,
  InquirySummary,
  IntakeLink,
  LoadResult,
  SaveResult,
} from "./types";

const PAGE_SIZE = 50;
/** 목록은 최대 이만큼만 이어서 불러옵니다. (500건) */
const MAX_PAGES = 10;

const auth = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

function loadFailure(error: unknown): {
  ok: false;
  code: "LOAD_FAILED" | "NOT_FOUND";
} {
  if (error instanceof ApiError && error.status === 404) {
    return { ok: false, code: "NOT_FOUND" };
  }
  return { ok: false, code: "LOAD_FAILED" };
}

/** 문의 목록 + 오늘 방문. 서버가 로그인한 업체 문의만 돌려줍니다. */
export async function fetchInquiriesLive(
  token: string,
): Promise<LoadResult<InquirySummary[]>> {
  try {
    const items = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const res = await requestApi<ServerListPage>(
        `/api/v1/owner/inquiries?page=${page}&size=${PAGE_SIZE}`,
        { headers: auth(token) },
      );
      items.push(...res.content);
      if (res.isLast) break;
    }
    const home = await requestApi<ServerHome>("/api/v1/owner/home", {
      headers: auth(token),
    });
    const data = mergeTodayVisits(
      items.map(mapListItem),
      home.todayVisits,
    ).sort((a, b) => b.receivedAt - a.receivedAt);
    return { ok: true, data };
  } catch (error) {
    return loadFailure(error);
  }
}

async function loadMessages(token: string, inquiryId: string) {
  const messages: ServerMessage[] = [];
  let afterId: number | null = null;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const query: string = afterId === null ? "" : `?afterId=${afterId}`;
    const res: { messages: ServerMessage[]; hasMore: boolean } =
      await requestApi(
        `/api/v1/owner/inquiries/${encodeURIComponent(inquiryId)}/messages${query}`,
        { headers: auth(token) },
      );
    messages.push(...res.messages);
    if (!res.hasMore || res.messages.length === 0) break;
    afterId = res.messages[res.messages.length - 1].messageId;
  }
  return messages;
}

/** 접수 상세 + 대화. 다른 업체 문의는 서버가 404로 막습니다. */
export async function fetchInquiryDetailLive(
  token: string,
  inquiryId: string,
): Promise<LoadResult<InquiryDetail>> {
  try {
    const [detail, messages] = await Promise.all([
      requestApi<ServerDetail>(
        `/api/v1/owner/inquiries/${encodeURIComponent(inquiryId)}`,
        { headers: auth(token) },
      ),
      loadMessages(token, inquiryId),
    ]);
    const mapped = mapDetail(detail, messages);
    return { ok: true, data: await withPhotoUrls(token, mapped) };
  } catch (error) {
    return loadFailure(error);
  }
}

/**
 * 사진 보기용 주소를 붙입니다. (BE-06 GET …/photos/{photoId}/url)
 * 주소는 5분 뒤 만료돼 상세를 불러올 때마다 새로 받고, 만료되면 화면이 다시 받습니다.
 * 한 장이 실패해도 다른 사진과 상세는 그대로 보여 줍니다. (주소 없는 사진은 '사진' 자리만 표시)
 */
async function withPhotoUrls(
  token: string,
  detail: InquiryDetail,
): Promise<InquiryDetail> {
  if (detail.photos.length === 0) return detail;
  const results = await Promise.allSettled(
    detail.photos.map((photo) =>
      requestApi<ServerPhotoUrl>(
        `/api/v1/owner/inquiries/${encodeURIComponent(detail.id)}/photos/${encodeURIComponent(photo.id)}/url`,
        { headers: auth(token) },
      ),
    ),
  );
  return {
    ...detail,
    photos: detail.photos.map((photo, i) => {
      const r = results[i];
      return r.status === "fulfilled" && r.value.url
        ? {
            ...photo,
            url: r.value.url,
            expiresAt: Date.parse(r.value.expiresAt),
          }
        : photo;
    }),
  };
}

/** 업체 전용 접수 링크 (BE-04) */
export async function fetchIntakeLinkLive(
  token: string,
): Promise<LoadResult<IntakeLink>> {
  try {
    const link = await requestApi<ServerIntakeLink>(
      "/api/v1/owner/intake-link",
      { headers: auth(token) },
    );
    return { ok: true, data: mapIntakeLink(link) };
  } catch (error) {
    return loadFailure(error);
  }
}

/** 접수 정보 수정 (B-14). 화면이 본 version을 그대로 보냅니다. */
export async function updateInquiryFieldsLive(
  token: string,
  inquiryId: string,
  request: { version: number; changes: FieldChange[] },
): Promise<SaveResult<InquiryDetail>> {
  try {
    const saved = await requestApi<ServerDetail>(
      `/api/v1/owner/inquiries/${encodeURIComponent(inquiryId)}`,
      {
        method: "PATCH",
        headers: auth(token),
        body: JSON.stringify({
          version: request.version,
          fields: request.changes.map((c) => ({
            fieldKey: SERVER_FIELD_KEY[c.key],
            value: c.value,
          })),
        }),
      },
    );
    // 수정 화면은 저장 응답의 값과 버전을 씁니다. 상세 화면은 열 때 대화·사진을 조회합니다.
    return { ok: true, data: mapDetail(saved, []) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === "INQUIRY_VERSION_CONFLICT" || error.status === 409) {
        return { ok: false, code: "CONFLICT" };
      }
      if (error.status === 404) return { ok: false, code: "NOT_FOUND" };
      if (error.status === 400 || error.status === 422) {
        return { ok: false, code: "INVALID" };
      }
    }
    return { ok: false, code: "SAVE_FAILED" };
  }
}
