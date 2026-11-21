// 방문 작업·메모·알림 데이터를 어디서 가져올지 고릅니다. (FE-13)
// 사장님용 예약·메모·알림 API가 백엔드에 아직 없어서, 지금은 예시 로그인(목업)만 지원합니다.
// 실제 로그인(live)에서는 예시 데이터를 실제처럼 보여 주지 않고 '준비 중'으로 안내합니다.
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
import type { NotificationPrefs } from "./types";

/** 이 화면들이 쓸 수 있는 데이터 출처 (지금은 목업만) */
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
export const loadNotifications = (s: WorkSource) =>
  fetchNotifications(s.businessId);
export const readNotification = (s: WorkSource, id: string) =>
  markNotificationRead(s.businessId, id);
export const loadPrefs = (s: WorkSource) =>
  fetchNotificationPrefs(s.businessId);
export const savePrefs = (s: WorkSource, prefs: NotificationPrefs) =>
  saveNotificationPrefs(s.businessId, prefs);
