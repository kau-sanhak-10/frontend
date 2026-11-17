import type { Metadata } from "next";
import Link from "next/link";
import styles from "../../_components/owner-auth.module.css";
import { PhoneChangeRequestForm } from "./phone-change-request";

export const metadata: Metadata = { title: "로그인 번호 변경 요청 | 일로" };

export default function PhoneChangePage() {
  if (process.env.OWNER_AUTH_PREVIEW_ENABLED !== "true") {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>로그인 번호 변경</h1>
        <p className={styles.description}>
          휴대전화번호를 바꿨거나 잃어버렸다면 운영팀에 문의해 주세요. 운영팀이
          본인과 업체를 확인한 뒤 변경할 수 있어요.
        </p>
        <Link
          href="/owner/login"
          className={`${styles.button} ${styles.secondary}`}
        >
          로그인으로 돌아가기
        </Link>
      </main>
    );
  }
  return <PhoneChangeRequestForm />;
}
