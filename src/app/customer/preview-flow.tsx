"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import CustomerIntake, { Progress } from "./intake";
import CustomerConsultation, { FieldList } from "./consultation";
import { createClientId } from "@/lib/customer-consultation";
import { emptyVisitInfo, type VisitInfo } from "@/lib/customer-intake";
import type {
  CustomerMessage,
  IntakeField,
  PhotoRequest,
  SendCustomerInput,
} from "@/lib/customer-consultation";
import base from "./intake.module.css";
import styles from "./consultation.module.css";

const business = {
  name: "한빛 보일러 · 화면 예시",
  phone: "02-000-0000",
  guidance: "설치·수리 문의를 남겨주세요. 업체 정보는 화면 확인용 예시예요.",
  termsVersion: "2026-10-v1",
  workTypes: [{ id: "sample-repair", name: "수리 (예시)" }],
};
const initialFields: IntakeField[] = [
  {
    key: "manufacturer",
    label: "제조사",
    value: null,
    source: "CUSTOMER",
    status: "UNCONFIRMED",
  },
  {
    key: "model",
    label: "본체 모델",
    value: null,
    source: "PHOTO",
    status: "UNCONFIRMED",
    reason: "사진에서 확인한 모델명이 아직 없어요.",
  },
  {
    key: "controller_model",
    label: "조절기 모델",
    value: null,
    source: "PHOTO",
    status: "UNCONFIRMED",
  },
  {
    key: "error_code",
    label: "오류코드",
    value: null,
    source: "PHOTO",
    status: "UNCONFIRMED",
  },
];

