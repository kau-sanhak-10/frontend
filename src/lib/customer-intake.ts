export type WorkType = { id: string; name: string };

// 화면 내부 모델이다. 백엔드 DTO와의 변환·실제 저장은 FE-08에서 연결한다.
export type IntakeBusiness = {
  name: string;
  phone: string;
  guidance: string;
  termsVersion: string;
  workTypes: WorkType[];
};

export type IntakeStatus =
  "ready" | "loading" | "invalid" | "paused" | "unavailable" | "error";

export type VisitInfo = {
  name: string;
  phone: string;
  address: string;
  addressDetail: string;
  accessNote: string;
  workTypeId: string;
};

export type VisitErrors = Partial<Record<keyof VisitInfo, string>>;

export const emptyVisitInfo: VisitInfo = {
  name: "",
  phone: "",
  address: "",
  addressDetail: "",
  accessNote: "",
  workTypeId: "",
};

export function validateVisitInfo(
  input: VisitInfo,
  workTypes: WorkType[],
): VisitErrors {
  const errors: VisitErrors = {};
  if (!input.name.trim()) errors.name = "이름을 입력해 주세요.";
  else if (input.name.trim().length > 50)
    errors.name = "이름은 50자 이내로 입력해 주세요.";
  if (
    !/^(?:010[0-9]{8}|01[16789][0-9]{7,8})$/.test(
      input.phone.replace(/[\s-]/g, ""),
    )
  )
    errors.phone = "휴대전화번호를 확인해 주세요.";
  if (!input.address.trim()) errors.address = "방문 주소를 입력해 주세요.";
  else if (input.address.trim().length > 200)
    errors.address = "주소는 200자 이내로 입력해 주세요.";
  if (input.addressDetail.length > 200)
    errors.addressDetail = "상세 주소는 200자 이내로 입력해 주세요.";
  if (input.accessNote.length > 500)
    errors.accessNote = "추가 요청은 500자 이내로 입력해 주세요.";
  if (
    input.workTypeId &&
    !workTypes.some((workType) => workType.id === input.workTypeId)
  )
    errors.workTypeId = "제공 가능한 작업 유형을 다시 선택해 주세요.";
  return errors;
}

export const intakeStatusCopy = {
  loading: {
    title: "업체 정보를 확인하고 있어요",
    description: "접수 가능 여부를 확인한 뒤 안내해 드릴게요.",
  },
  invalid: {
    title: "사용할 수 없는 접수 링크예요",
    description: "업체에서 받은 최신 접수 링크로 다시 접속해 주세요.",
  },
  paused: {
    title: "지금은 새 문의를 받고 있지 않아요",
    description: "기존 예약은 본인 확인 후 조회할 수 있어요.",
  },
  unavailable: {
    title: "지금은 이 업체에 접수할 수 없어요",
    description: "업체의 접수 가능 상태를 확인한 뒤 다시 접속해 주세요.",
  },
  error: {
    title: "업체 정보를 불러오지 못했어요",
    description: "연결 상태를 확인하고 다시 불러와 주세요.",
  },
} satisfies Record<Exclude<IntakeStatus, "ready">, object>;
