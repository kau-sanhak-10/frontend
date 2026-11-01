"use client";

import { useSyncExternalStore } from "react";
import {
  SERVER_SNAPSHOT,
  getSessionSnapshot,
  snapshotToState,
  subscribeSession,
  type SessionState,
} from "./session";

/** 현재 브라우저의 사장님 로그인 상태 (loading → none / expired / active) */
export function useOwnerSession(): SessionState {
  const snapshot = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    () => SERVER_SNAPSHOT,
  );
  return snapshotToState(snapshot);
}
