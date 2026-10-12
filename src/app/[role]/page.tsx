import Link from "next/link";
import { notFound } from "next/navigation";

const roles: Record<string, { title: string; description: string }> = {
  customer: {
    title: "고객 문의",
    description: "대화·사진 제출·정보 보완·방문시간 선택·예약 확인",
  },
  owner: {
    title: "사장님 관리",
    description: "접수 확인·확인 요청 처리·방문 예약 관리",
  },
  admin: { title: "운영 관리", description: "업체·접수 채널·업무 규칙 관리" },
};

export function generateStaticParams() {
  return Object.keys(roles).map((role) => ({ role }));
}

export default async function RolePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  const content = Object.hasOwn(roles, role) ? roles[role] : undefined;
  if (!content) notFound();
  return (
    <main>
      <p className="label">개발 준비 화면</p>
      <h1>{content.title}</h1>
      <p>{content.description}</p>
      <p>
        화면 경로만 준비되어 있습니다. 인증·데이터 조회·예약 기능은 아직
        구현되지 않았습니다.
      </p>
      <Link href="/">개발 홈으로 돌아가기</Link>
    </main>
  );
}
