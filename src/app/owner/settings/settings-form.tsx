"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";
import {
  type SettingsData,
  type SettingsSection,
  type SettingErrors,
  workCategories,
  validateBusiness,
  validateBooking,
  validateWorkTypes,
  validateServiceAreas,
  nullableText,
  missingAutoBookingSetup,
  isSettingsSectionDirty,
  refreshSettingsDraft,
  setWorkTypeActive,
} from "@/lib/owner-settings";
import common from "../_components/owner-auth.module.css";
import styles from "./settings.module.css";

const sections: Record<SettingsSection, string> = {
  business: "업체정보",
  regions: "방문지역",
  hours: "영업시간",
  work: "작업시간",
  intake: "접수·예약",
};
const sectionKeys = Object.keys(sections) as SettingsSection[];
const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
const subscribe = () => () => {};

function Field({
  label,
  error,
  children,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  children?: ReactNode;
}) {
  return (
    <div className={common.field}>
      <label className={common.label} htmlFor={props.id}>
        {label}
      </label>
      <input
        {...props}
        className={common.input}
        aria-invalid={!!error}
        aria-describedby={error ? `${props.id}-error` : undefined}
      />
      {error && (
        <p id={`${props.id}-error`} className={common.error}>
          {error}
        </p>
      )}
      {children}
    </div>
  );
}

