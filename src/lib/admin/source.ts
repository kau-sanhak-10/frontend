// 운영 화면 데이터 출처: 실제 로그인은 서버(BE-17), 예시 로그인은 목업 (FE-19)
// 서버가 401(로그인 만료)을 주면 이 브라우저의 운영자 로그인을 지워 로그인 화면으로 보냅니다.
import {
  approveOwnerLive,
  changeLoginPhoneLive,
  changeOwnerStatusLive,
  confirmOwnerPhoneCode,
  fetchOwnerLive,
  fetchOwnersLive,
  issueIntakeLinkLive,
  registerOwnerLive,
  rejectOwnerLive,
  sendOwnerPhoneCode,
} from "./live-api";
import {
  approveOwnerMock,
  changeLoginPhoneMock,
  changeOwnerStatusMock,
  confirmOwnerPhoneCodeMock,
  fetchOwnerMock,
  fetchOwnersMock,
  issueIntakeLinkMock,
  registerOwnerMock,
  rejectOwnerMock,
  sendOwnerPhoneCodeMock,
} from "./mock-api";
import { clearAdminSession, type AdminSession } from "./session";
import type {
  AdminOwnerFilter,
  AdminResult,
  OwnerStatus,
  RegisterOwnerInput,
} from "./types";

async function guard<T>(p: Promise<AdminResult<T>>): Promise<AdminResult<T>> {
  const res = await p;
  if (!res.ok && res.code === "EXPIRED") clearAdminSession();
  return res;
}

const live = (s: AdminSession) => (s.mode === "live" ? s.token! : null);

export const loadOwners = (s: AdminSession, filter: AdminOwnerFilter) => {
  const t = live(s);
  return guard(t ? fetchOwnersLive(t, filter) : fetchOwnersMock(filter));
};

export const loadOwner = (s: AdminSession, id: string) => {
  const t = live(s);
  return guard(t ? fetchOwnerLive(t, id) : fetchOwnerMock(id));
};

export const registerOwner = (s: AdminSession, input: RegisterOwnerInput) => {
  const t = live(s);
  return guard(t ? registerOwnerLive(t, input) : registerOwnerMock(input));
};

export const approveOwner = (s: AdminSession, id: string) => {
  const t = live(s);
  return guard(t ? approveOwnerLive(t, id) : approveOwnerMock(id));
};

export const rejectOwner = (s: AdminSession, id: string, reason: string) => {
  const t = live(s);
  return guard(
    t ? rejectOwnerLive(t, id, reason) : rejectOwnerMock(id, reason),
  );
};

export const changeOwnerStatus = (
  s: AdminSession,
  id: string,
  status: OwnerStatus,
) => {
  const t = live(s);
  return guard(
    t
      ? changeOwnerStatusLive(t, id, status)
      : changeOwnerStatusMock(id, status),
  );
};

export const changeLoginPhone = (
  s: AdminSession,
  id: string,
  newPhone: string,
  verificationId: string,
) => {
  const t = live(s);
  return guard(
    t
      ? changeLoginPhoneLive(t, id, newPhone, verificationId)
      : changeLoginPhoneMock(s.role, id, newPhone, verificationId),
  );
};

export const issueIntakeLink = (s: AdminSession, id: string) => {
  const t = live(s);
  return guard(t ? issueIntakeLinkLive(t, id) : issueIntakeLinkMock(id));
};

export const sendOwnerCode = (s: AdminSession, phone: string) => {
  const t = live(s);
  return guard(
    t ? sendOwnerPhoneCode(t, phone) : sendOwnerPhoneCodeMock(phone),
  );
};

export const confirmOwnerCode = (
  s: AdminSession,
  verificationId: string,
  code: string,
) => {
  const t = live(s);
  return guard(
    t
      ? confirmOwnerPhoneCode(t, verificationId, code)
      : confirmOwnerPhoneCodeMock(verificationId, code),
  );
};
