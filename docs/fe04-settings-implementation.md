# FE-04 구현·FE-07 연결 인계

2026-11-02 기준. FE-04 화면과 입력/저장 검증 및 FE-07 호출 모듈 준비 기록이다. 실제 문자 인증·서버 저장을 완료한 기록은 아니다. 제품 정책은 `PRODUCT.md`, 화면 방향은 `.impeccable/surfaces/src-app-owner-settings-page-tsx.md`가 소유한다.

## 구현 범위와 기존 스타일 근거

- `src/app/owner/settings/settings-form.tsx`: 업체정보·방문지역·영업시간·작업시간·접수/예약을 항목별로 편집·저장·취소한다. 다른 항목의 미저장 입력은 유지하고 실패 시 입력을 보존한다.
- 기존 `src/app/owner/_components/owner-auth.module.css`의 페이지·헤더·폼·입력·버튼·안내 스타일을 직접 재사용한다. 최대 너비 430px, 52px 입력창, 10px 입력/버튼 모서리, 흰 배경과 주황 주요 동작을 유지한다. 글꼴은 기존 `src/app/globals.css`의 Noto Sans KR 우선 스택을 따른다.
- `settings.module.css`는 평면 설정 행·시간 쌍·하단 저장 영역 등 새 화면에 필요한 배치만 보완한다. 주황 저장 버튼의 글자는 이 화면에서 어두운 색으로 지정한다. 새 전역 테마나 디자인 시스템을 만들지 않았다.
- 시각 기준은 기존 Figma B11(2030:212)·B12(2030:260)이다. `public/owner/settings-back.svg`는 B11의 기존 뒤로가기 자산에서 가져왔다. 이 변경에 배포되는 래스터 이미지는 없다.

## 미리보기와 운영 경계

- `/owner/settings-preview`는 서버 환경변수 `OWNER_SETTINGS_PREVIEW_ENABLED=true`일 때만 열린다. 기본값은 비활성화이며 그 외에는 404다. 운영 환경에는 활성화하지 않는다.
- 예시 업체/지역 데이터와 저장 결과는 브라우저 메모리에만 존재한다. 새로고침하면 초기화된다. ‘다음 저장 실패 테스트’로 오류 후 입력 보존과 재시도를 확인할 수 있다.
- `/owner/settings`는 실제 인증 연결 전 안내 화면만 표시한다. 기존 mock 로그인으로 실제 업체 설정을 읽거나 저장하지 않는다.
- 출발지 주소는 읽기 전용이고 방문지역 추가는 미리보기의 세 예시 지역만 지원한다. BE-15 주소·행정지역 검색은 연결하지 않았다.

## FE-07 연결 지점

`SettingsForm`에 검증된 `initialData`와 `onSave(section, draft): Promise<SettingsData>`를 전달한다. 저장 콜백은 해당 항목만 저장하고, 서버가 확정한 전체 설정 스냅샷을 반환해야 한다. 화면의 메모리 저장을 실제 연결 완료로 간주하지 않는다.

`src/lib/owner-settings-api.ts`는 기존 `requestApi`를 통해 다음 계약을 호출한다. API 기준 주소는 `NEXT_PUBLIC_API_BASE_URL`이다.

| 항목                              | 경로(`/api/v1/owner/` 기준)     | 메서드    |
| --------------------------------- | ------------------------------- | --------- |
| 업체정보                          | `business`                      | GET / PUT |
| 방문지역                          | `service-areas`                 | GET / PUT |
| 영업시간·점심·한도·여유시간       | `booking-settings`              | GET / PUT |
| 제공 작업·작업시간·자동 예약 허용 | `work-types`                    | GET / PUT |
| 자동 예약 전체 ON/OFF             | `booking-settings/auto-booking` | PATCH     |
| 신규 접수 중지                    | `intake`                        | PATCH     |

영업시간 PUT은 `autoBookingEnabled`를 보내지 않는다. 자동 예약과 접수 중지는 별도 PATCH이며, 접수/예약 항목의 두 요청은 원자적 저장이 아니다. 실제 연결 시 부분 성공 후 서버 상태 재조회와 오류 안내를 검증한다. 자동 예약 활성화 조건은 저장된 설정을 기준으로 확인한다.

`src/lib/owner-auth/api.ts`는 문자 인증 요청/확인, 업체 계정 조회·이름 수정, 로그아웃 호출을 준비한다. 호출자가 실제 `own_` 토큰을 전달해야 하며 이 모듈은 토큰을 저장하지 않는다. 기존 인증 화면/mock 세션을 이 모듈로 자동 전환하지 않았다. 전화번호는 검증 후 입력 형식을 그대로 보내므로 하이픈 허용 여부는 서버 계약으로 최종 확인한다.

백엔드 PR #21은 아직 열려 있다. DTO 기준 호출 준비와 모의 응답 검증까지만 완료했다. 병합·배포 후 실제 SMS, 승인된 ACTIVE 계정, 토큰 만료/로그아웃, 각 설정의 재조회·영속 저장, 검색 결과의 주소/좌표·지역 코드, 부분 저장 실패를 확인한 뒤 운영 경로를 연결한다.

## 검증 기록과 재실행

구현 담당 검증 결과: lint·typecheck·전체 Node 테스트 33개 통과, `next build --webpack` 통과. 이 작업 환경의 `node_modules`가 junction이라 빌드는 webpack을 사용했다. 브라우저 검증은 아래 10개 그룹을 통과했다.

- 항목별 입력 유지·저장·취소, 필수값/공백 오류·실패 후 재저장
- 시간 역전·점심·정수 한도, 제공 작업과 자동 예약 허용 분리
- 지역 중복 방지·필수 설정 누락·신규 접수 중지 분리
- 320·390·411·1440px 화면의 가로 넘침 없음(4개 그룹)
- 운영 경로 차단·외부 요청 없음·화면 오류 없음

작업시간을 비운 뒤 작업 제공을 끄면 숨겨진 잘못된 시간이 저장을 막던 문제는 마지막 저장값을 복원하도록 수정했고, 다시 켰을 때 그 시간이 유지되는 브라우저 회귀 검증을 포함했다. 미리보기 검증은 실제 API 통합·실문자·실기기 검증을 대체하지 않는다.

프로젝트 루트에서:

```powershell
npm run lint
npm run typecheck
npm test
npm run build -- --webpack
```

미리보기 실행(별도 터미널):

```powershell
$env:OWNER_SETTINGS_PREVIEW_ENABLED = 'true'
npm run dev -- --port 3112
```

브라우저 검증은 개발 환경에 이미 설치된 Playwright와 Chromium을 사용한다. 이 프로젝트에 새 의존성을 추가하지 않았다. 아래 모듈 경로는 실제 설치 위치로 바꾼다.

```powershell
$env:PLAYWRIGHT_MODULE = 'file:///C:/실제/설치위치/playwright/index.mjs'
$env:PREVIEW_BASE_URL = 'http://127.0.0.1:3112'
node tests/owner-settings.browser.mjs
```

브라우저 검증 스크린샷은 `.impeccable/review/`에 생성되며 커밋 대상이 아니다. 이번 작업은 기존 시각 체계의 확장이므로 전역 `DESIGN.md`나 `.impeccable/design.json`을 새로 작성하지 않았다.
