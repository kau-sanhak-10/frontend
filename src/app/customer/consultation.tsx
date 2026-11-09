"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  createClientId,
  consultationError,
  fieldSources,
  fieldText,
  validatePhoto,
  type CustomerMessage,
  type IntakeField,
  type PhotoRequest,
  type SendCustomerInput,
} from "@/lib/customer-consultation";
import base from "./intake.module.css";
import styles from "./consultation.module.css";
import { Progress } from "./intake";

type Attachment = {
  id: string;
  file: File;
  url: string;
  photoId?: number;
  error?: string;
};
type Props = {
  businessName: string;
  messages: CustomerMessage[];
  fields: IntakeField[];
  photoConsent: boolean;
  photoRequest?: PhotoRequest;
  handler?: "AI" | "OWNER";
  canContinue?: boolean;
  textOnly?: boolean;
  photosEnabled?: boolean;
  liveNotice?: string;
  onSend?: (input: SendCustomerInput) => Promise<void>;
  onUpload?: (file: File) => Promise<{ photoId: number }>;
  onHandoff?: () => Promise<void>;
  onContinue?: () => void;
  onBack?: () => void;
};

// FE-05는 화면과 전송 상태만 맡는다. AI 판단·저장·토큰·재시도 정책은 연결 계층의 책임이다.
export default function CustomerConsultation({
  businessName,
  messages,
  fields,
  photoConsent,
  photoRequest,
  handler = "AI",
  canContinue = false,
  textOnly = false,
  photosEnabled = !textOnly,
  liveNotice,
  onSend,
  onUpload,
  onHandoff,
  onContinue,
  onBack,
}: Props) {
  const [view, setView] = useState<"chat" | "photo" | "fields">("chat");
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [picking, setPicking] = useState(false);
  const busy = useRef(false);
  const choosing = useRef(false);
  const draftId = useRef<string | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const urls = useRef(new Set<string>());
  const uploaded = useRef(new Map<string, number>());
  const feed = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLElement>(null);
  const previousView = useRef(view);

  useEffect(() => {
    const viewport = window.visualViewport;
    function fitViewport() {
      const element = shell.current;
      if (!element) return;
      const top = Math.max(0, element.getBoundingClientRect().top);
      element.style.height = `${Math.max(0, (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0) - top)}px`;
    }
    fitViewport();
    viewport?.addEventListener("resize", fitViewport);
    viewport?.addEventListener("scroll", fitViewport);
    window.addEventListener("resize", fitViewport);
    return () => {
      viewport?.removeEventListener("resize", fitViewport);
      viewport?.removeEventListener("scroll", fitViewport);
      window.removeEventListener("resize", fitViewport);
    };
  }, []);

  useEffect(() => {
    const createdUrls = urls.current;
    return () => {
      for (const url of createdUrls) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    if (previousView.current !== view) {
      heading.current?.focus();
      previousView.current = view;
    }
  }, [view]);
  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight });
  }, [messages.length]);

  async function choosePhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!photoConsent || pending || choosing.current) return;
    choosing.current = true;
    setPicking(true);
    const added: Attachment[] = [];
    const failures: string[] = [];
    const persistedPhotoCount = new Set([
      ...messages.flatMap(
        (m) => m.photoIds ?? m.photos?.map((p) => p.id) ?? [],
      ),
      ...uploaded.current.values(),
    ]).size;
    try {
      for (const file of selected) {
        const issue = validatePhoto(
          file,
          persistedPhotoCount +
            attachments.filter((a) => !uploaded.current.has(a.id)).length +
            added.length,
        );
        if (issue) {
          failures.push(`${file.name}: ${issue}`);
          continue;
        }
        try {
          const bitmap = await createImageBitmap(file);
          bitmap.close();
        } catch {
          failures.push(
            `${file.name}: 사진을 읽지 못했어요. 다른 사진을 선택해 주세요.`,
          );
          continue;
        }
        const id = createClientId();
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        added.push({ id, file, url });
      }
      setError(failures.join("\n"));
      if (added.length) {
        setAttachments((current) => [...current, ...added]);
        draftId.current = null;
        setView("chat");
      }
    } finally {
      choosing.current = false;
      setPicking(false);
    }
  }

  async function send() {
    if (
      busy.current ||
      choosing.current ||
      !onSend ||
      (!text.trim() && !attachments.length)
    )
      return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      draftId.current ??= createClientId();
      const photoIds: number[] = [];
      // 성공한 사진은 다시 업로드하지 않는다. 메시지만 실패해도 같은 clientMsgId로 재전송한다.
      for (const attachment of attachments) {
        let photoId = uploaded.current.get(attachment.id);
        if (photoId === undefined) {
          if (!onUpload || !photoConsent)
            throw new Error("Photo upload unavailable");
          try {
            const result = await onUpload(attachment.file);
            if (!Number.isSafeInteger(result.photoId) || result.photoId <= 0)
              throw new Error("Invalid photo response");
            photoId = result.photoId;
            uploaded.current.set(attachment.id, photoId);
            setAttachments((current) =>
              current.map((a) =>
                a.id === attachment.id
                  ? { ...a, photoId, error: undefined }
                  : a,
              ),
            );
          } catch (failure) {
            setAttachments((current) =>
              current.map((a) =>
                a.id === attachment.id
                  ? { ...a, error: "사진 전송 실패 · 다시 보내주세요" }
                  : a,
              ),
            );
            throw failure;
          }
        }
        photoIds.push(photoId);
      }
      await onSend({
        clientMsgId: draftId.current,
        content: text.trim(),
        photoIds,
      });
      setText("");
      setAttachments([]);
      draftId.current = null;
    } catch (failure) {
      setError(consultationError(failure));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function handoff() {
    if (busy.current || !onHandoff) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await onHandoff();
    } catch (failure) {
      setError(consultationError(failure));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function remove(id: string) {
    if (pending) return;
    const attachment = attachments.find((a) => a.id === id);
    if (attachment) {
      URL.revokeObjectURL(attachment.url);
      urls.current.delete(attachment.url);
    }
    setAttachments((current) => current.filter((a) => a.id !== id));
    draftId.current = null;
  }

  const photoButtonDisabled = !photoConsent || !onUpload || pending;
  const unsent = Boolean(text.trim() || attachments.length);
  return (
    <main ref={shell} className={`${base.shell} ${styles.shell}`}>
      <header className={base.header}>
        <button
          type="button"
          className={base.back}
          aria-label="이전 화면"
          disabled={
            pending || picking || (view === "chat" && (!onBack || unsent))
          }
          onClick={() => (view === "chat" ? onBack?.() : setView("chat"))}
        >
          <Image src="/customer/back.svg" width={22} height={22} alt="" />
        </button>
        <h1 ref={heading} tabIndex={-1}>
          {view === "photo"
            ? "사진 보완"
            : view === "fields"
              ? "접수 정보 확인"
              : "덕구와 상담"}
        </h1>
        {view === "chat" && !textOnly && (
          <button
            type="button"
            className={base.textButton}
            onClick={() => setView("fields")}
          >
            접수
          </button>
        )}
      </header>
      <input
        ref={files}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        hidden
        aria-label="사진 파일 선택"
        onChange={choosePhotos}
      />
      {view === "chat" ? (
        <>
          <div ref={feed} className={styles.feed}>
            <p className={styles.caption}>
              {handler === "OWNER"
                ? "사장님과 직접 상담 중"
                : `덕구 · ${businessName} AI 접수 도우미`}
            </p>
            {liveNotice && (
              <p role="status" className={styles.caption}>
                {liveNotice}
              </p>
            )}
            <div
              role="log"
              aria-label="상담 대화"
              aria-live="polite"
              aria-relevant="additions"
              className={styles.messages}
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "CUSTOMER"
                      ? styles.customer
                      : styles.assistant
                  }
                >
                  <span className={styles.srOnly}>
                    {message.role === "CUSTOMER"
                      ? "고객"
                      : message.role === "OWNER"
                        ? "사장님"
                        : message.role === "SYSTEM"
                          ? "안내"
                          : "덕구"}
                  </span>
                  {message.content && (
                    <p className={styles.bubble}>{message.content}</p>
                  )}
                  {!message.photos?.length &&
                    Boolean(message.photoIds?.length) && (
                      <p className={styles.bubble}>
                        사진 {message.photoIds?.length}장 · 전송 완료
                      </p>
                    )}
                  {message.photos?.map((photo) => (
                    <figure key={photo.id} className={styles.sentPhoto}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- 사용자 사진·짧은 유효기간 URL은 최적화 캐시에 저장하지 않는다. */}
                      <img
                        src={photo.url}
                        alt={`보낸 사진: ${photo.name}`}
                        width={160}
                        height={138}
                      />
                      <figcaption>사진 · 전송 완료</figcaption>
                    </figure>
                  ))}
                </div>
              ))}
            </div>
            {pending && (
              <p role="status" className={styles.caption}>
                전송 중이에요…
              </p>
            )}
            {photoRequest && handler === "AI" && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setView("photo")}
                >
                  모델명 사진 추가
                </button>
                <button
                  type="button"
                  className={styles.quiet}
                  onClick={() => setView("fields")}
                >
                  사진을 더 찍기 어려워요
                </button>
              </div>
            )}
            {handler === "AI" && onHandoff && (
              <button
                type="button"
                className={styles.quiet}
                disabled={pending || !onHandoff}
                onClick={handoff}
              >
                사장님과 직접 상담
              </button>
            )}
            {canContinue && (
              <button
                type="button"
                className={styles.secondary}
                disabled={textOnly && (pending || unsent)}
                onClick={textOnly ? onContinue : () => setView("fields")}
              >
                {textOnly ? "시연용 방문정보 입력" : "정리된 접수 정보 확인"}
              </button>
            )}
          </div>
          <footer className={styles.composer}>
            {attachments.length > 0 && (
              <ul className={styles.attachments} aria-label="보낼 사진">
                {attachments.map((a) => (
                  <li key={a.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- 기기에만 있는 사진 미리보기 */}
                    <img src={a.url} alt={a.file.name} width={64} height={64} />
                    <div>
                      <span className={styles.fileName}>{a.file.name}</span>
                      <span>
                        {a.error ||
                          (a.photoId
                            ? "업로드 완료 · 메시지 전송 대기"
                            : "전송 대기")}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(a.id)}
                      aria-label={`${a.file.name} 첨부 취소`}
                    >
                      첨부 취소
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {!photoConsent && photosEnabled && (
              <p className={styles.caption}>
                사진 전송에 동의하지 않았어요. 글로 계속 상담할 수 있어요.
              </p>
            )}
            <form
              className={styles.composeRow}
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              {photosEnabled && (
                <button
                  type="button"
                  className={styles.iconButton}
                  disabled={photoButtonDisabled}
                  aria-label="사진 첨부"
                  onClick={() => files.current?.click()}
                >
                  <Image
                    src="/customer/plus.svg"
                    width={22}
                    height={22}
                    alt=""
                  />
                </button>
              )}
              <textarea
                rows={1}
                aria-label="메시지"
                placeholder="메시지를 입력해 주세요"
                value={text}
                maxLength={2000}
                disabled={pending || picking || !onSend}
                onChange={(event) => {
                  setText(event.target.value);
                  draftId.current = null;
                }}
              />
              <button
                type="submit"
                className={styles.iconButton}
                aria-label="메시지 보내기"
                disabled={
                  pending ||
                  picking ||
                  !onSend ||
                  (!text.trim() && !attachments.length)
                }
              >
                <Image src="/customer/send.svg" width={22} height={22} alt="" />
              </button>
            </form>
          </footer>
        </>
      ) : (
        <>
          <section className={base.content}>
            <Progress current={1} />
            {view === "photo" ? (
              <>
                <div>
                  <h2>
                    모델명 라벨을
                    <br />
                    가까이 찍어주세요
                  </h2>
                  <p className={styles.caption}>
                    보완 촬영 {photoRequest?.attempt ?? 1}/2 ·{" "}
                    {photoRequest?.reason ?? "글자가 모두 보이도록 찍어주세요."}
                  </p>
                </div>
                <div className={styles.photoGuide}>
                  <Image
                    src="/customer/label-guide.svg"
                    width={118}
                    height={166}
                    alt="보일러 옆면의 제품 라벨 위치 예시"
                  />
                  <div>
                    <strong>제품 라벨</strong>
                    <div className={styles.labelExample}>
                      <span>모델명</span>
                      <p>글자가 모두 보이게</p>
                    </div>
                    <p className={styles.caption}>
                      라벨 위치는
                      <br />
                      제품마다 달라요.
                    </p>
                  </div>
                </div>
                <div>
                  <h2>촬영할 때</h2>
                  <p className={styles.caption}>
                    라벨 전체가 보이게 · 빛 반사 없이
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.quiet}
                  onClick={() => setView("fields")}
                >
                  모델명 없이 계속하기
                </button>
                <p className={styles.caption}>
                  모델명 없이도 계속할 수 있어요.
                  <br />
                  JPG·PNG · 10장까지 · 장당 10MB
                </p>
                {!photoConsent && (
                  <p className={styles.caption}>
                    사진 전송에 동의하지 않았어요. 글로 계속 상담할 수 있어요.
                  </p>
                )}
              </>
            ) : (
              <>
                <h2>접수 내용을 확인해 주세요</h2>
                <FieldList fields={fields} />
                <p className={styles.caption}>
                  모델명 등 참고정보가 미확인이어도 계속할 수 있어요. 방문
                  준비에 꼭 필요한 정보는 추가로 확인해요.
                </p>
                <button
                  type="button"
                  className={styles.quiet}
                  onClick={() => setView("chat")}
                >
                  사진·증상 수정
                </button>
              </>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </section>
          <footer className={base.footer}>
            {view === "photo" ? (
              <button
                type="button"
                className={base.primary}
                disabled={photoButtonDisabled}
                onClick={() => files.current?.click()}
              >
                다시 찍거나 사진 선택
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={base.primary}
                  disabled={
                    pending || picking || unsent || !canContinue || !onContinue
                  }
                  onClick={onContinue}
                >
                  방문정보 입력
                </button>
                {unsent && (
                  <p className={styles.caption}>
                    보낼 내용이 남아 있어요. 메시지를 보내거나 첨부를 취소한 뒤
                    계속해 주세요.
                  </p>
                )}
                {!canContinue && (
                  <p className={styles.caption}>
                    필요한 상담을 마친 뒤 다음 단계로 안내해 드려요.
                  </p>
                )}
              </>
            )}
          </footer>
        </>
      )}
    </main>
  );
}

export function FieldList({ fields }: { fields: IntakeField[] }) {
  return (
    <dl className={styles.fields}>
      {fields.map((field) => (
        <div key={field.key}>
          <dt>{field.label}</dt>
          <dd>
            <span
              className={
                field.status === "CONFIRMED" && field.value
                  ? undefined
                  : styles.unconfirmed
              }
            >
              {fieldText(field)}
            </span>
            <small>{fieldSources[field.source]}</small>
            {field.reason && <p>{field.reason}</p>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