// 고정된 화면 확인용 응답이다. 사용자 입력을 AI로 분석하거나 외부로 전송하지 않는다.
export default function ConsultationPreviewFlow({
  scene,
  failure,
}: {
  scene: string;
  failure?: string;
}) {
  const example = scene === "retake" || scene === "summary";
  const [stage, setStage] = useState(
    scene === "start" ? "entry" : scene === "summary" ? "review" : "chat",
  );
  const [photoConsent, setPhotoConsent] = useState(scene !== "start");
  const [handler, setHandler] = useState<"AI" | "OWNER">("AI");
  const [messages, setMessages] = useState<CustomerMessage[]>([
    {
      id: "hello",
      role: "AI",
      content:
        "안녕하세요! 어떤 점이 불편하세요? 사진이 있으면 함께 보내주세요.",
    },
    ...(example
      ? [
          {
            id: "example-customer",
            role: "CUSTOMER" as const,
            content: "보일러가 켜지는데 온수가 안 나와요.",
            photos: [
              {
                id: 1,
                url: "/customer/boiler-example.png",
                name: "피그마 합성 예시",
              },
            ],
          },
          {
            id: "example-ai",
            role: "AI" as const,
            content:
              "오류코드 03이 보여요. 모델명 라벨도 가까이 찍어주실 수 있나요?",
          },
        ]
      : []),
  ]);
  const [fields] = useState<IntakeField[]>(
    initialFields.map((field) =>
      example && field.key === "manufacturer"
        ? { ...field, value: "경동나비엔", status: "CONFIRMED" as const }
        : example && field.key === "error_code"
          ? { ...field, value: "03", status: "CONFIRMED" as const }
          : field,
    ),
  );
  const [photoRequest, setPhotoRequest] = useState<PhotoRequest | undefined>(
    example
      ? { attempt: 1, reason: "글자가 흐려 모델명을 읽기 어려워요." }
      : undefined,
  );
  const [visit, setVisit] = useState<VisitInfo>(
    scene === "summary"
      ? {
          ...emptyVisitInfo,
          name: "김○○",
          phone: "010-0000-0000",
          address: "화정동 ○○아파트",
          addressDetail: "102동",
        }
      : { ...emptyVisitInfo },
  );
  const failures = useRef(new Set<string>());
  const uploads = useRef(new Map<number, { url: string; name: string }>());
  const applied = useRef(new Set<string>());
  useEffect(() => {
    const pictures = uploads.current;
    return () => {
      for (const photo of pictures.values()) URL.revokeObjectURL(photo.url);
    };
  }, []);

  async function wait(operation: string) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (
      (failure === operation ||
        (failure === "expired" && operation === "send")) &&
      !failures.current.has(operation)
    ) {
      failures.current.add(operation);
      throw Object.assign(new Error("Preview failure"), {
        code: failure === "expired" ? "TOKEN_EXPIRED" : "PREVIEW_FAILURE",
      });
    }
  }

  async function send(input: SendCustomerInput) {
    await wait("send");
    if (applied.current.has(input.clientMsgId)) return;
    applied.current.add(input.clientMsgId);
    const photos = input.photoIds.map((id) => ({
      id,
      ...uploads.current.get(id)!,
    }));
    setMessages((current) => [
      ...current,
      {
        id: input.clientMsgId,
        role: "CUSTOMER",
        content: input.content,
        photos,
      },
      {
        id: `${input.clientMsgId}-reply`,
        role: handler,
        content:
          handler === "OWNER"
            ? "사장님 응답이 표시되는 위치예요. 실제 대화는 서버 연결 후 확인해요."
            : "말씀하신 내용이 접수 정보에 이어져요. 지금은 고정된 화면 확인용 응답이며 실제 분석 결과는 AI 연결 후 표시돼요.",
      },
    ]);
    if (input.photoIds.length)
      setPhotoRequest({
        attempt: 1,
        reason:
          "화면 확인용 촬영 안내예요. 실제 재촬영 판단은 서버 결과를 따릅니다.",
      });
  }

  return (
    <>
      <p className={styles.previewNotice}>
        화면 확인용 · 예시 업체·고정 응답 · 외부 전송·실제 저장·AI 분석·예약
        없음
      </p>
      {stage === "entry" ? (
        <CustomerIntake
          business={business}
          onStart={async (input) => {
            setPhotoConsent(input.consents.some((c) => c.type === "PHOTO"));
            setStage("chat");
          }}
        />
      ) : stage === "visit" ? (
        <CustomerIntake
          business={business}
          initialStep="visit"
          initialVisit={visit}
          onBackToChat={(input) => {
            setVisit(input);
            setStage("chat");
          }}
          onSaveVisit={async (input) => {
            setVisit(input);
            setStage("review");
          }}
        />
      ) : stage === "review" ? (
        <main className={`${base.shell} ${styles.shell}`}>
          <header className={base.header}>
            <button
              type="button"
              className={base.back}
              aria-label="이전 화면"
              onClick={() => setStage("visit")}
            >
              <Image src="/customer/back.svg" alt="" width={22} height={22} />
            </button>
            <h1>접수 내용 확인</h1>
          </header>
          <section className={base.content}>
            <Progress current={2} />
            <h2>접수 내용을 확인해 주세요</h2>
            <section>
              <h2>보일러·증상</h2>
              {example && (
                <Image
                  className={styles.summaryPhoto}
                  src="/customer/boiler-example.png"
                  width={100}
                  height={134}
                  alt="피그마 합성 예시 보일러"
                />
              )}
              <FieldList fields={fields} />
              {messages
                .filter((m) => m.role === "CUSTOMER" && m.content)
                .map((m) => (
                  <p key={m.id}>{m.content}</p>
                ))}
              <button
                type="button"
                className={styles.quiet}
                onClick={() => setStage("chat")}
              >
                사진·증상 수정
              </button>
            </section>
            <section>
              <h2>방문 정보</h2>
              <p>
                {visit.name} · {visit.phone}
              </p>
              <p>
                {visit.address} {visit.addressDetail}
              </p>
              {visit.accessNote && <p>{visit.accessNote}</p>}
              <p className={styles.caption}>휴대전화 미인증</p>
              <button
                type="button"
                className={styles.quiet}
                onClick={() => setStage("visit")}
              >
                방문 정보 수정
              </button>
            </section>
            <p className={styles.caption}>
              이 화면의 내용은 기기 메모리에만 있어요. 새로고침하면 초기화돼요.
            </p>
          </section>
          <footer className={base.footer}>
            <button type="button" className={base.primary} disabled>
              방문시간 선택
            </button>
            <p className={styles.caption}>
              방문시간 선택·문자 인증은 후속 예약 화면에서 연결해요.
            </p>
          </footer>
        </main>
      ) : (
        <CustomerConsultation
          businessName={business.name}
          messages={messages}
          fields={fields}
          photoConsent={photoConsent}
          photoRequest={photoRequest}
          handler={handler}
          canContinue={messages.some((m) => m.role === "CUSTOMER")}
          onSend={send}
          onUpload={async (file) => {
            await wait("upload");
            const photoId = uploads.current.size + 100;
            uploads.current.set(photoId, {
              url: URL.createObjectURL(file),
              name: file.name,
            });
            return { photoId };
          }}
          onHandoff={async () => {
            await wait("handoff");
            setHandler("OWNER");
            setPhotoRequest(undefined);
            setMessages((current) => [
              ...current,
              {
                id: createClientId(),
                role: "SYSTEM",
                content: "직접 상담 요청이 접수됐을 때 표시하는 화면 예시예요.",
              },
            ]);
          }}
          onContinue={() => setStage("visit")}
          onBack={() => setStage("entry")}
        />
      )}
    </>
  );
}
