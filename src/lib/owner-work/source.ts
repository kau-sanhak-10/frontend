// 방문 작업·메모·알림 데이터를 어디서 가져올지 고릅니다. (FE-13 · FE-16)
// - 예시 로그인은 목업, 실제 로그인은 서버
//   · 방문 작업·메모·완료(B-23~B-25): BE-13
//   · 알림·수신 설정(B-26·B-27): BE-14
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
  completeVisitLive,
  correctCompletionLive,
  fetchNotificationPrefsLive,
  fetchNotificationsLive,
  fetchVisitLive,
  fetchVisitsLive,
  fetchWorkNoteLive,
  markNotificationReadLive,
  saveNotificationPrefsLive,
  saveWorkNoteLive,
} from "./live-api";
import type { NotificationPrefs, Visit } from "./types";

/** 방문 작업·메모·완료 화면의 데이터 출처 (예시 로그인·실제 로그인) */
export type WorkSource = InquirySource;

export const loadVisits = (s: WorkSource) =>
  s.kind === "live" ? fetchVisitsLive(s.token) : fetchVisits(s.businessId);
export const loadVisit = (s: WorkSource, id: string) =>
  s.kind === "live"
    ? fetchVisitLive(s.token, id)
    : fetchVisit(s.businessId, id);
export const loadWorkNote = (s: WorkSource, visitId: string) =>
  s.kind === "live"
    ? fetchWorkNoteLive(s.token, visitId)
    : fetchWorkNote(s.businessId, visitId);
export const saveNote = (s: WorkSource, visitId: string, content: string) =>
  s.kind === "live"
    ? saveWorkNoteLive(s.token, visitId, content)
    : saveWorkNote(s.businessId, visitId, content);
export const finishVisit = (s: WorkSource, visit: Visit) =>
  s.kind === "live"
    ? completeVisitLive(s.token, visit)
    : completeVisit(s.businessId, visit.id, visit.version);
export const undoCompletion = (s: WorkSource, visit: Visit, reason: string) =>
  s.kind === "live"
    ? correctCompletionLive(s.token, visit, reason)
    : correctCompletion(s.businessId, visit.id, visit.version, reason);
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
