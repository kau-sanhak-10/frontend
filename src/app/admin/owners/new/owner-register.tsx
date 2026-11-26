"use client";

// 운영팀 접수 업체 등록 (B-01 · O-02)
// 사장님 직접 회원가입은 없고, 운영팀이 받은 업체 기본정보·로그인 번호를 등록합니다.
// 등록 결과는 승인 대기·준비 중·자동 예약 꺼짐입니다. 승인과 자동 예약 켜기는 따로예요.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminBar, AdminGate } from "../../_components/admin-gate";
import { PhoneVerify } from "../../_components/phone-verify";
import admin from "../../_components/admin.module.css";
import auth from "../../../owner/_components/owner-auth.module.css";
import styles from "../../../owner/_components/owner-inquiries.module.css";
import { ADMIN_ERROR_MESSAGE, registerErrors } from "@/lib/admin/rules";
import type { AdminSession } from "@/lib/admin/session";
import { registerOwner } from "@/lib/admin/source";
import type { RegisterOwnerInput } from "@/lib/admin/types";
import {
  formatPhone,
  isValidPhone,
  normalizePhone,
} from "@/lib/owner-auth/phone";

export function OwnerRegister() {
  return (
    <AdminGate>
      {(session) => (
        <main className={auth.page}>
          <AdminBar session={session} />
          <header className={styles.detailHeader}>
            <Link
              href="/admin"
              className={auth.backLink}
              aria-label="업체 목록으로 돌아가기"
            >
              ‹
            </Link>
            <h1 className={auth.headerTitle}>업체 등록</h1>
          </header>
          <RegisterForm session={session} />
        </main>
      )}
    </AdminGate>
  );
}

type Form = Omit<RegisterOwnerInput, "phoneVerificationId">;
const EMPTY: Form = {
  businessName: "",
  ownerName: "",
  phone: "",
  contactPhone: "",
  address: "",
  serviceDescription: "",
};

const SERVER_FIELD: Record<string, keyof Form> = {
  businessName: "businessName",
  ownerName: "ownerName",
  phone: "phone",
  contactPhone: "contactPhone",
  address: "address",
  serviceDescription: "serviceDescription",
};

function RegisterForm({ session }: { session: AdminSession }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<
    Partial<Record<keyof Form, string>>
  >({});

  const errors = { ...registerErrors(form), ...serverErrors };
  const shown = touched ? errors : {};
  const set = (key: keyof Form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setServerErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setFailure(null);
    if (Object.keys(registerErrors(form)).length > 0) return;
    if (!verificationId) {
      setFailure("사장님 로그인 번호의 문자 확인을 먼저 해 주세요.");
      return;
    }
    setBusy(true);
    const res = await registerOwner(session, {
      ...form,
      phoneVerificationId: verificationId,
    });
    setBusy(false);
    if (!res.ok) {
      if (res.code === "NOT_VERIFIED") setVerificationId(null);
      if (res.fields) {
        const mapped: Partial<Record<keyof Form, string>> = {};
        for (const [k, v] of Object.entries(res.fields)) {
          if (SERVER_FIELD[k]) mapped[SERVER_FIELD[k]] = v;
        }
        setServerErrors(mapped);
      }
      setFailure(ADMIN_ERROR_MESSAGE[res.code]);
      return;
    }
    router.replace(
      `/admin/owners/${encodeURIComponent(res.data.id)}?registered=1`,
    );
  }

  const text = (
    key: keyof Form,
    label: string,
    opts: { required?: boolean; placeholder?: string; hint?: string } = {},
  ) => (
    <div className={auth.field}>
      <label className={auth.label} htmlFor={`reg-${key}`}>
        {label}
        {opts.required ? " (필수)" : " (선택)"}
      </label>
      <input
        id={`reg-${key}`}
        className={auth.input}
        value={form[key]}
        placeholder={opts.placeholder}
        aria-invalid={shown[key] ? true : undefined}
        onChange={(e) => set(key, e.target.value)}
      />
      {shown[key] ? (
        <p className={auth.error}>{shown[key]}</p>
      ) : opts.hint ? (
        <p className={auth.hint}>{opts.hint}</p>
      ) : null}
    </div>
  );

  return (
    <form className={auth.form} onSubmit={submit} noValidate>
      <p className={auth.info}>
        운영팀이 받은 업체 신청을 등록해요. 등록하면 <b>승인 대기</b>가 되고,
        승인 뒤에도 자동 예약은 사장님이 설정을 마친 뒤 직접 켜요.
      </p>

      <section className={auth.section} aria-labelledby="reg-business">
        <h2 id="reg-business" className={auth.sectionTitle}>
          업체 기본정보
        </h2>
        {text("businessName", "업체명", { required: true })}
        {text("ownerName", "대표자 이름")}
        {text("contactPhone", "업체 대표 연락처", {
          placeholder: "031-000-0000",
          hint: "고객에게 안내하는 번호예요. 로그인 번호와 달라도 돼요.",
        })}
        {text("address", "주소", {
          hint: "출발지 좌표는 승인 뒤 사장님이 업체 정보에서 채워요.",
        })}
        {text("serviceDescription", "서비스 설명", {
          placeholder: "예: 가정용 보일러 점검·수리",
        })}
      </section>

      <section className={auth.section} aria-labelledby="reg-login">
        <h2 id="reg-login" className={auth.sectionTitle}>
          사장님 로그인 번호
        </h2>
        <div className={auth.field}>
          <label className={auth.label} htmlFor="reg-phone">
            휴대전화번호 (필수)
          </label>
          <input
            id="reg-phone"
            className={auth.input}
            type="tel"
            inputMode="numeric"
            placeholder="010-0000-0000"
            value={formatPhone(form.phone)}
            aria-invalid={shown.phone ? true : undefined}
            onChange={(e) => {
              set("phone", normalizePhone(e.target.value));
              setVerificationId(null);
            }}
          />
          {shown.phone ? <p className={auth.error}>{shown.phone}</p> : null}
          <p className={auth.hint}>
            사장님은 이 번호의 문자 인증으로 로그인해요. 이미 다른 업체가 쓰는
            번호는 등록할 수 없어요.
          </p>
        </div>
        <PhoneVerify
          key={form.phone}
          session={session}
          phone={form.phone}
          phoneValid={isValidPhone(form.phone)}
          idPrefix="reg"
          onVerified={setVerificationId}
        />
      </section>

      {failure ? (
        <p className={admin.failBox} role="alert">
          {failure}
        </p>
      ) : null}

      <button
        type="submit"
        className={`${auth.button} ${auth.primary} ${auth.full}`}
        disabled={busy}
      >
        {busy ? "등록하는 중…" : "승인 대기로 등록"}
      </button>
    </form>
  );
}
