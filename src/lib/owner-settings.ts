export const workCategories = {
  INSPECTION: "점검",
  REPAIR: "수리·부품교체",
  LEAK: "누수",
  REPLACEMENT: "보일러 교체",
} as const;
export type WorkCategory = keyof typeof workCategories;
export type BusinessInfo = {
  businessName: string;
  contactPhone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  customerNotice: string | null;
  serviceDescription: string | null;
};
export type BusinessHour = {
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
};
export type BookingSettings = {
  businessHours: BusinessHour[];
  lunchStart: string | null;
  lunchEnd: string | null;
  maxDailyVisits: number | null;
  bufferMinutes: number;
  travelMode: "CAR";
  autoBookingEnabled: boolean;
};
export type WorkType = {
  workCategory: WorkCategory;
  isActive: boolean;
  durationMinutes: number;
  autoBookingAllowed: boolean;
};

export function setWorkTypeActive(
  work: WorkType,
  isActive: boolean,
  saved: WorkType[],
): WorkType {
  return isActive
    ? { ...work, isActive: true }
    : {
        ...work,
        isActive: false,
        durationMinutes:
          saved.find((item) => item.workCategory === work.workCategory)
            ?.durationMinutes ?? 60,
        autoBookingAllowed: false,
      };
}

export type ServiceArea = { regionCode: string; regionName: string };
export type SettingsData = {
  business: BusinessInfo;
  booking: BookingSettings;
  workTypes: WorkType[];
  serviceAreas: ServiceArea[];
  intakePaused: boolean;
};
export type SettingsSection =
  "business" | "regions" | "hours" | "work" | "intake";
export type SettingErrors = Record<string, string>;
const changed = (draft: unknown, saved: unknown) =>
  JSON.stringify(draft) !== JSON.stringify(saved);

export function isSettingsSectionDirty(
  section: SettingsSection,
  draft: SettingsData,
  saved: SettingsData,
): boolean {
  switch (section) {
    case "business":
      return changed(draft.business, saved.business);
    case "regions":
      return changed(draft.serviceAreas, saved.serviceAreas);
    case "hours":
      return changed(
        { ...draft.booking, autoBookingEnabled: false },
        { ...saved.booking, autoBookingEnabled: false },
      );
    case "work":
      return changed(draft.workTypes, saved.workTypes);
    case "intake":
      return (
        draft.intakePaused !== saved.intakePaused ||
        draft.booking.autoBookingEnabled !== saved.booking.autoBookingEnabled
      );
  }
}

export function refreshSettingsDraft(
  section: SettingsSection | null,
  draft: SettingsData,
  previous: SettingsData,
  saved: SettingsData,
): SettingsData {
  // null은 저장 성공/취소가 아니라 저장 결과 재조회: 실제 편집한 필드만 보존한다.
  if (section === null) {
    const keepEdits = <T extends object>(
      values: T,
      before: T,
      current: T,
    ): T => {
      const result = { ...current };
      for (const key of Object.keys(values) as (keyof T)[])
        if (changed(values[key], before[key])) result[key] = values[key];
      return result;
    };
    // ponytail: 요일 7개·고정 작업 종류만 find로 병합. 동적 대량 목록이면 키별 Map으로 전환한다.
    return {
      business: keepEdits(draft.business, previous.business, saved.business),
      booking: {
        ...keepEdits(draft.booking, previous.booking, saved.booking),
        businessHours: saved.booking.businessHours.map((hour) => {
          const before = previous.booking.businessHours.find(
            (h) => h.dayOfWeek === hour.dayOfWeek,
          );
          const values = draft.booking.businessHours.find(
            (h) => h.dayOfWeek === hour.dayOfWeek,
          );
          return before && values ? keepEdits(values, before, hour) : hour;
        }),
      },
      workTypes: saved.workTypes.map((work) => {
        const before = previous.workTypes.find(
          (w) => w.workCategory === work.workCategory,
        );
        const values = draft.workTypes.find(
          (w) => w.workCategory === work.workCategory,
        );
        return before && values ? keepEdits(values, before, work) : work;
      }),
      serviceAreas: changed(draft.serviceAreas, previous.serviceAreas)
        ? draft.serviceAreas
        : saved.serviceAreas,
      intakePaused:
        draft.intakePaused !== previous.intakePaused
          ? draft.intakePaused
          : saved.intakePaused,
    };
  }
  const keep = (other: SettingsSection) =>
    section !== other && isSettingsSectionDirty(other, draft, previous);
  return {
    business: keep("business") ? draft.business : saved.business,
    serviceAreas: keep("regions") ? draft.serviceAreas : saved.serviceAreas,
    workTypes: keep("work") ? draft.workTypes : saved.workTypes,
    booking: {
      ...(keep("hours") ? draft.booking : saved.booking),
      autoBookingEnabled:
        section !== "intake" &&
        draft.booking.autoBookingEnabled !== previous.booking.autoBookingEnabled
          ? draft.booking.autoBookingEnabled
          : saved.booking.autoBookingEnabled,
    },
    intakePaused:
      section !== "intake" && draft.intakePaused !== previous.intakePaused
        ? draft.intakePaused
        : saved.intakePaused,
  };
}

