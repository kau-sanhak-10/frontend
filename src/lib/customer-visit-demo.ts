import {
  getCustomerVisitSnapshot,
  isIntakeLinkToken,
  saveCustomerVisitInfo,
} from "./customer-api.ts";
import { emptyVisitInfo } from "./customer-intake.ts";

// ponytail: 시연용 두 지점만 사용한다. 일반 주소→좌표 검색은 BE-15에 연결한다.
export const demoVisitLocations = {
  origin: {
    name: "이레엔지니어링",
    address: "경기 고양시 덕양구 화전동 229-56",
    lat: 37.5997268,
    lng: 126.8729409,
  },
  destination: {
    name: "한국항공대학교",
    address: "경기 고양시 덕양구 항공대학로 76",
    lat: 37.599,
    lng: 126.8641,
  },
} as const;

export async function saveCustomerDemoVisit(
  inquiryId: number,
  token: string,
  signal: AbortSignal,
) {
  const { destination } = demoVisitLocations;
  const phone = "01000000001";
  const { version, visit } = await getCustomerVisitSnapshot(
    inquiryId,
    token,
    signal,
  );
  if (
    visit.address === destination.address &&
    visit.phone === phone &&
    visit.lat === destination.lat &&
    visit.lng === destination.lng &&
    visit.addressDetail === null &&
    visit.accessNote === null
  ) {
    return "saved";
  }
  if (Object.values(visit).some((value) => value !== null)) return "occupied";
  await saveCustomerVisitInfo(
    inquiryId,
    token,
    version,
    {
      ...emptyVisitInfo,
      name: "일로 시연 고객",
      phone,
      address: destination.address,
    },
    destination,
    signal,
  );
  return "saved";
}

export function isVisitDemoLink(
  linkToken: string,
  configuredToken: string | undefined,
  apiBase: string | undefined,
) {
  if (linkToken !== configuredToken || !isIntakeLinkToken(linkToken, true))
    return false;
  const url = URL.parse(apiBase ?? "");
  return (
    url?.origin === "https://dev-api.illo.ai.kr" ||
    (url?.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
  );
}
