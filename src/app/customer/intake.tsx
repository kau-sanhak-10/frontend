"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  emptyVisitInfo,
  intakeStatusCopy,
  validateVisitInfo,
  type IntakeBusiness,
  type IntakeStatus,
  type VisitErrors,
  type VisitInfo,
} from "@/lib/customer-intake";
import styles from "./intake.module.css";

type Step = "entry" | "terms" | "bridge" | "visit" | "review" | "lookup";

type Props = {
  business: IntakeBusiness;
  status?: IntakeStatus;
  initialStep?: "entry" | "visit";
  onStart?: (input: {
    consents: { type: "PRIVACY_REQUIRED" | "PHOTO"; termsVersion: string }[];
  }) => Promise<void>;
  onSaveVisit?: (input: VisitInfo) => Promise<void>;
  onRetry?: () => void;
  onLookup?: () => void;
  preview?: boolean;
  previewFailure?: "start" | "visit" | "address" | "region";
};

// 실제 네트워크·문의 토큰은 상위 연결 화면(FE-08/20)의 책임이다.
export default function CustomerIntake({
  business,
  status = "ready",
  initialStep = "entry",
  onStart,
  onSaveVisit,
  onRetry,
  onLookup,
  preview = false,
  previewFailure,
}: Props) {
  const [step, setStep] = useState<Step>(initialStep);
  const [privacy, setPrivacy] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [visit, setVisit] = useState<VisitInfo>({ ...emptyVisitInfo });
  const [errors, setErrors] = useState<VisitErrors>({});
  const [requestError, setRequestError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);
  const form = useRef<HTMLFormElement>(null);
  const [previewStatus, setPreviewStatus] = useState(status);
  const activeStatus = preview ? previewStatus : status;

  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  function move(next: Step) {
    setRequestError("");
    setStep(next);
  }

  async function start() {
    if (busy.current) return;
    if (!privacy) {
      setConsentError("개인정보 수집·이용에 동의해 주세요.");
      document.getElementById("privacy-consent")?.focus();
      return;
    }
    if (!preview && !onStart) return;
    busy.current = true;
    setPending(true);
    setRequestError("");
    try {
      const consents: Parameters<NonNullable<Props["onStart"]>>[0]["consents"] =
        [{ type: "PRIVACY_REQUIRED", termsVersion: business.termsVersion }];
      if (photo)
        consents.push({ type: "PHOTO", termsVersion: business.termsVersion });
      if (preview) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (previewFailure === "start") throw new Error("preview");
        move("bridge");
      } else await onStart!({ consents });
    } catch {
      setRequestError(
        "상담을 시작하지 못했어요. 선택한 동의는 유지돼요. 다시 시도해 주세요.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function saveVisit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const found = validateVisitInfo(visit, business.workTypes);
    setErrors(found);
    setRequestError("");
    if (Object.keys(found).length) {
      form.current
        ?.querySelector<HTMLInputElement>(`[name="${Object.keys(found)[0]}"]`)
        ?.focus();
      return;
    }
    if (!preview && !onSaveVisit) return;
    busy.current = true;
    setPending(true);
    try {
      if (preview) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (previewFailure === "address" || previewFailure === "region") {
          setErrors({
            address:
              previewFailure === "address"
                ? "주소를 확인하지 못했어요. 도로명과 건물번호를 확인해 주세요."
                : "업체의 방문 가능 지역이 아니에요. 주소를 확인하거나 업체에 문의해 주세요.",
          });
          document.getElementById("visit-address")?.focus();
          return;
        }
        if (previewFailure === "visit") throw new Error("preview");
        move("review");
      } else
        await onSaveVisit!({
          ...visit,
          name: visit.name.trim(),
          phone: visit.phone.replace(/[\s-]/g, ""),
          address: visit.address.trim(),
        });
    } catch {
      setRequestError(
        "방문정보를 보내지 못했어요. 입력한 내용은 그대로 있어요. 다시 시도해 주세요.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function lookup() {
    if (onLookup) onLookup();
    else if (preview) move("lookup");
  }

  function field(
    key: keyof VisitInfo,
    label: string,
    options: {
      optional?: boolean;
      autoComplete?: string;
      type?: string;
      placeholder?: string;
      hint?: string;
      maxLength: number;
    },
  ) {
    return (
      <div className={styles.field}>
        <label htmlFor={`visit-${key}`}>
          {label}
          {options.optional && <span> (선택)</span>}
        </label>
        <input
          id={`visit-${key}`}
          name={key}
          type={options.type || "text"}
          inputMode={key === "phone" ? "tel" : undefined}
          autoComplete={options.autoComplete}
          maxLength={options.maxLength}
          placeholder={options.placeholder}
          value={visit[key]}
          aria-invalid={Boolean(errors[key])}
          aria-required={!options.optional}
          aria-describedby={
            errors[key]
              ? `${key}-error`
              : options.hint
                ? `${key}-hint`
                : undefined
          }
          onChange={(event) => {
            setVisit({ ...visit, [key]: event.target.value });
            setErrors({ ...errors, [key]: undefined });
            setRequestError("");
          }}
        />
        {errors[key] && (
          <p id={`${key}-error`} className={styles.error}>
            {errors[key]}
          </p>
        )}
        {!errors[key] && options.hint && (
          <p id={`${key}-hint`} className={styles.hint}>
            {options.hint}
          </p>
        )}
      </div>
    );
  }

  const title =
    step === "terms"
      ? "상담 전 확인"
      : step === "visit"
        ? "방문 정보"
        : step === "review"
          ? "입력한 방문정보"
          : step === "lookup"
            ? "기존 문의·예약 조회"
            : step === "bridge"
              ? "상담 화면 연결"
              : business.name;
  const back =
    step === "terms"
      ? "entry"
      : step === "visit" && preview
        ? "bridge"
        : step === "review"
          ? "visit"
          : "entry";

  return (
    <main className={styles.shell}>
      {preview && (
        <p className={styles.preview}>
          화면 확인용 · 실제 접수·저장·문자 인증은 하지 않아요.
        </p>
      )}
      <header className={styles.header}>
        {step !== "entry" && (
          <button
            className={styles.back}
            type="button"
            disabled={pending}
            aria-label="이전 화면"
            onClick={() => move(back as Step)}
          >
            <Image src="/customer/back.svg" alt="" width={22} height={22} />
          </button>
        )}
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        {step === "entry" && (preview || onLookup) && (
          <button type="button" className={styles.textButton} onClick={lookup}>
            내 문의
          </button>
        )}
      </header>

      {activeStatus !== "ready" && step !== "lookup" ? (
        <section
          className={styles.content}
          aria-busy={activeStatus === "loading"}
        >
          <h2>{intakeStatusCopy[activeStatus].title}</h2>
          <p role={activeStatus === "loading" ? "status" : undefined}>
            {intakeStatusCopy[activeStatus].description}
          </p>
          {activeStatus === "paused" && (preview || onLookup) && (
            <button className={styles.primary} onClick={lookup}>
              기존 예약 조회
            </button>
          )}
          {activeStatus === "error" && (
            <button
              className={styles.primary}
              disabled={!preview && !onRetry}
              onClick={() =>
                preview ? setPreviewStatus("ready") : onRetry?.()
              }
            >
              다시 불러오기
            </button>
          )}
          <Link href="/">개발 홈으로 돌아가기</Link>
        </section>
      ) : (
        <>
          <section className={styles.content}>
            {step === "entry" && (
              <>
                <div className={styles.intro}>
                  <div>
                    <h2>
                      보일러가
                      <br />
                      말썽인가요?
                    </h2>
                    <p>
                      사진과 설명을 남겨주시면 덕구가 필요한 내용을 물어볼게요.
                    </p>
                  </div>
                  <div className={styles.mascot}>
                    <Image
                      src="/customer/deokgu-background.svg"
                      alt=""
                      width={82}
                      height={82}
                    />
                    <Image
                      src="/customer/deokgu.png"
                      alt="문의 접수를 돕는 덕구"
                      width={74}
                      height={104}
                      priority
                    />
                  </div>
                </div>
                <Progress current={1} />
                <div className={styles.businessInfo}>
                  <p>{business.guidance}</p>
                  <p>
                    대표 연락처{" "}
                    <a href={`tel:${business.phone.replace(/[^0-9+]/g, "")}`}>
                      {business.phone}
                    </a>
                  </p>
                </div>
                <fieldset className={styles.consents}>
                  <legend>상담 시작 전 확인해 주세요</legend>
                  <label>
                    <input
                      id="privacy-consent"
                      type="checkbox"
                      checked={privacy}
                      aria-describedby={
                        consentError ? "consent-error" : undefined
                      }
                      aria-invalid={Boolean(consentError)}
                      onChange={(e) => {
                        setPrivacy(e.target.checked);
                        setConsentError("");
                      }}
                    />
                    <span>
                      개인정보 수집·이용 동의 <strong>(필수)</strong>
                    </span>
                  </label>
                  <button
                    type="button"
                    className={styles.termsLink}
                    onClick={() => move("terms")}
                  >
                    수집 항목·이용 목적·보관 기간 보기
                  </button>
                  <label>
                    <input
                      type="checkbox"
                      checked={photo}
                      onChange={(e) => setPhoto(e.target.checked)}
                    />
                    <span>사진 수집·분석 동의 (선택)</span>
                  </label>
                  <p className={styles.hint}>사진 없이도 문의할 수 있어요.</p>
                  {consentError && (
                    <p id="consent-error" className={styles.error} role="alert">
                      {consentError}
                    </p>
                  )}
                </fieldset>
                {!preview && !onStart && (
                  <p className={styles.hint}>
                    상담 연결을 준비하고 있어요. 아직 새 문의를 접수하지 않아요.
                  </p>
                )}
              </>
            )}

            {step === "terms" && (
              <div className={styles.terms}>
                <h2>상담·예약에 필요한 정보를 확인하세요.</h2>
                <p>
                  필수 동의 후에 상담이 시작돼요. 사진은 별도로 동의한 경우
                  수집해요.
                </p>
                <dl>
                  <dt>수집 항목</dt>
                  <dd>
                    상담 내용·이름·연락처·방문 주소, 별도 동의한 첨부 사진
                  </dd>
                  <dt>이용 목적</dt>
                  <dd>문의 접수·상담·방문 예약 및 업무 안내</dd>
                  <dt>보관·삭제 기준</dt>
                  <dd>
                    상담·사진: 종료 후 30일
                    <br />
                    예약·정리된 정보: 종료 후 90일
                    <br />
                    미예약 문의: 마지막 활동 후 30일
                    <br />
                    접근 기록: 365일
                    <br />
                    별도 보관 근거가 있는 정보는 제외합니다.
                  </dd>
                </dl>
                <p>
                  고객 대화·사진은 별도 동의 없이 AI 학습에 사용하지 않아요.
                </p>
                <p className={styles.hint}>
                  동의 내용 버전: {business.termsVersion}
                </p>
              </div>
            )}

            {step === "bridge" && (
              <>
                <h2>다음은 사진·증상 상담이에요</h2>
                <p>이 구간은 FE-05 채팅 화면에서 이어집니다.</p>
                <p>
                  지금은 FE-03 화면 확인 중이에요. 아래 버튼으로 상담 이후의
                  방문정보 화면을 확인할 수 있어요.
                </p>
              </>
            )}

            {step === "visit" && (
              <>
                <Progress current={2} />
                <h2>어디로 방문하면 될까요?</h2>
                <form
                  ref={form}
                  id="visit-form"
                  noValidate
                  onSubmit={saveVisit}
                >
                  <fieldset className={styles.group} disabled={pending}>
                    <legend>연락받을 정보</legend>
                    <div className={styles.contactRow}>
                      {field("name", "이름", {
                        autoComplete: "name",
                        placeholder: "이름 입력",
                        maxLength: 50,
                      })}
                      {field("phone", "휴대전화", {
                        type: "tel",
                        autoComplete: "tel-national",
                        placeholder: "010-0000-0000",
                        maxLength: 20,
                      })}
                    </div>
                    <p className={styles.hint}>
                      문자 인증은 예약을 확정하기 전에 진행해요.
                    </p>
                    <div className={styles.field}>
                      <label htmlFor="visit-workTypeId">
                        작업 유형 <span>(선택)</span>
                      </label>
                      <select
                        id="visit-workTypeId"
                        name="workTypeId"
                        value={visit.workTypeId}
                        onChange={(e) =>
                          setVisit({ ...visit, workTypeId: e.target.value })
                        }
                      >
                        <option value="">잘 모르겠어요 · 선택 안 함</option>
                        {business.workTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </fieldset>
                  <fieldset className={styles.group} disabled={pending}>
                    <legend>방문 장소</legend>
                    {field("address", "방문 주소", {
                      autoComplete: "address-line1",
                      placeholder: "도로명과 건물번호 입력",
                      maxLength: 200,
                      hint: "서비스 가능 지역은 서버 연결 후 확인해요.",
                    })}
                    {field("addressDetail", "상세 주소", {
                      optional: true,
                      autoComplete: "address-line2",
                      placeholder: "건물명·동·호수",
                      maxLength: 200,
                    })}
                    {field("accessNote", "추가 요청", {
                      optional: true,
                      placeholder: "주차·출입 안내를 적어주세요.",
                      maxLength: 500,
                    })}
                  </fieldset>
                </form>
                {!preview && !onSaveVisit && (
                  <p className={styles.hint}>
                    방문정보 저장 연결을 준비하고 있어요.
                  </p>
                )}
              </>
            )}

            {step === "review" && (
              <>
                <h2>입력한 내용을 확인해 주세요</h2>
                <dl className={styles.review}>
                  <dt>이름</dt>
                  <dd>{visit.name}</dd>
                  <dt>휴대전화</dt>
                  <dd>
                    {visit.phone} <span>미인증</span>
                  </dd>
                  <dt>방문 주소</dt>
                  <dd>
                    {visit.address}
                    <br />
                    {visit.addressDetail}
                  </dd>
                  <dt>작업 유형</dt>
                  <dd>
                    {business.workTypes.find((t) => t.id === visit.workTypeId)
                      ?.name || "선택 안 함"}
                  </dd>
                  {visit.accessNote && (
                    <>
                      <dt>추가 요청</dt>
                      <dd>{visit.accessNote}</dd>
                    </>
                  )}
                </dl>
                <p>
                  화면에서 입력한 내용이에요. 서버 저장·주소 확인·예약 확정은
                  하지 않았어요.
                </p>
              </>
            )}

            {step === "lookup" && (
              <>
                <h2>본인 확인 후 조회할 수 있어요</h2>
                <p>
                  기존 상담·예약 조회와 문자 인증은 FE-20에서 연결합니다. 지금은
                  조회 화면 연결 지점만 확인할 수 있어요.
                </p>
              </>
            )}
            {requestError && (
              <p className={styles.error} role="alert">
                {requestError}
              </p>
            )}
          </section>
          <footer className={styles.footer}>
            {step === "entry" && (
              <button
                type="button"
                className={styles.primary}
                disabled={pending || (!preview && !onStart)}
                onClick={start}
              >
                {pending ? "상담 시작 중…" : "동의하고 문의 시작"}
              </button>
            )}
            {step === "terms" && (
              <button
                className={styles.primary}
                type="button"
                onClick={() => move("entry")}
              >
                내용 확인 · 돌아가기
              </button>
            )}
            {step === "bridge" && preview && (
              <button
                type="button"
                className={styles.primary}
                onClick={() => move("visit")}
              >
                방문정보 화면 확인
              </button>
            )}
            {step === "visit" && (
              <button
                className={styles.primary}
                type="submit"
                form="visit-form"
                disabled={pending || (!preview && !onSaveVisit)}
              >
                {pending ? "입력정보 확인 중…" : "접수 내용 확인"}
              </button>
            )}
            {step === "review" && (
              <button className={styles.primary} onClick={() => move("visit")}>
                방문정보 수정
              </button>
            )}
            {step === "lookup" && (
              <button className={styles.primary} onClick={() => move("entry")}>
                돌아가기
              </button>
            )}
          </footer>
        </>
      )}
    </main>
  );
}

function Progress({ current }: { current: 1 | 2 }) {
  return (
    <ol className={styles.progress} aria-label="접수 단계">
      {["사진·증상", "방문 정보", "방문시간"].map((label, i) => (
        <li key={label} aria-current={i + 1 === current ? "step" : undefined}>
          <span
            className={
              i + 1 < current
                ? styles.complete
                : i + 1 === current
                  ? styles.current
                  : styles.number
            }
          >
            {i + 1 < current ? (
              <Image
                src="/customer/check.svg"
                alt="완료"
                width={14}
                height={14}
              />
            ) : (
              i + 1
            )}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}