const time = (v: unknown): v is string =>
  typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const integer = (v: unknown, min: number, max = 1440): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export function validateBusiness(value: BusinessInfo): SettingErrors {
  const errors: SettingErrors = {};
  if (!value.businessName.trim() || value.businessName.trim().length > 100)
    errors.businessName = "업체명을 1~100자로 입력해 주세요.";
  // BE-03 PhoneNumbers: 대표 연락처는 국내 휴대전화·지역번호·대표번호를 받는다.
  if (
    value.contactPhone !== null &&
    (!/^\+?[0-9][0-9\s()-]{7,19}$/.test(value.contactPhone) ||
      !/^(?:0\d{8,10}|1[5-9]\d{6})$/.test(
        value.contactPhone.replace(/\D/g, ""),
      ))
  )
    errors.contactPhone = "대표 연락처를 확인해 주세요.";
  if ((value.address?.length ?? 0) > 255)
    errors.address = "주소는 255자 이내로 입력해 주세요.";
  if (
    value.address !== null &&
    (!value.address.trim() ||
      typeof value.lat !== "number" ||
      !Number.isFinite(value.lat) ||
      value.lat < -90 ||
      value.lat > 90 ||
      typeof value.lng !== "number" ||
      !Number.isFinite(value.lng) ||
      value.lng < -180 ||
      value.lng > 180)
  )
    errors.address = "주소 검색 결과에서 출발지를 선택해 주세요.";
  if (value.address === null && (value.lat !== null || value.lng !== null))
    errors.address = "출발지 주소와 위치 정보를 함께 확인해 주세요.";
  for (const [key, max] of [
    ["customerNotice", 500],
    ["serviceDescription", 255],
  ] as const) {
    if (
      value[key] !== null &&
      (!value[key]!.trim() || value[key]!.length > max)
    )
      errors[key] = `${max}자 이내로 입력하거나 비워 주세요.`;
  }
  return errors;
}

export function validateBooking(value: BookingSettings): SettingErrors {
  const errors: SettingErrors = {};
  const days = value.businessHours.map((h) => h.dayOfWeek);
  if (
    days.length !== 7 ||
    new Set(days).size !== 7 ||
    days.some((d) => !integer(d, 1, 7))
  )
    errors.businessHours = "월요일부터 일요일까지 모두 설정해 주세요.";
  value.businessHours.forEach((h, index) => {
    if (
      !h.isClosed &&
      (!time(h.openTime) || !time(h.closeTime) || h.closeTime <= h.openTime)
    )
      errors[`businessHours[${index}].closeTime`] =
        "종료시간을 시작시간보다 늦게 설정해 주세요.";
    if (h.isClosed && (h.openTime !== null || h.closeTime !== null))
      errors[`businessHours[${index}].openTime`] =
        "휴무일에는 영업시간을 비워 주세요.";
  });
  if ((value.lunchStart === null) !== (value.lunchEnd === null))
    errors.lunchEnd = "점심 시작·종료시간을 모두 입력해 주세요.";
  else if (
    value.lunchStart !== null &&
    (!time(value.lunchStart) ||
      !time(value.lunchEnd) ||
      value.lunchEnd <= value.lunchStart)
  )
    errors.lunchEnd = "점심 종료시간을 시작시간보다 늦게 설정해 주세요.";
  else if (
    value.lunchStart !== null &&
    value.lunchEnd !== null &&
    value.businessHours.some(
      (h) =>
        !h.isClosed &&
        time(h.openTime) &&
        time(h.closeTime) &&
        (value.lunchStart! < h.openTime || value.lunchEnd! > h.closeTime),
    )
  )
    errors.lunchEnd = "점심시간은 모든 영업일의 영업시간 안에 있어야 해요.";
  if (
    value.maxDailyVisits !== null &&
    !integer(value.maxDailyVisits, 1, Number.MAX_SAFE_INTEGER)
  )
    errors.maxDailyVisits =
      "방문 한도는 1 이상의 정수로 입력하거나 비워 주세요.";
  if (!integer(value.bufferMinutes, 0))
    errors.bufferMinutes = "여유시간은 0~1440분의 정수로 입력해 주세요.";
  if (value.travelMode !== "CAR")
    errors.travelMode = "지금은 자동차 기준으로 계산해요.";
  return errors;
}

