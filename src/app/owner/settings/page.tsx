import Link from "next/link";
import common from "../_components/owner-auth.module.css";

export default function Page() {
  // 실제 own_ 세션 연결 전에는 mock 로그인으로 업체 정보를 읽거나 저장하지 않는다.
  return (
    <main className={common.page}>
      <h1 className={common.title}>업체 설정</h1>
      <p className={common.description}>
        실제 업체 설정은 사장님 인증 연결 후 이용할 수 있어요.
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
