import styles from "../../owner/_components/owner-inquiries.module.css";
import admin from "./admin.module.css";
import { APPROVAL_LABEL, OWNER_STATUS_LABEL } from "@/lib/admin/rules";
import type { AdminOwnerItem } from "@/lib/admin/types";

/** 신청 심사 상태와 운영 상태를 따로 보여 줍니다. 운영 상태는 승인된 업체만 의미가 있어요. */
export function OwnerBadges({ owner }: { owner: AdminOwnerItem }) {
  const approval =
    owner.approvalStatus === "PENDING"
      ? styles.badgeAttention
      : owner.approvalStatus === "REJECTED"
        ? admin.badgeError
        : styles.badgeSuccess;
  const status =
    owner.status === "ACTIVE"
      ? styles.badgeSuccess
      : owner.status === "RESTRICTED"
        ? admin.badgeError
        : admin.badgeMuted;
  return (
    <span className={admin.statusPair}>
      <span className={`${styles.badge} ${approval}`}>
        신청 {APPROVAL_LABEL[owner.approvalStatus]}
      </span>
      {owner.approvalStatus === "APPROVED" ? (
        <span className={`${styles.badge} ${status}`}>
          {OWNER_STATUS_LABEL[owner.status]}
        </span>
      ) : null}
    </span>
  );
}
