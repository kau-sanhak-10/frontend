// 방문 작업·메모·알림 데이터를 어디서 가져올지 고릅니다. (FE-13 · FE-16)
// - 알림·수신 설정(B-26·B-27): 예시 로그인은 목업, 실제 로그인은 서버(BE-14)
// - 방문 작업·메모·완료(B-23~B-25): 사장님용 API(BE-13)가 아직 없어서 예시 로그인만 지원합니다.
//   실제 로그인에서는 예시 데이터를 실제처럼 보여 주지 않고 '준비 중'으로 안내합니다.
import type { InquirySource } from "../owner-inquiries/source";
import {
  completeVisit,
  correctCompletion,
  fetchNotificationPrefs,
  fetchNotifications,
  fetchVisit,
  fetchVisits,
  fetchWorkNote,
  markNotificationRead,
  saveNotificationPrefs,
  saveWorkNote,
} from "./mock-api";
import {
  fetchNotificationPrefsLive,
  fetchNotificationsLive,
  markNotificationReadLive,
  saveNotificationPrefsLive,
} from "./live-api";
import type { NotificationPrefs } from "./types";

/** 방문 작업·메모·완료 화면이 쓸 수 있는 데이터 출처 (지금은 목업만) */
export type WorkSource = Extract<InquirySource, { kind: "mock" }>;

/** 서버 연결 전이라 실제 로그인에서는 null을 돌려줍니다. */
export function workSourceOf(source: InquirySource): WorkSource | null {
  return source.kind === "mock" ? source : null;
}

export const loadVisits = (s: WorkSource) => fetchVisits(s.businessId);
export const loadVisit = (s: WorkSource, id: string) =>
  fetchVisit(s.businessId, id);
export const loadWorkNote = (s: WorkSource, visitId: string) =>
  fetchWorkNote(s.businessId, visitId);
export const saveNote = (s: WorkSource, visitId: string, content: string) =>
  saveWorkNote(s.businessId, visitId, content);
export const finishVisit = (s: WorkSource, visitId: string, version: number) =>
  completeVisit(s.businessId, visitId, version);
export const undoCompletion = (
  s: WorkSource,
  visitId: string,
  version: number,
  reason: string,
) => correctCompletion(s.businessId, visitId, version, reason);
// ── 알림·수신 설정: 예시 로그인과 실제 로그인 모두 ─────────────

export const loadNotifications = (s: InquirySource) =>
  s.kind === "live"
    ? fetchNotificationsLive(s.token)
    : fetchNotifications(s.businessId);
export const readNotification = (s: InquirySource, id: string) =>
  s.kind === "live"
    ? markNotificationReadLive(s.token, id)
    : markNotificationRead(s.businessId, id);
export const loadPrefs = (s: InquirySource) =>
  s.kind === "live"
    ? fetchNotificationPrefsLive(s.token)
    : fetchNotificationPrefs(s.businessId);
export const savePrefs = (s: InquirySource, prefs: NotificationPrefs) =>
  s.kind === "live"
    ? saveNotificationPrefsLive(s.token, prefs)
    : saveNotificationPrefs(s.businessId, prefs);
