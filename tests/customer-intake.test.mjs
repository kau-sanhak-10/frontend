import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyVisitInfo,
  validateVisitInfo,
  intakeStatusCopy,
} from "../src/lib/customer-intake.ts";

const valid = {
  ...emptyVisitInfo,
  name: "테스트",
  phone: "010-1234-5678",
  address: "경기 고양시 테스트로 1",
};
test("작업 유형·사진·모델명 없이 방문정보를 입력할 수 있다", () => {
  assert.deepEqual(validateVisitInfo(valid, []), {});
});
test("공백 필수값과 연락처 오류를 항목별로 돌려준다", () => {
  assert.deepEqual(
    Object.keys(
      validateVisitInfo(
        { ...valid, name: " ", phone: "010123", address: " " },
        [],
      ),
    ),
    ["name", "phone", "address"],
  );
});
test("휴대전화번호를 자르거나 유효하지 않은 문자를 제거해 통과시키지 않는다", () => {
  for (const phone of [
    "010123456789",
    "0101234567",
    "0101234567a",
    "02-1234-5678",
    "",
  ])
    assert.ok(validateVisitInfo({ ...valid, phone }, []).phone);
  assert.deepEqual(
    validateVisitInfo({ ...valid, phone: "010 1234 5678" }, []),
    {},
  );
});
test("작업 유형은 해당 업체가 제공하는 항목만 허용한다", () => {
  assert.ok(
    validateVisitInfo({ ...valid, workTypeId: "other" }, [
      { id: "repair", name: "수리" },
    ]).workTypeId,
  );
  assert.deepEqual(
    validateVisitInfo({ ...valid, workTypeId: "repair" }, [
      { id: "repair", name: "수리" },
    ]),
    {},
  );
});
test("입력 길이 상한과 빈 선택정보를 처리하고 원본을 바꾸지 않는다", () => {
  const input = {
    ...valid,
    name: "가".repeat(51),
    address: "가".repeat(201),
    addressDetail: "가".repeat(201),
    accessNote: "가".repeat(501),
  };
  const original = structuredClone(input);
  assert.deepEqual(Object.keys(validateVisitInfo(input, [])), [
    "name",
    "address",
    "addressDetail",
    "accessNote",
  ]);
  assert.deepEqual(input, original);
});
test("로딩·폐기 링크·접수 중지·업체 제한·연결 실패를 구분한다", () => {
  assert.equal(
    new Set(Object.values(intakeStatusCopy).map((value) => value.title)).size,
    5,
  );
});
