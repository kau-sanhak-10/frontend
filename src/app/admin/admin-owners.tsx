"use client";

// 업체 목록 (O-01 · O-02)
// 신청 심사(승인 대기·승인·거절)와 운영 상태(준비 중·운영 중·이용 제한)를 따로 걸러 봅니다.
// 목록에는 업체·계정 정보만 있고, 그 업체의 고객·예약·문의 내용은 보여 주지 않습니다.
import Link from "next/link";
import { useCallback, useState } from "react";
import { AdminBar, AdminGate } from "./_components/admin-gate";
import { OwnerBadges } from "./_components/owner-badges";
import { useAdminLoad } from "./_components/use-admin-load";
import admin from "./_components/admin.module.css";
import auth from "../owner/_components/owner-auth.module.css";
import styles from "../owner/_components/owner-inquiries.module.css";
import { StatusPanel } from "../owner/_components/status-panel";
import {
  ADMIN_ERROR_MESSAGE,
  OWNER_STATUS_LABEL,
  formatDate,
} from "@/lib/admin/rules";
import type { AdminSession } from "@/lib/admin/session";
import { loadOwners } from "@/lib/admin/source";
import type {
  AdminOwnerFilter,
  ApprovalStatus,
  OwnerStatus,
} from "@/lib/admin/types";
import { formatPhone } from "@/lib/owner-auth/phone";

const TABS: { key: ApprovalStatus | "ALL"; label: string }[] = [
  { key: "PENDING", label: "승인 대기" },
  { key: "APPROVED", label: "승인" },
  { key: "REJECTED", label: "거절" },
  { key: "ALL", label: "전체" },
];

export function AdminOwners() {
  return (
    <AdminGate>
      {(session) => (
        <main className={auth.page}>
          <AdminBar session={session} />
          <header className={styles.cardTop}>
            <h1 className={auth.headerTitle}>업체 관리</h1>
            <Link
              href="/admin/owners/new"
              className={`${auth.button} ${auth.primary} ${auth.small}`}
            >
              + 업체 등록
            </Link>
          </header>
          <OwnerList session={session} />
        </main>
      )}
    </AdminGate>
  );
}

function OwnerList({ session }: { session: AdminSession }) {
  const [tab, setTab] = useState<ApprovalStatus | "ALL">("PENDING");
  const [status, setStatus] = useState<OwnerStatus | "">("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AdminOwnerFilter>({
    approvalStatus: "PENDING",
  });

  const apply = (next: Partial<AdminOwnerFilter>) =>
    setFilter((f) => ({ ...f, page: 0, ...next }));

  const fetcher = useCallback(
    () => loadOwners(session, filter),
    [session, filter],
  );
  const { result, reload } = useAdminLoad(fetcher);
  const showStatus = tab === "APPROVED" || tab === "ALL";

  return (
    <div className={styles.groups}>
      <div className={styles.tabs} role="tablist" aria-label="신청 심사 상태">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              const keep = t.key === "APPROVED" || t.key === "ALL";
              if (!keep) setStatus("");
              apply({
                approvalStatus: t.key === "ALL" ? undefined : t.key,
                status: keep ? status || undefined : undefined,
              });
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form
        className={admin.filters}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: query });
        }}
      >
        <label className={styles.srOnly} htmlFor="owner-q">
          업체 검색
        </label>
        <input
          id="owner-q"
          className={admin.select}
          placeholder="상호·대표자 이름·로그인 번호"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {showStatus ? (
          <>
            <label className={styles.srOnly} htmlFor="owner-status">
              운영 상태
            </label>
            <select
              id="owner-status"
              className={admin.select}
              value={status}
              onChange={(e) => {
                const v = e.target.value as OwnerStatus | "";
                setStatus(v);
                apply({ status: v || undefined });
              }}
            >
              <option value="">운영 상태 전체</option>
              {(Object.keys(OWNER_STATUS_LABEL) as OwnerStatus[]).map((s) => (
                <option key={s} value={s}>
                  {OWNER_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <button
          type="submit"
          className={`${auth.button} ${auth.secondary} ${auth.small}`}
        >
          검색
        </button>
      </form>

      {result === null ? (
        <p className={auth.info} aria-busy="true">
          업체 목록을 불러오는 중이에요…
        </p>
      ) : !result.ok ? (
        <StatusPanel
          tone="error"
          title="업체 목록을 불러오지 못했어요."
          body={ADMIN_ERROR_MESSAGE[result.code]}
        >
          <button
            type="button"
            className={`${auth.button} ${auth.secondary} ${auth.full}`}
            onClick={() => void reload()}
          >
            다시 시도
          </button>
        </StatusPanel>
      ) : result.data.items.length === 0 ? (
        <p className={auth.info}>
          {filter.q
            ? "검색한 업체가 없어요."
            : tab === "PENDING"
              ? "승인을 기다리는 신청이 없어요."
              : "해당하는 업체가 없어요."}
        </p>
      ) : (
        <>
          <p className={auth.hint}>모두 {result.data.totalElements}곳</p>
          <ul className={styles.cardList}>
            {result.data.items.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/owners/${encodeURIComponent(o.id)}`}
                  className={styles.inquiryCard}
                >
                  <span className={styles.cardTop}>
                    <span className={styles.cardTitle}>
                      {o.businessName}
                      {o.ownerName ? ` · ${o.ownerName}` : ""}
                    </span>
                  </span>
                  <OwnerBadges owner={o} />
                  <span className={styles.cardNote}>
                    로그인 번호 {formatPhone(o.phone)} · 등록{" "}
                    {formatDate(o.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {result.data.page > 0 || !result.data.isLast ? (
            <div className={admin.pager}>
              <button
                type="button"
                className={`${auth.button} ${auth.secondary} ${auth.small}`}
                disabled={result.data.page === 0}
                onClick={() =>
                  setFilter((f) => ({ ...f, page: (f.page ?? 0) - 1 }))
                }
              >
                이전
              </button>
              <span className={auth.hint}>{result.data.page + 1}쪽</span>
              <button
                type="button"
                className={`${auth.button} ${auth.secondary} ${auth.small}`}
                disabled={result.data.isLast}
                onClick={() =>
                  setFilter((f) => ({ ...f, page: (f.page ?? 0) + 1 }))
                }
              >
                다음
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
