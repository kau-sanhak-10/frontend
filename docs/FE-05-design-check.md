# FE-05 디자인 계승 확인

- 범위: 기존 Figma C02·C03·C05의 고객 상담·사진 보완·접수 확인 확장. 새 시각 체계나 전역 토큰은 만들지 않았다.
- 기준: `PRODUCT.md`, `docs/FE-05.md` Direction contract, `intake.module.css`, `globals.css`, 로컬 Figma 참조 `figma-chat.png`.
- 계승값: 흰 배경, Noto Sans KR → Malgun Gothic → system-ui, 본문 16px, 최대 폭 430px, 제목 영역 최소 56px.
- 고객 영역은 기존 `intake.module.css`를 직접 재사용한다. 잉크 #242527, 보조 글자 #56595c, 경계 #e4e4e4, 주요 동작 #ff9200을 유지한다.
- 보조 동작·첨부·전송은 최소 44px, 주요 동작은 최소 52px·모서리 10px. 대화는 회색 #f7f7f8·모서리 16px, 입력 글자는 16px다.
- 정적 화면 확인: `.impeccable/review/`의 `mobile.png`, `desktop.png`, `mobile-retake.png`, `mobile-send-failure.png`, `flow-summary.png`를 열어 참조와 대조했다.
- 확인된 구성: 좌우 대화·사진·하단 입력, 그림과 라벨 예시의 병렬 촬영 안내, 미확인 항목·출처 표시, 전송 실패 시 사진·내용과 첨부 취소 동작의 노출.
- Figma와의 의도된 차이: 가짜 상태바를 제외하고 예시·미연결 안내, 정리된 접수 정보 확인 동작, 실패·미확인 상태를 추가했다.
- 사진 출처: `public/customer/boiler-example.png`의 내장 설명에서 Figma `HOqnylvpN0CFRzcywqnLRR` 노드 `2074:1640`·자산 `427a2.png`, 변경 없는 합성 예시·실제 고객 사진 아님을 확인했다.
- SVG: C02/C03 `get_design_context`에서 받은 로컬 `plus.svg`, `send.svg`, `label-guide.svg`를 사용하며 실제 참조 경로·벡터 내용을 확인했다.
- 검증 한계: 이 문서는 로컬 코드·정적 캡처 확인이다. `review/results.json`의 320/390/1440px·복구 흐름 통과 기록은 읽었으나 여기서 브라우저 검사를 재실행하지 않았다.
- 외부 API·AI 분석·문자 인증·예약·실제 저장 및 원격 파일 정리는 검증하지 않았다. 전체 제품 또는 실서비스 완료 판정이 아니다.
