import Link from "next/link";

export default function Home() {
  return (
    <main>
      <p className="label">일로 · 현장비서 덕구</p>
      <h1>프론트엔드 개발 환경</h1>
      <p>
        초기 환경 확인용 화면입니다. 고객 접수·예약 등 실제 서비스 기능은 아직
        연결되지 않았습니다.
      </p>
      <nav aria-label="사용자별 개발 화면">
        <ul>
          <li>
            <Link href="/customer">고객 문의 화면</Link>
          </li>
          <li>
            <Link href="/owner">사장님 관리 화면</Link>
          </li>
          <li>
            <Link href="/admin">운영 관리 화면</Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}
