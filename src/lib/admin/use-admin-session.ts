"use client";

import { useSyncExternalStore } from "react";
import {
  ADMIN_SERVER_SNAPSHOT,
  adminSnapshotToState,
  getAdminSnapshot,
  subscribeAdminSession,
} from "./session";

/** 운영자 로그인 상태 */
export function useAdminSession() {
  const snapshot = useSyncExternalStore(
    subscribeAdminSession,
    getAdminSnapshot,
    () => ADMIN_SERVER_SNAPSHOT,
  );
  return adminSnapshotToState(snapshot);
}
