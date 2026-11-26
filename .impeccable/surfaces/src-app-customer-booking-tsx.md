---
version: 1
slug: "src-app-customer-booking-tsx"
primary_target: "src/app/customer/booking.tsx"
related_targets:
  [
    "src/app/customer/booking.module.css",
    "src/app/customer/booking-preview/preview.tsx",
  ]
---

# FE-11 · 방문시간 선택·확인

## Direction contract

THESIS: 고객이 서버가 제시한 시간 중 하나를 고르고 별도 최종 확인한다. 선택을 예약 확정처럼 보이지 않게 한다.

OWN-WORLD: 기존 고객 접수의 흰 바탕·Noto Sans KR·주황 주요 동작·52px 버튼·10px 입력 모서리와 intake.module.css를 재사용한다.

STORY: 날짜별 가능시간 → 선택한 방문시간 확인 → 필요한 문자 인증 → 서버 확정 결과. 충돌은 재선택, 결과 미확인은 같은 요청 재확인, 발송 실패는 예약 확정과 구분한다.

FIRST VIEWPORT: 390px에서 56px 헤더 아래 업체명·설명, 날짜 입력, 날짜별 시간 라디오 목록. 고른 시간 확인 동작은 하단 고정. 결과 화면은 시간·예약번호·상태를 평면 목록으로 정렬한다.

FORM: 기존 고객 화면의 좁게 지정된 기능 확장. 사용자 지정 흐름을 따르므로 새 콘셉트/seed 없음. 화면 예시와 운영 API는 분리한다. 빠진 API나 인증을 임의 성공 처리하지 않는다.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
