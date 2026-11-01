# PR #10 사장님 화면 보완

## 반영 범위

- FE-06은 화면·목업 구현, 실제 고객·예약 API 연결은 FE-07로 유지한다.
- 상세·대화·사진 근거에서 첨부 이미지 원본을 새 탭으로 열어 브라우저에서 확대한다.
- 여러 사진을 모두 표시하고, 요약 실패 시에도 원문·사진 조회를 유지한다. 사진 로딩 실패는 해당 사진에만 표시하고 재시도를 제공한다.
- 예시 접수·예약 안내를 표시한다. 예시 링크는 복사·공유·미리보기를 비활성화하고 실제 발급 링크와 구분한다.
- 홈에서 내 계정으로 이동해 기존 로그아웃 기능을 이용한다.
- 메시지 전송·접수 정보 수정·종료 처리는 이번 보완에서 추가하지 않는다. QR은 이번 구현에서 제외한다.

## 확인 방법

1. `npm run check`와 `npm run build`로 검사한다. 검수 환경의 node_modules junction은 Turbopack 대상 루트 밖이므로 이 환경에서는 `npx next build --webpack`을 사용한다.
2. `npm run dev -- --webpack --port 3110`으로 개발 서버를 실행한다.
3. 별도 터미널에서 `PLAYWRIGHT_MODULE_PATH`를 설치된 Playwright의 `index.mjs` 경로로 지정하고 `node tests/owner-review.browser.mjs`를 실행한다. 이미 프로젝트에서 Playwright를 사용할 수 있으면 경로 지정은 생략한다. 새 런타임 의존성은 추가하지 않았다.
4. 직접 확인할 때는 `/owner/login`에서 개발용 번호 `010-1111-2222`, 고정 예시 인증번호 `123456`으로 로그인한다. 실제 문자는 발송하지 않는다.
5. `/owner/inquiries/inq-106?mock=summaryfail`은 요약 실패, `?mock=photos`는 복수 사진 확인용이다. 사진 오류는 테스트가 해당 이미지 요청을 차단해 재현한다. `mock` 스위치는 개발 서버에서만 동작한다.

## 예시 이미지 출처

`public/owner/examples/boiler-example.png`는 FE-05의 `public/customer/boiler-example.png`를 그대로 재사용했다. 기존 Figma에서 가져온 합성 예시 이미지이며 실제 고객 자료가 아니다. 원본 PNG에 포함된 출처 정보를 유지했다. 복수 사진 테스트는 같은 예시 자산을 두 첨부로 사용한다.

실제 사진 저장소 권한·발급 URL·만료 처리는 FE-07 서버 연동에서 검증한다. 실제 링크의 업체 접수 연결도 그때 검증한다.
