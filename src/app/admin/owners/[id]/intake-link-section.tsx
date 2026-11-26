"use client";

// 웹 접수 링크 발급·재발급 (O-04)
// 재발급하면 기존 링크는 바로 못 쓰게 되므로, 확인창에서 확인한 경우에만 서버를 부릅니다.
// 공개 접수 링크로는 기존 고객 정보를 볼 수 없습니다. QR은 이번 구현에서 제외합니다.
import { useState } from "react";
import admin from "../../_components/admin.module.css";
import auth from "../../../owner/_components/owner-auth.module.css";
import styles from "../../../owner/_components/owner-inquiries.module.css";
import { ADMIN_ERROR_MESSAGE } from "@/lib/admin/rules";
import type { AdminSession } from "@/lib/admin/session";
import { issueIntakeLink } from "@/lib/admin/source";
import type { AdminOwner } from "@/lib/admin/types";

export const REISSUE_CONFIRM =
  "기존 링크는 더 이상 쓸 수 없습니다. 계속할까요?";

export function IntakeLinkSection({
  session,
  owner,
  canIssue,
}: {
  session: AdminSession;
  owner: AdminOwner;
  canIssue: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const hasLink = owner.intakeLinkActive || url !== null;

  async function issue() {
    setBusy(true);
    setError(null);
    setCopied(false);
    const res = await issueIntakeLink(session, owner.id);
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      setError(`${ADMIN_ERROR_MESSAGE[res.code]} 기존 링크는 그대로예요.`);
      return;
    }
    setUrl(res.data.url);
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("복사하지 못했어요. 주소를 길게 눌러 직접 복사해 주세요.");
    }
  }

  return (
    <section className={auth.section} aria-labelledby="owner-link">
      <h2 id="owner-link" className={auth.sectionTitle}>
        웹 접수 링크
      </h2>
      {!canIssue ? (
        <p className={auth.info}>
          {owner.approvalStatus === "APPROVED"
            ? "탈퇴한 업체라 접수 링크를 발급할 수 없어요."
            : "승인된 업체에만 접수 링크를 발급할 수 있어요."}
        </p>
      ) : (
        <>
          <p className={auth.info}>
            {hasLink
              ? "고객 접수 링크를 쓰고 있어요. 사장님 홈에서 같은 링크를 볼 수 있어요."
              : "아직 발급한 접수 링크가 없어요."}{" "}
            공개 링크로는 기존 고객 정보가 보이지 않아요.
          </p>
          {url ? (
            <>
              <p className={styles.linkUrl}>{url}</p>
              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={`${auth.button} ${auth.secondary}`}
                  onClick={() => void copy()}
                >
                  {copied ? "복사했어요" : "링크 복사"}
                </button>
                <a
                  className={`${auth.button} ${auth.secondary}`}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  열어 보기
                </a>
              </div>
              <p className={admin.okBox} role="status">
                새 링크를 발급했어요. 이전 링크로는 새 접수를 받을 수 없어요.
              </p>
            </>
          ) : null}
          {error ? (
            <p className={admin.failBox} role="alert">
              {error}
            </p>
          ) : null}
          {confirming ? (
            <div
              className={admin.panel}
              role="alertdialog"
              aria-label="링크 재발급 확인"
            >
              <p className={styles.cardTitle}>{REISSUE_CONFIRM}</p>
              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={`${auth.button} ${auth.secondary}`}
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={`${auth.button} ${auth.primary}`}
                  disabled={busy}
                  onClick={() => void issue()}
                >
                  {busy ? "발급하는 중…" : "재발급"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`${auth.button} ${auth.secondary} ${auth.full}`}
              onClick={() => {
                setError(null);
                if (hasLink) setConfirming(true);
                else void issue();
              }}
            >
              {hasLink ? "링크 재발급" : "링크 발급"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
