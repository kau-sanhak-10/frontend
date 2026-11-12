// 사장님 화면이 데이터를 어디서 가져올지 한 곳에서 고릅니다.
// - mock: 화면 확인용 예시 로그인 (가짜 데이터, mock-api.ts)
// - live: 문자 인증으로 로그인한 실제 사장님 (실제 서버, live-api.ts)
import {
  closeInquiry,
  fetchInquiries,
  fetchInquiryDetail,
  fetchIntakeLink,
  resumeAiInquiry,
  sendOwnerMessage,
  takeOverInquiry,
  updateInquiryFields,
} from "./mock-api";
import {
  closeInquiryLive,
  fetchInquiriesLive,
  fetchInquiryDetailLive,
  fetchIntakeLinkLive,
  resumeAiInquiryLive,
  sendOwnerMessageLive,
  takeOverInquiryLive,
  updateInquiryFieldsLive,
} from "./live-api";
import type { FieldChange } from "./types";

export type InquirySource =
  { kind: "mock"; businessId: string } | { kind: "live"; token: string };

export function loadInquiries(source: InquirySource) {
  return source.kind === "live"
    ? fetchInquiriesLive(source.token)
    : fetchInquiries(source.businessId);
}

export function loadInquiryDetail(source: InquirySource, inquiryId: string) {
  return source.kind === "live"
    ? fetchInquiryDetailLive(source.token, inquiryId)
    : fetchInquiryDetail(source.businessId, inquiryId);
}

export function loadIntakeLink(source: InquirySource) {
  return source.kind === "live"
    ? fetchIntakeLinkLive(source.token)
    : fetchIntakeLink(source.businessId);
}

export function saveInquiryFields(
  source: InquirySource,
  inquiryId: string,
  request: { version: number; changes: FieldChange[] },
) {
  return source.kind === "live"
    ? updateInquiryFieldsLive(source.token, inquiryId, request)
    : updateInquiryFields(source.businessId, inquiryId, request);
}

/** 직접 응대 시작 (B-15) */
export function startOwnerHandling(source: InquirySource, inquiryId: string) {
  return source.kind === "live"
    ? takeOverInquiryLive(source.token, inquiryId)
    : takeOverInquiry(source.businessId, inquiryId);
}

/** 사장님 답장 (B-15) */
export function sendReply(
  source: InquirySource,
  inquiryId: string,
  request: { clientMsgId: string; text: string },
) {
  return source.kind === "live"
    ? sendOwnerMessageLive(source.token, inquiryId, request)
    : sendOwnerMessage(source.businessId, inquiryId, request);
}

/** 덕구에게 다시 맡기기 (B-16) */
export function resumeDukgu(source: InquirySource, inquiryId: string) {
  return source.kind === "live"
    ? resumeAiInquiryLive(source.token, inquiryId)
    : resumeAiInquiry(source.businessId, inquiryId);
}

/** 문의 종료 (B-16) */
export function endInquiry(source: InquirySource, inquiryId: string) {
  return source.kind === "live"
    ? closeInquiryLive(source.token, inquiryId)
    : closeInquiry(source.businessId, inquiryId);
}

/** 화면이 쓰는 로그인 사장님 구분값 (useCallback 의존성용) */
export function sourceKey(source: InquirySource): string {
  return source.kind === "live"
    ? `live:${source.token}`
    : `mock:${source.businessId}`;
}
