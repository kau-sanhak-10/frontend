import Link from "next/link";
import common from "../_components/owner-auth.module.css";

export default function Page() {
  // 실제 설정 저장을 연결하기 전에는 예시 폼을 운영 경로에 노출하지 않는다.
  return (
    <main className={common.page}>
      <h1 className={common.title}>업체 설정</h1>
      <p className={common.description}>
        실제 업체 설정은 아직 연결되지 않았어요.
      </p>
      <Link
        className={`${common.button} ${common.secondary}`}
        href="/owner/login"
      >
        사장님 로그인으로
      </Link>
    </main>
  );
}
