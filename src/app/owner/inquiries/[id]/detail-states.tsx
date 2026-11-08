import Link from "next/link";
import { StatusPanel } from "../../_components/status-panel";
import auth from "../../_components/owner-auth.module.css";
import styles from "../../_components/owner-inquiries.module.css";

/** 상세·대화 화면 공통: 불러오는 중 */
export function DetailSkeleton() {
  return (
    <div className={styles.groups} aria-busy="true" aria-live="polite">
      <span className={styles.srOnly}>불러오는 중이에요…</span>
      <div className={styles.skeletonCard} aria-hidden="true">
        <span className={`${styles.skeleton} ${styles.skeletonMid}`} />
        <span className={`${styles.skeleton} ${styles.skeletonShort}`} />
      </div>
      <div className={styles.skeletonCard} aria-hidden="true">
        <span className={`${styles.skeleton} ${styles.skeletonShort}`} />
        <span className={styles.skeleton} />
        <span className={styles.skeleton} />
        <span className={`${styles.skeleton} ${styles.skeletonMid}`} />
      </div>
    </div>
  );
}

/** 상세·대화 화면 공통: 조회 실패 또는 없는 접수 */
export function DetailError({
  code,
  onRetry,
}: {
  code: "LOAD_FAILED" | "NOT_FOUND";
  onRetry: () => void;
}) {
  if (code === "NOT_FOUND") {
    return (
      <StatusPanel
        title="접수를 찾을 수 없어요."
        body="삭제됐거나 볼 수 있는 권한이 없는 접수예요."
      >
        <Link
          href="/owner/inquiries"
          className={`${auth.button} ${auth.secondary} ${auth.full}`}
        >
          접수함으로 돌아가기
        </Link>
      </StatusPanel>
    );
  }
  return (
    <StatusPanel
      tone="error"
      title="접수 내용을 불러오지 못했어요."
      body="잠시 후 다시 시도해 주세요. 접수 내용은 지워지지 않았어요."
    >
      <button
        type="button"
        className={`${auth.button} ${auth.secondary} ${auth.full}`}
        onClick={onRetry}
      >
        다시 시도
      </button>
    </StatusPanel>
  );
}
