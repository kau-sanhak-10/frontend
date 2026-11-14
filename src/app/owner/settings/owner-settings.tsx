"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ApiError } from "@/lib/api";
import { getOwnerMe } from "@/lib/owner-auth/api";
import {
  clearSession,
  getSessionSnapshot,
  snapshotToState,
} from "@/lib/owner-auth/session";
import {
  getBookingSettings,
  getBusiness,
  getServiceAreas,
  getWorkTypes,
  saveOwnerSettingsSection,
} from "@/lib/owner-settings-api";
import type { SettingsData, SettingsSection } from "@/lib/owner-settings";
import type { LoadResult } from "@/lib/owner-inquiries/types";
import { OwnerGate } from "../_components/owner-gate";
import { StatusPanel } from "../_components/status-panel";
import { useLoad } from "../_components/use-load";
import common from "../_components/owner-auth.module.css";
import SettingsForm from "./settings-form";

export default function OwnerSettings() {
  return (
    <OwnerGate screenName="업체 설정">
      {({ source }) =>
        source.kind === "live" ? (
          <LiveSettings key={source.token} token={source.token} />
        ) : (
          <SettingsStatus title="실제 업체 계정으로 로그인해 주세요.">
            <Link href="/owner/login">로그인하러 가기</Link>
          </SettingsStatus>
        )
      }
    </OwnerGate>
  );
}

function SettingsStatus({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className={common.page}>
      <header className={common.header}>
        <Link
          href="/owner/account"
          className={common.backLink}
          aria-label="내 계정으로"
        >
          ‹
        </Link>
        <h1 className={common.headerTitle}>업체 설정</h1>
      </header>
      <StatusPanel title={title} body="확인된 업체 정보만 보여드려요.">
        {children}
      </StatusPanel>
    </main>
  );
}

function currentSessionMatches(token: string) {
  const current = snapshotToState(getSessionSnapshot());
  return current.status === "active" && current.session.accessToken === token;
}

function LiveSettings({ token }: { token: string }) {
  const router = useRouter();
  const expire = useCallback(() => {
    if (!currentSessionMatches(token)) return;
    clearSession();
    router.replace("/owner/login?reason=expired");
  }, [token, router]);
  const load = useCallback(async (): Promise<LoadResult<SettingsData>> => {
    const signal = AbortSignal.timeout(8000);
    try {
      const [business, booking, work, regions, me] = await Promise.all([
        getBusiness(token, signal),
        getBookingSettings(token, signal),
        getWorkTypes(token, signal),
        getServiceAreas(token, signal),
        getOwnerMe(token, signal),
      ]);
      return {
        ok: true,
        data: {
          business,
          booking,
          workTypes: work.workTypes,
          serviceAreas: regions.serviceAreas,
          intakePaused: me.intakePaused,
        },
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expire();
      return { ok: false, code: "LOAD_FAILED" };
    }
  }, [token, expire]);
  const { result, reload } = useLoad(load);

  async function save(
    section: SettingsSection,
    draft: SettingsData,
    saved: SettingsData,
  ) {
    if (!currentSessionMatches(token))
      throw new Error("로그인 상태가 바뀌었어요. 다시 로그인해 주세요.");
    try {
      return await saveOwnerSettingsSection(
        token,
        section,
        saved,
        draft,
        AbortSignal.timeout(8000),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expire();
      if (error instanceof ApiError && error.status === 403)
        throw new Error("이 업체의 설정을 변경할 권한이 없어요.");
      if (
        error instanceof ApiError &&
        error.code === "AUTO_BOOKING_SETUP_INCOMPLETE"
      )
        throw new Error("자동 예약에 필요한 설정을 다시 확인해 주세요.");
      if (
        error instanceof ApiError &&
        error.code === "LUNCH_OUTSIDE_BUSINESS_HOURS"
      )
        throw new Error("점심시간이 영업시간 안에 있는지 확인해 주세요.");
      throw new Error("저장 결과를 확인하지 못했어요. 입력은 남겨 뒀어요.");
    }
  }

  if (result?.ok)
    return <SettingsForm initialData={result.data} onSave={save} />;
  return (
    <SettingsStatus
      title={
        result
          ? "업체 설정을 불러오지 못했어요."
          : "업체 설정을 불러오고 있어요…"
      }
    >
      {result && (
        <button
          type="button"
          className={common.button}
          onClick={() => void reload()}
        >
          다시 시도
        </button>
      )}
    </SettingsStatus>
  );
}
