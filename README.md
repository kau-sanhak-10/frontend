# 일로 프론트엔드

고객 웹 문의와 사장님 웹·PWA, 운영 웹을 위한 팀 프론트엔드 저장소입니다.
현재는 개발 환경과 기본 경로만 준비되어 있으며 실제 접수·인증·예약 기능은 아직 구현되지 않았습니다.

## 시작하기

Node.js 24.x와 npm 11.x를 사용합니다. 기준 버전은 `.nvmrc`와 `package.json`에 있습니다.

```powershell
git clone https://github.com/kau-sanhak-10/frontend.git
cd frontend
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Windows PowerShell에서는 `npm.cmd`, macOS·Linux에서는 `npm`을 사용하세요.
브라우저에서 http://localhost:3000 을 열면 됩니다.

## 기본 구성

| 위치             | 역할                                          |
| ---------------- | --------------------------------------------- |
| `src/app`        | Next.js App Router 화면·레이아웃·PWA manifest |
| `/customer`      | 고객 문의 화면 경로                           |
| `/owner`         | 사장님 관리 화면 경로·PWA 시작 화면           |
| `/admin`         | 운영 관리 화면 경로                           |
| `src/lib/api.ts` | Spring Boot 공통 응답 처리                    |
| `public`         | 이미지·아이콘 등 정적 파일                    |
| `tests`          | Node.js 기본 테스트                           |

화면을 개발할 때 해당 역할의 `src/app/customer`, `owner`, `admin` 폴더를 만들고,
현재 공통 개발 준비 화면을 실제 화면으로 교체합니다. 아직 관리자 인증이 없으므로 실제 고객 데이터를 넣지 마세요.

## 백엔드 연결 기준

- 백엔드 기본 주소는 `http://localhost:8080`, 프론트는 `http://localhost:3000`입니다.
- `.env.local`의 `NEXT_PUBLIC_API_BASE_URL`을 API 서버 주소로 설정합니다. 배포 환경은 Vercel에서 설정합니다.
- API의 `{ success, code, message, result }` 형식은 백엔드 `ApiResponse`와 맞춥니다.
- `requestApi<T>()`는 성공 시 `result`, 실패 시 HTTP 상태·코드·메시지·오류 정보를 담은 `ApiError`를 반환합니다.
- JSON 요청은 `Content-Type: application/json`을 지정하고 `JSON.stringify()`로 보냅니다. 사진 업로드 `FormData`에는 Content-Type을 직접 지정하지 않습니다.
- `/actuator/health`는 응답 규격이 다르므로 일반 `fetch()`로 확인합니다.
- 실제 경로·필드·인증 방식은 백엔드 Swagger(`http://localhost:8080/swagger-ui/index.html`)와 협의한 명세를 따릅니다. 토큰 저장이나 임의의 API 경로는 아직 정하지 않았습니다.
- AI·Jev·Vision 호출, 예약 가능시간 계산, 알림톡·SMS는 백엔드에서 처리합니다. AI 키를 프론트 환경변수에 넣지 않습니다.
- 배포 시 백엔드 `CORS_ALLOWED_ORIGINS`에 프론트 주소를 등록해야 합니다.

## 검사·빌드

```powershell
npm.cmd run format
npm.cmd run check
npm.cmd run build
```

`check`는 서식·ESLint·TypeScript·API 공통 처리 테스트를 실행합니다.
`develop`·`main`으로 보내는 PR에서도 GitHub Actions가 검사와 빌드를 실행합니다.

현재 Next.js ESLint 플러그인의 하위 개발 의존성 `braces`에 미해결 보안 경고가 있습니다.
이 경로는 코드 검사에 사용되며 서비스 런타임 패키지에는 포함되지 않습니다.
외부에서 받은 glob 패턴을 검사 설정에 넣지 말고, 상위 패키지에서 수정 버전을 제공하면 업데이트합니다.
`npm audit fix --force`는 Next.js 검사 설정을 구버전으로 내리므로 사용하지 않습니다.
ESLint는 Next.js의 React 플러그인이 지원하는 9.x로 고정했습니다.

## 팀 Git 사용 기준

- `develop`: 팀 개발 통합 브랜치, `main`: 배포 기준 브랜치입니다.
- 평소 작업은 `develop`에서 분기한 별도 작업 브랜치에서 진행합니다.
- 예: `feat/#이슈번호-customer-inquiry`, `fix/#이슈번호-reservation`, `chore/#이슈번호-setup`.
- 커밋은 `feat:`, `fix:`, `chore:`, `docs:` 등 백엔드와 같은 유형을 사용합니다.
- 변경을 push한 뒤 `develop` 대상으로 PR을 열어 팀원이 검토합니다. 공용 브랜치에 직접 push하지 않습니다.
- 조직의 공통 PR 템플릿을 사용합니다. `.env.local`·키·고객 개인정보는 커밋하지 않습니다.
- 최초 세팅 브랜치 `codex/frontend-initial-setup`은 도구 작업용입니다.

## 웹·PWA 및 배포

Next.js 프로젝트를 Vercel에 연결하고 설치 `npm ci`, 빌드 `npm run build`를 사용합니다.
저장소·Vercel 팀 계정 연결과 실제 배포 도메인은 팀에서 확정합니다. 이 초기 세팅으로 배포 계정이나 유료 서비스를 생성하지 않습니다.

고객은 웹 링크로 문의하고 사장님은 같은 웹을 사용하거나 홈 화면에 추가할 수 있습니다.
manifest와 설치용 아이콘이 준비되어 있으며 HTTPS 배포 후 휴대폰에서 설치 동작을 확인합니다.
Android는 브라우저의 설치 메뉴, iPhone은 Safari의 공유 → 홈 화면에 추가를 사용합니다.
오프라인 예약·고객정보 캐시·웹 푸시는 구현하지 않았습니다. 예약 확정에는 서버 연결이 필요합니다.
현재 아이콘은 개발용 임시 아이콘으로 최종 브랜드 이미지가 정해지면 교체합니다.
