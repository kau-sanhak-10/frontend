import Link from "next/link";
import auth from "./owner-auth.module.css";
import { StatusPanel } from "./status-panel";

/**
 * 실제 로그인에서 아직 서버 기능이 없는 화면 (FE-13)
 * 예시 데이터를 실제 업무처럼 보여 주지 않기 위해 따로 안내합니다.
 */
export function WorkNotReady({ what }: { what: string }) {
  return (
    <StatusPanel
      title={`${what}은 서버 연결을 준비하고 있어요.`}
      body="지금은 접수함에서 문의와 방문 예약을 확인해 주세요."
    >
      <Link
        href="/owner/inquiries"
        className={`${auth.button} ${auth.secondary} ${auth.full}`}
      >
        접수함으로 가기
      </Link>
    </StatusPanel>
  );
}