export default function SettingsForm({
  initialData,
  onSave,
  preview = false,
}: {
  initialData: SettingsData;
  onSave: (
    section: SettingsSection,
    data: SettingsData,
    saved: SettingsData,
  ) => Promise<SettingsData>;
  preview?: boolean;
}) {
  const [saved, setSaved] = useState(initialData);
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [draft, setDraft] = useState(initialData);
  const [section, setSection] = useState<SettingsSection | null>(null);
  const [errors, setErrors] = useState<SettingErrors>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const dirty = sectionKeys.some((key) =>
    isSettingsSectionDirty(key, draft, saved),
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function open(next: SettingsSection | null) {
    setSection(next);
    setErrors({});
    setNotice("");
    setConfirmPause(false);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function cancel() {
    if (!section) return;
    setDraft((d) => refreshSettingsDraft(section, d, saved, saved));
    setErrors({});
    setNotice("이 항목의 변경을 취소했어요.");
  }
  async function save(form: HTMLFormElement) {
    if (!section || lock.current) return;
    const candidate =
      section === "business"
        ? {
            ...draft,
            business: {
              ...draft.business,
              businessName: draft.business.businessName.trim(),
              contactPhone: nullableText(draft.business.contactPhone ?? ""),
              serviceDescription: nullableText(
                draft.business.serviceDescription ?? "",
              ),
              customerNotice: nullableText(draft.business.customerNotice ?? ""),
            },
          }
        : draft;
    const found =
      section === "business"
        ? validateBusiness(candidate.business)
        : section === "regions"
          ? validateServiceAreas(draft.serviceAreas)
          : section === "hours"
            ? validateBooking(draft.booking)
            : section === "work"
              ? validateWorkTypes(draft.workTypes)
              : candidate.booking.autoBookingEnabled && autoBookingError
                ? { auto: autoBookingError }
                : {};
    setErrors(found);
    setNotice("");
    if (Object.keys(found).length) {
      requestAnimationFrame(() =>
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const result = await onSave(section, candidate, saved);
      if (!mounted.current) return;
      setSaved(result);
      setDraft((d) => refreshSettingsDraft(section, d, saved, result));
      setNotice(
        preview ? "이 항목을 미리보기에 저장했어요." : "이 항목을 저장했어요.",
      );
      setConfirmPause(false);
    } catch (e) {
      if (mounted.current)
        setErrors({
          save:
            e instanceof Error
              ? e.message
              : "저장하지 못했어요. 입력한 내용을 유지했으니 다시 시도해 주세요.",
        });
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function updateBooking(
    key: "maxDailyVisits" | "bufferMinutes",
    value: string,
  ) {
    setDraft((d) => ({
      ...d,
      booking: {
        ...d.booking,
        [key]:
          value === ""
            ? key === "maxDailyVisits"
              ? null
              : NaN
            : Number(value),
      },
    }));
  }
  const missing = missingAutoBookingSetup(saved);
  const autoBookingError = missing.length
    ? `먼저 ${missing.join(" · ")}을 저장해 주세요.`
    : "";
  const selectedDirty =
    section !== null && isSettingsSectionDirty(section, draft, saved);

  return (
    <main className={`${common.page} ${styles.page}`}>
      {preview && (
        <p className={styles.preview}>
          화면 검증용 · 예시 정보 · 새로고침하면 초기화돼요
        </p>
      )}
      <header className={common.header}>
        {section ? (
          <button
            type="button"
            className={common.backLink}
            onClick={() => open(null)}
            disabled={busy}
            aria-label="설정 목록으로"
          >
            <Image
              src="/owner/settings-back.svg"
              alt=""
              width={22}
              height={22}
            />
          </button>
        ) : !preview ? (
          <Link
            href="/owner/account"
            className={common.backLink}
            aria-label="내 계정으로"
          >
            <Image
              src="/owner/settings-back.svg"
              alt=""
              width={22}
              height={22}
            />
          </Link>
        ) : null}
        <h1 ref={heading} tabIndex={-1} className={common.headerTitle}>
          {section ? sections[section] : "업체 설정"}
        </h1>
      </header>
      {!section ? (
        <>
          <div>
            <h2 className={styles.businessName}>
              {saved.business.businessName}
            </h2>
            <p className={common.description}>
              우리 업체의 접수와 방문 기준을 설정해요.
            </p>
          </div>
          <nav aria-label="업체 설정 항목" className={styles.menu}>
            {sectionKeys.map((key) => (
              <button
                key={key}
                type="button"
                disabled={!ready}
                onClick={() => open(key)}
                className={styles.menuRow}
              >
                <span>
                  {sections[key]}
                  <small>
                    {key === "business"
                      ? "업체명 · 연락처 · 고객 안내"
                      : key === "regions"
                        ? `${saved.serviceAreas.length}개 지역`
                        : key === "hours"
                          ? "요일별 시간 · 휴무 · 예약 기준"
                          : key === "work"
                            ? "제공 작업 · 자동 예약 허용 · 소요시간"
                            : `신규 접수 ${saved.intakePaused ? "중지" : "받는 중"} · 자동 예약 ${saved.booking.autoBookingEnabled ? "켜짐" : "꺼짐"}`}
                  </small>
                </span>
                <Image
                  className={styles.forward}
                  src="/owner/settings-back.svg"
                  alt=""
                  width={20}
                  height={20}
                />
              </button>
            ))}
          </nav>
          {dirty && (
            <p className={common.notice}>
              저장하지 않은 변경사항이 있어요. 각 항목에서 저장하거나 취소해
              주세요.
            </p>
          )}
        </>
      ) : (
        <form
          className={common.form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save(e.currentTarget);
          }}
        >
          <fieldset disabled={busy} className={styles.fields}>
            {section === "business" && (
              <>
                <h2 className={styles.sectionTitle}>
                  고객에게 보이는 업체 정보
                </h2>
                <Field
                  id="businessName"
                  label="업체 이름"
                  value={draft.business.businessName}
                  maxLength={100}
                  autoComplete="organization"
                  error={errors.businessName}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      business: {
                        ...draft.business,
                        businessName: e.target.value,
                      },
                    })
                  }
                />
                <Field
                  id="contactPhone"
                  label="대표 연락처 (선택)"
                  type="tel"
                  value={draft.business.contactPhone ?? ""}
                  error={errors.contactPhone}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      business: {
                        ...draft.business,
                        contactPhone: e.target.value || null,
                      },
                    })
                  }
                >
                  <p className={common.hint}>
                    비워두면 로그인 전화번호를 사용해요.
                  </p>
                </Field>
                <Field
                  id="address"
                  label="출발지 주소"
                  value={draft.business.address ?? "미설정"}
                  readOnly
                  error={errors.address}
                >
                  <p className={common.hint}>
                    주소 검색 연결 후 변경할 수 있어요. 현재 출발지의 위치
                    정보는 그대로 유지돼요.
                  </p>
                </Field>
                <Field
                  id="serviceDescription"
                  label="제공 서비스 안내 (선택)"
                  value={draft.business.serviceDescription ?? ""}
                  maxLength={255}
                  error={errors.serviceDescription}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      business: {
                        ...draft.business,
                        serviceDescription: e.target.value || null,
                      },
                    })
                  }
                />
                <div className={common.field}>
                  <label htmlFor="customerNotice" className={common.label}>
                    고객 안내 문구 (선택)
                  </label>
                  <textarea
                    id="customerNotice"
                    className={styles.textarea}
                    value={draft.business.customerNotice ?? ""}
                    maxLength={500}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        business: {
                          ...draft.business,
                          customerNotice: e.target.value || null,
                        },
                      })
                    }
                  />
                  <p className={common.hint}>
                    자동 예약을 허용할 작업은 ‘작업시간’에서 선택해요.
                  </p>
                </div>
              </>
            )}
            {section === "regions" && (
              <>
                <h2 className={styles.sectionTitle}>출장 가능한 시·군·구</h2>
                <p className={common.hint}>
                  지역 경계가 불분명한 주소는 사장님 확인으로 전달해요.
                </p>
                {draft.serviceAreas.length ? (
                  <ul className={styles.regionList}>
                    {draft.serviceAreas.map((a) => (
                      <li key={a.regionCode}>
                        <span>{a.regionName}</span>
                        {preview && (
                          <button
                            type="button"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                serviceAreas: draft.serviceAreas.filter(
                                  (v) => v.regionCode !== a.regionCode,
                                ),
                              })
                            }
                            aria-label={`${a.regionName} 삭제`}
                          >
                            삭제
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={common.info}>선택한 방문지역이 없어요.</p>
                )}
                {preview ? (
                  <>
                    <p className={common.hint}>검증용 예시 지역 선택</p>
                    {[
                      { regionCode: "41281", regionName: "경기 고양시 덕양구" },
                      {
                        regionCode: "41285",
                        regionName: "경기 고양시 일산동구",
                      },
                      { regionCode: "11500", regionName: "서울 강서구" },
                    ].map((a) => (
                      <button
                        className={`${common.button} ${common.secondary}`}
                        key={a.regionCode}
                        type="button"
                        disabled={draft.serviceAreas.some(
                          (v) => v.regionCode === a.regionCode,
                        )}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            serviceAreas: [...draft.serviceAreas, a],
                          })
                        }
                      >
                        {a.regionName} 추가
                      </button>
                    ))}
                  </>
                ) : (
                  <p className={common.info}>
                    지역 검색을 연결한 뒤 방문지역을 추가할 수 있어요.
                  </p>
                )}
                {errors.serviceAreas && (
                  <p role="alert" className={common.error}>
                    {errors.serviceAreas}
                  </p>
                )}
              </>
            )}
            {section === "hours" && (
              <>
                <h2 className={styles.sectionTitle}>방문을 받는 시간</h2>
                <div className={styles.hours}>
                  {draft.booking.businessHours.map((h, i) => (
                    <div key={h.dayOfWeek} className={styles.day}>
                      <div className={styles.dayHeading}>
                        <strong>{weekdays[h.dayOfWeek - 1]}요일</strong>
                        <label>
                          <input
                            type="checkbox"
                            checked={h.isClosed}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                booking: {
                                  ...draft.booking,
                                  businessHours:
                                    draft.booking.businessHours.map((v, n) =>
                                      n === i
                                        ? {
                                            ...v,
                                            isClosed: e.target.checked,
                                            openTime: e.target.checked
                                              ? null
                                              : "09:00",
                                            closeTime: e.target.checked
                                              ? null
                                              : "18:00",
                                          }
                                        : v,
                                    ),
                                },
                              })
                            }
                          />{" "}
                          휴무
                        </label>
                      </div>
                      {!h.isClosed && (
                        <div className={styles.pair}>
                          {(["openTime", "closeTime"] as const).map((key) => (
                            <Field
                              key={key}
                              id={`${key}-${i}`}
                              label={`${weekdays[h.dayOfWeek - 1]}요일 ${key === "openTime" ? "시작" : "종료"}`}
                              type="time"
                              value={h[key] ?? ""}
                              error={errors[`businessHours[${i}].${key}`]}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  booking: {
                                    ...draft.booking,
                                    businessHours:
                                      draft.booking.businessHours.map((v, n) =>
                                        n === i
                                          ? { ...v, [key]: e.target.value }
                                          : v,
                                      ),
                                  },
                                })
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <h2 className={styles.sectionTitle}>
                  예약을 받지 않는 점심시간
                </h2>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={draft.booking.lunchStart !== null}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        booking: {
                          ...draft.booking,
                          lunchStart: e.target.checked ? "12:00" : null,
                          lunchEnd: e.target.checked ? "13:00" : null,
                        },
                      })
                    }
                  />
                  점심시간 설정
                </label>
                {draft.booking.lunchStart !== null && (
                  <div className={styles.pair}>
                    {(["lunchStart", "lunchEnd"] as const).map((key) => (
                      <Field
                        key={key}
                        id={key}
                        label={key === "lunchStart" ? "점심 시작" : "점심 종료"}
                        type="time"
                        value={draft.booking[key] ?? ""}
                        error={errors[key]}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            booking: {
                              ...draft.booking,
                              [key]: e.target.value,
                            },
                          })
                        }
                      />
                    ))}
                  </div>
                )}
                <Field
                  id="maxDailyVisits"
                  label="하루 최대 방문 건수 (선택)"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={draft.booking.maxDailyVisits ?? ""}
                  error={errors.maxDailyVisits}
                  onChange={(e) =>
                    updateBooking("maxDailyVisits", e.target.value)
                  }
                >
                  <p className={common.hint}>
                    비워두면 제한하지 않아요. 취소되지 않은 방문을 기준으로
                    해요.
                  </p>
                </Field>
                <p className={common.info}>
                  시간 변경은 이후 예약에 적용해요. 기존 예약은 변경하지 않아요.
                </p>
              </>
            )}
            {section === "work" && (
              <>
                <h2 className={styles.sectionTitle}>작업별 예약 시간</h2>
                <p className={common.hint}>
                  제공하는 작업을 선택하고, 자동으로 예약을 받아도 되는 작업만
                  허용해요.
                </p>
                {draft.workTypes.map((w, i) => (
                  <section key={w.workCategory} className={styles.work}>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={w.isActive}
                        onChange={(e) => {
                          const isActive = e.target.checked;
                          setDraft((current) => ({
                            ...current,
                            workTypes: current.workTypes.map((v) =>
                              v.workCategory === w.workCategory
                                ? setWorkTypeActive(
                                    v,
                                    isActive,
                                    saved.workTypes,
                                  )
                                : v,
                            ),
                          }));
                        }}
                      />
                      <strong>{workCategories[w.workCategory]}</strong>
                    </label>
                    {w.isActive && (
                      <>
                        <Field
                          id={`duration-${i}`}
                          label="작업시간 (분)"
                          type="number"
                          min={1}
                          max={1440}
                          step={1}
                          inputMode="numeric"
                          value={
                            Number.isNaN(w.durationMinutes)
                              ? ""
                              : w.durationMinutes
                          }
                          error={errors[`workTypes[${i}].durationMinutes`]}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              workTypes: draft.workTypes.map((v, n) =>
                                n === i
                                  ? {
                                      ...v,
                                      durationMinutes:
                                        e.target.value === ""
                                          ? NaN
                                          : Number(e.target.value),
                                    }
                                  : v,
                              ),
                            })
                          }
                        />
                        <label className={styles.check}>
                          <input
                            type="checkbox"
                            checked={w.autoBookingAllowed}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                workTypes: draft.workTypes.map((v, n) =>
                                  n === i
                                    ? {
                                        ...v,
                                        autoBookingAllowed: e.target.checked,
                                      }
                                    : v,
                                ),
                              })
                            }
                          />
                          자동 예약 허용
                        </label>
                      </>
                    )}
                  </section>
                ))}
                <p className={common.info}>
                  작업시간은 현장에서 작업하는 시간이에요. 이동시간과 일정 사이
                  여유시간은 따로 더해요.
                </p>
                <p className={common.hint}>
                  일정 사이 여유시간은 ‘영업시간’의 예약 기준과 함께 저장해요.
                </p>
              </>
            )}
            {section === "hours" && (
              <Field
                id="bufferMinutes"
                label="일정 사이 여유시간 (분)"
                type="number"
                min={0}
                max={1440}
                step={1}
                inputMode="numeric"
                value={
                  Number.isNaN(draft.booking.bufferMinutes)
                    ? ""
                    : draft.booking.bufferMinutes
                }
                error={errors.bufferMinutes}
                onChange={(e) => updateBooking("bufferMinutes", e.target.value)}
              >
                <p className={common.hint}>
                  자동차 이동시간에 추가하는 여유시간이에요.
                </p>
              </Field>
            )}
            {section === "intake" && (
              <>
                {!preview && (
                  <p className={common.info}>
                    자동 예약과 신규 접수는 하나씩 변경하고 저장해 주세요.
                  </p>
                )}
                <section className={styles.work}>
                  <h2 className={styles.sectionTitle}>자동 예약</h2>
                  <p className={common.hint}>
                    꺼도 상담과 접수는 계속돼요. 사장님이 직접 시간을 확인할 수
                    있어요.
                  </p>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={draft.booking.autoBookingEnabled}
                      disabled={
                        !preview && draft.intakePaused !== saved.intakePaused
                      }
                      onChange={(e) => {
                        if (e.target.checked && autoBookingError) {
                          setErrors({ auto: autoBookingError });
                          return;
                        }
                        setErrors({});
                        setDraft({
                          ...draft,
                          booking: {
                            ...draft.booking,
                            autoBookingEnabled: e.target.checked,
                          },
                        });
                      }}
                    />
                    자동 예약 켜기
                  </label>
                  {errors.auto && (
                    <p role="alert" className={common.error}>
                      {errors.auto}
                    </p>
                  )}
                  {missing.length > 0 && (
                    <p className={common.info}>
                      자동 예약에 필요한 설정: {missing.join(" · ")}
                    </p>
                  )}
                </section>
                <section className={styles.work}>
                  <h2 className={styles.sectionTitle}>새로운 접수</h2>
                  <p className={common.hint}>
                    중지해도 기존 고객과의 대화와 확정된 예약은 유지돼요.
                  </p>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={draft.intakePaused}
                      disabled={
                        !preview &&
                        draft.booking.autoBookingEnabled !==
                          saved.booking.autoBookingEnabled
                      }
                      onChange={(e) => {
                        setConfirmPause(e.target.checked);
                        setDraft({ ...draft, intakePaused: e.target.checked });
                      }}
                    />
                    신규 접수 잠시 중지
                  </label>
                  {confirmPause && (
                    <p className={common.notice}>
                      저장하면 새 고객의 접수를 받지 않아요. 기존 접수와 예약은
                      그대로예요.
                    </p>
                  )}
                </section>
                <p className={common.info}>
                  이동시간은 자동차 기준으로 계산해요.
                </p>
              </>
            )}
          </fieldset>
          {errors.save && (
            <p role="alert" className={common.error}>
              {errors.save}
            </p>
          )}
          <p role="status" className={styles.status}>
            {notice ||
              (selectedDirty ? "저장하지 않은 변경사항이 있어요." : "")}
          </p>
          <footer className={styles.footer}>
            <button
              type="button"
              className={`${common.button} ${common.secondary}`}
              disabled={busy || !selectedDirty}
              onClick={cancel}
            >
              취소
            </button>
            <button
              className={`${common.button} ${styles.primary}`}
              type="submit"
              disabled={busy || !selectedDirty}
            >
              {busy ? "저장 중…" : "변경사항 저장"}
            </button>
          </footer>
        </form>
      )}
    </main>
  );
}
