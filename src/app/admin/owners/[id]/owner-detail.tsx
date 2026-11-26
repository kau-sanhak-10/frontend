"use client";

// 업체 상세 (O-01 · O-02 · O-03 · O-04 · O-05/06 안내)
// - 신청 심사(승인·거절)와 운영 상태(준비 중·운영 중·이용 제한)를 따로 처리합니다.
// - 승인만으로 자동 예약을 켜지 않습니다. 이용 제한도 기존 예약을 지우지 않습니다.
// - 그 업체의 고객·예약·문의 내용은 이 화면에서 보지 않습니다.
import Link from "next/link";
import { useCallback, useState } from "react";
import { AdminBar, AdminGate } from "../../_components/admin-gate";
import { OwnerBadges } from "../../_components/owner-badges";
import { useAdminLoad } from "../../_components/use-admin-load";
import admin from "../../_components/admin.module.css";
import auth from "../../../owner/_components/owner-auth.module.css";
import styles from "../../../owner/_components/owner-inquiries.module.css";
import { StatusPanel } from "../../../owner/_components/status-panel";
import { IntakeLinkSection } from "./intake-link-section";
import { LoginPhoneSection } from "./login-phone-section";
import { ReviewSection, StatusSection } from "./review-sections";
import {
  ADMIN_ERROR_MESSAGE,
  APPROVAL_LABEL,
  formatDateTime,
  ownerActionsOf,
} from "@/lib/admin/rules";
import type { AdminSession } from "@/lib/admin/session";
import { loadOwner } from "@/lib/admin/source";
import type { AdminOwner } from "@/lib/admin/types";
import { formatPhone } from "@/lib/owner-auth/phone";

export function OwnerDetail({
  ownerId,
  registered,
}: {
  ownerId: string;
  registered: boolean;
}) {
  return (
    <AdminGate>
      {(session) => (
        <main className={auth.page}>
          <AdminBar session={session} />
          <header className={styles.detailHeader}>
            <Link
              href="/admin"
              className={auth.backLink}
              aria-label="업체 목록으로 돌아가기"
            >
              ‹
            </Link>
            <h1 className={auth.headerTitle}>업체 상세</h1>
          </header>
          {registered ? (
            <p className={admin.okBox} role="status">
              업체를 등록했어요. 지금은 승인 대기 상태예요.
            </p>
          ) : null}
          <DetailBody session={session} ownerId={ownerId} />
        </main>
      )}
    </AdminGate>
  );
}

function DetailBody({
  session,
  ownerId,
}: {
  session: AdminSession;
  ownerId: string;
}) {
  const fetcher = useCallback(
    () => loadOwner(session, ownerId),
    [session, ownerId],
  );
  const { result, reload, setResult } = useAdminLoad(fetcher);
  // 처리 결과 안내 (처리자·처리 시각은 서버 기록에 남아요)
  const [notice, setNotice] = useState<string | null>(null);
  const onChanged = (owner: AdminOwner, okText: string) => {
    setResult({ ok: true, data: owner });
    setNotice(okText);
  };

  if (result === null) {
    return (
      <p className={auth.info} aria-busy="true">
        업체 정보를 불러오는 중이에요…
      </p>
    );
  }
  if (!result.ok) {
    return (
      <StatusPanel
        tone={result.code === "NOT_FOUND" ? "info" : "error"}
        title={
          result.code === "NOT_FOUND"
            ? "업체를 찾을 수 없어요."
            : "업체 정보를 불러오지 못했어요."
        }
        body={ADMIN_ERROR_MESSAGE[result.code]}
      >
        {result.code === "NOT_FOUND" ? (
          <Link
            href="/admin"
            className={`${auth.button} ${auth.secondary} ${auth.full}`}
          >
            업체 목록으로
          </Link>
        ) : (
          <button
            type="button"
            className={`${auth.button} ${auth.secondary} ${auth.full}`}
            onClick={() => void reload()}
          >
            다시 시도
          </button>
        )}
      </StatusPanel>
    );
  }

  const owner = result.data;
  const actions = ownerActionsOf(owner);

  return (
    <div className={styles.groups}>
      {notice ? (
        <p className={admin.okBox} role="status">
          {notice}
        </p>
      ) : null}
      <section className={auth.section} aria-labelledby="owner-info">
        <h2 id="owner-info" className={styles.detailTitle}>
          {owner.businessName}
        </h2>
        <OwnerBadges owner={owner} />
        <dl className={styles.fieldList}>
          <Field label="대표자">{owner.ownerName ?? "미입력"}</Field>
          <Field label="사장님 로그인 번호">{formatPhone(owner.phone)}</Field>
          <Field label="업체 대표 연락처">
            {owner.contactPhone ?? "미입력"}
          </Field>
          <Field label="주소">{owner.address ?? "미입력"}</Field>
          <Field label="서비스 설명">
            {owner.serviceDescription ?? "미입력"}
          </Field>
          <Field label="등록">{formatDateTime(owner.createdAt)}</Field>
          <Field label="신청 심사">
            {APPROVAL_LABEL[owner.approvalStatus]}
            {owner.reviewedAt
              ? ` · ${formatDateTime(owner.reviewedAt)}${
                  owner.reviewer ? ` · ${owner.reviewer.name}` : ""
                }`
              : ""}
          </Field>
          {owner.rejectionReason ? (
            <Field label="거절 사유">{owner.rejectionReason}</Field>
          ) : null}
          <Field label="자동 예약">
            {owner.autoBookingEnabled ? "켜짐" : "꺼짐"} · 사장님이 설정에서
            켜요
          </Field>
          {owner.intakePaused ? (
            <Field label="신규 접수">사장님이 잠시 멈춤</Field>
          ) : null}
        </dl>
        <p className={styles.fieldNote}>
          운영 화면에서는 업체·계정 정보만 봐요. 고객 상담·사진·예약 내용은
          보이지 않아요.
        </p>
      </section>

      {actions.canReview ? (
        <ReviewSection session={session} owner={owner} onChanged={onChanged} />
      ) : null}

      {owner.approvalStatus === "APPROVED" ? (
        <StatusSection
          session={session}
          owner={owner}
          canChange={actions.canChangeStatus}
          onChanged={onChanged}
        />
      ) : null}

      <IntakeLinkSection
        session={session}
        owner={owner}
        canIssue={actions.canIssueLink}
      />

      <LoginPhoneSection
        session={session}
        owner={owner}
        canChange={actions.canChangePhone}
        onChanged={onChanged}
      />

      <section className={auth.section} aria-labelledby="owner-kakao">
        <h2 id="owner-kakao" className={auth.sectionTitle}>
          카카오톡 채널 연결
        </h2>
        <p className={auth.info}>
          후속 확장 예정이에요. 이번 학기에는 웹 접수 링크만 관리해요.
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.field}>
      <dt className={styles.fieldLabel}>{label}</dt>
      <dd className={styles.fieldValue}>{children}</dd>
    </div>
  );
}