export function validateWorkTypes(items: WorkType[]): SettingErrors {
  const errors: SettingErrors = {};
  if (
    items.length > 4 ||
    new Set(items.map((w) => w.workCategory)).size !== items.length
  )
    errors.workTypes = "작업 종류가 중복됐어요.";
  items.forEach((w, index) => {
    if (!Object.hasOwn(workCategories, w.workCategory))
      errors.workTypes = "작업 종류를 확인해 주세요.";
    if (!integer(w.durationMinutes, 1))
      errors[`workTypes[${index}].durationMinutes`] =
        "작업시간은 1~1440분의 정수로 입력해 주세요.";
    if (!w.isActive && w.autoBookingAllowed)
      errors[`workTypes[${index}].autoBookingAllowed`] =
        "제공하는 작업만 자동 예약을 허용할 수 있어요.";
  });
  return errors;
}

export function validateServiceAreas(items: ServiceArea[]): SettingErrors {
  const errors: SettingErrors = {};
  if (items.length > 50)
    errors.serviceAreas = "방문지역은 50개까지 선택할 수 있어요.";
  if (new Set(items.map((a) => a.regionCode)).size !== items.length)
    errors.serviceAreas = "이미 추가한 지역이에요.";
  if (
    items.some(
      (a) =>
        !/^\d{5,10}$/.test(a.regionCode) ||
        !a.regionName.trim() ||
        a.regionName.length > 50,
    )
  )
    errors.serviceAreas = "지역 검색 결과에서 시·군·구를 선택해 주세요.";
  return errors;
}

const bookingRequirements = {
  BUSINESS_HOURS: "영업시간",
  WORK_TYPE: "자동 예약을 허용한 작업",
  SERVICE_AREA: "방문지역",
  START_ADDRESS: "출발지 주소",
} as const;

export function autoBookingSetupMessage(result: unknown, enabling: boolean) {
  const missing =
    result &&
    typeof result === "object" &&
    "missing" in result &&
    Array.isArray(result.missing)
      ? result.missing.flatMap((key: unknown) =>
          typeof key === "string" && Object.hasOwn(bookingRequirements, key)
            ? [bookingRequirements[key as keyof typeof bookingRequirements]]
            : [],
        )
      : [];
  if (enabling)
    return missing.length
      ? `자동 예약을 켜려면 다음 항목을 먼저 저장해 주세요: ${missing.join(" · ")}`
      : "자동 예약에 필요한 설정을 다시 확인해 주세요.";
  const detail = missing.length
    ? `자동 예약에 필요한 항목: ${missing.join(" · ")}. `
    : "자동 예약에 필요한 설정이라 변경하지 못했어요. ";
  return `${detail}이 설정을 빼려면 ‘접수·예약’에서 자동 예약을 먼저 꺼 주세요.`;
}

export function missingAutoBookingSetup(data: SettingsData): string[] {
  const missing: string[] = [];
  if (
    !data.booking.businessHours.some((h) => !h.isClosed) ||
    Object.keys(validateBooking(data.booking)).length
  )
    missing.push(bookingRequirements.BUSINESS_HOURS);
  if (!data.workTypes.some((w) => w.isActive && w.autoBookingAllowed))
    missing.push(bookingRequirements.WORK_TYPE);
  if (!data.serviceAreas.length) missing.push(bookingRequirements.SERVICE_AREA);
  if (
    !data.business.address ||
    data.business.lat === null ||
    data.business.lng === null
  )
    missing.push(bookingRequirements.START_ADDRESS);
  return missing;
}

export function nullableText(value: string): string | null {
  return value.trim() || null;
}
