import Link from "next/link";

export default function CustomerPage() {
  return (
    <main>
      <h1>고객 문의</h1>
      <p>업체에서 받은 접수 링크로 접속해 주세요.</p>
      <p>
        업체 확인·동의·방문정보 화면이 준비되어 있으며 실제 접수 저장과 인증은
        후속 작업에서 연결합니다.
      </p>
      {process.env.CUSTOMER_PREVIEW_ENABLED === "true" && (
        <p>
          <Link href="/customer/preview">FE-03 고객 화면 확인</Link>
        </p>
      )}
      <Link href="/">개발 홈으로 돌아가기</Link>
    </main>
  );
}
