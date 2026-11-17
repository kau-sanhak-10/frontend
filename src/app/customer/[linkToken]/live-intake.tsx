"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createCustomerInquiry,
  createCustomerPhotoUploader,
  getCustomerIntake,
  getCustomerMessages,
  isIntakeLinkToken,
  isWaitingForOwner,
  requestCustomerHandoff,
  sendCustomerMessage,
} from "@/lib/customer-api";
import type {
  CustomerMessage,
  SendCustomerInput,
} from "@/lib/customer-consultation";
import type { IntakeBusiness, IntakeStatus } from "@/lib/customer-intake";
import CustomerConsultation from "../consultation";
import CustomerIntake from "../intake";
import CustomerDemoVisit from "./demo-visit";

const emptyBusiness: IntakeBusiness = {
  name: "업체 문의",
  phone: "",
  guidance: "",
  termsVersion: "",
  workTypes: [],
};
type Inquiry = Awaited<ReturnType<typeof createCustomerInquiry>> & {
  photoConsent: boolean;
};

function linkStatus(error: unknown): IntakeStatus {
  if (!(error instanceof ApiError)) return "error";
  if (error.code === "INTAKE_LINK_INVALID") return "invalid";
  if (error.code === "INTAKE_PAUSED") return "paused";
  if (error.code === "OWNER_UNAVAILABLE") return "unavailable";
  return "error";
}

export default function CustomerLiveIntake({
  linkToken,
  visitDemo,
  photoDemo,
  photoCancel,
}: {
  linkToken: string;
  visitDemo: boolean;
  photoDemo: boolean;
  photoCancel: boolean;
}) {
  const validLink = isIntakeLinkToken(linkToken, visitDemo);
  const [status, setStatus] = useState<IntakeStatus>(
    validLink ? "loading" : "invalid",
  );
  const [business, setBusiness] = useState(emptyBusiness);
  const [attempt, setAttempt] = useState(0);
  // ponytail: 현재 화면에만 문의 토큰을 유지. 새로고침·기기 변경 복구는 FE-20 인증에 연결한다.
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);

  useEffect(() => {
    if (!validLink) return;
    const controller = new AbortController();
    void getCustomerIntake(linkToken, controller.signal, visitDemo)
      .then(({ business, available }) => {
        if (controller.signal.aborted) return;
        setBusiness(business);
        setStatus(available ? "ready" : "paused");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setStatus(linkStatus(error));
      });
    return () => controller.abort();
  }, [linkToken, attempt, validLink, visitDemo]);

  if (inquiry)
    return (
      <LiveConsultation
        business={business}
        inquiry={inquiry}
        visitDemo={visitDemo}
        photoDemo={photoDemo}
        photoCancel={photoCancel}
      />
    );
  return (
    <CustomerIntake
      business={business}
      status={status}
      textOnly
      visitDemo={visitDemo}
      photosEnabled={photoDemo}
      onRetry={() => {
        setStatus("loading");
        setAttempt((value) => value + 1);
      }}
      onStart={async ({ consents }) => {
        try {
          const created = await createCustomerInquiry(linkToken, consents);
          setInquiry({
            ...created,
            photoConsent: photoDemo && consents.some((c) => c.type === "PHOTO"),
          });
        } catch (error) {
          const status = linkStatus(error);
          if (status !== "error") setStatus(status);
          throw error;
        }
      }}
    />
  );
}

function LiveConsultation({
  business,
  inquiry,
  visitDemo,
  photoDemo,
  photoCancel,
}: {
  business: IntakeBusiness;
  inquiry: Inquiry;
  visitDemo: boolean;
  photoDemo: boolean;
  photoCancel: boolean;
}) {
  const { inquiryId, inquiryToken, expiresAt, photoConsent } = inquiry;
  const [photoUploader] = useState(() =>
    createCustomerPhotoUploader(inquiryId, inquiryToken),
  );
  const [messages, setMessages] = useState<CustomerMessage[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [showVisit, setShowVisit] = useState(false);
  const [ownerRequested, setOwnerRequested] = useState(false);
  const [ownerWillReview, setOwnerWillReview] = useState(false);
  const [waitingAfter, setWaitingAfter] = useState<number | null>(null);
  const [slowAfter, setSlowAfter] = useState<number | null>(null);
  const waitingForReply =
    waitingAfter !== null &&
    !ownerWillReview &&
    !messages.some(
      (message) =>
        (message.role === "AI" || message.role === "OWNER") &&
        Number(message.id) > waitingAfter,
    );

  useEffect(() => {
    if (!waitingForReply || ended) return;
    const timer = setTimeout(() => setSlowAfter(waitingAfter), 12_000);
    return () => clearTimeout(timer);
  }, [ended, waitingAfter, waitingForReply]);

  useEffect(() => {
    if (!waitingForReply || ended || slowAfter !== waitingAfter) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function checkHandoff() {
      try {
        const handedOff = await isWaitingForOwner(
          inquiryId,
          inquiryToken,
          AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        );
        if (controller.signal.aborted) return;
        if (handedOff) {
          setOwnerWillReview(true);
          return;
        }
      } catch {
        // 메시지 조회와 독립적이다. 잠깐 실패해도 대화나 전송은 막지 않는다.
      }
      if (!controller.signal.aborted) timer = setTimeout(checkHandoff, 4000);
    }
    void checkHandoff();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    ended,
    inquiryId,
    inquiryToken,
    slowAfter,
    waitingAfter,
    waitingForReply,
  ]);

  function addMessages(newMessages: CustomerMessage[]) {
    if (!newMessages.length) return;
    setMessages((current) =>
      Array.from(
        new Map([...current, ...newMessages].map((m) => [m.id, m])).values(),
      ).sort((a, b) => Number(a.id) - Number(b.id)),
    );
  }

  useEffect(() => {
    const controller = new AbortController();
    let cursor = 0;
    let timeout: ReturnType<typeof setTimeout>;
    async function poll() {
      if (controller.signal.aborted) return;
      if (Date.now() >= Date.parse(expiresAt)) {
        setEnded(true);
        return;
      }
      let delay = 4000;
      if (!document.hidden) {
        try {
          const page = await getCustomerMessages(
            inquiryId,
            inquiryToken,
            cursor,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          addMessages(page.messages);
          cursor = page.cursor;
          setLoadFailed(false);
          if (page.hasMore) delay = 0;
        } catch (error) {
          if (controller.signal.aborted) return;
          if (
            error instanceof ApiError &&
            [401, 403, 404].includes(error.status)
          ) {
            setEnded(true);
            return;
          }
          setLoadFailed(true);
        }
      }
      timeout = setTimeout(poll, delay);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [inquiryId, inquiryToken, expiresAt]);

  async function send(input: SendCustomerInput) {
    const { messageId, aiStatus } = await sendCustomerMessage(
      inquiryId,
      inquiryToken,
      input,
    );
    addMessages([
      {
        id: String(messageId),
        role: "CUSTOMER",
        content: input.content,
        photoIds: input.photoIds,
      },
    ]);
    if (aiStatus === "PROCESSING") setOwnerWillReview(false);
    setWaitingAfter(aiStatus === "PROCESSING" ? messageId : null);
  }

  if (showVisit && !ended)
    return (
      <CustomerDemoVisit
        inquiryId={inquiryId}
        inquiryToken={inquiryToken}
        onBack={() => setShowVisit(false)}
      />
    );

  return (
    <CustomerConsultation
      businessName={business.name}
      messages={messages}
      fields={[]}
      handler={ownerRequested || ownerWillReview ? "OWNER" : "AI"}
      photoConsent={photoConsent}
      photosEnabled={photoDemo}
      textOnly
      canContinue={
        visitDemo &&
        !ended &&
        messages.some((message) => message.role === "CUSTOMER")
      }
      onContinue={visitDemo && !ended ? () => setShowVisit(true) : undefined}
      liveNotice={
        ended
          ? "이 상담에 더 이상 접근할 수 없어요. 업체에 문의해 주세요."
          : ownerRequested
            ? "사장님에게 직접 상담 요청을 전달했어요."
            : ownerWillReview
              ? "보낸 내용은 저장됐어요. 사장님이 확인할 예정이에요."
              : loadFailed
                ? "새 답변을 불러오지 못했어요. 연결되면 다시 확인할게요."
                : waitingForReply
                  ? slowAfter === waitingAfter
                    ? "보낸 내용은 저장됐어요. 아직 답변이 도착하지 않았어요."
                    : "메시지를 보냈어요. 답변을 기다리고 있어요."
                  : undefined
      }
      onSend={ended ? undefined : send}
      onHandoff={
        ended || ownerWillReview
          ? undefined
          : async () => {
              await requestCustomerHandoff(inquiryId, inquiryToken);
              setOwnerRequested(true);
              setWaitingAfter(null);
            }
      }
      onUpload={!ended && photoConsent ? photoUploader.upload : undefined}
      onCancelUpload={
        photoConsent && photoCancel ? photoUploader.cancel : undefined
      }
    />
  );
}
