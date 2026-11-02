"use client";

import { useRef, useState } from "react";
import SettingsForm from "../settings/settings-form";
import {
  workCategories,
  type SettingsData,
  type WorkCategory,
} from "@/lib/owner-settings";

const example: SettingsData = {
  business: {
    businessName: "한빛 보일러 (예시)",
    contactPhone: null,
    address: "경기 고양시 덕양구 (예시 출발지)",
    lat: 37.65,
    lng: 126.83,
    customerNotice: "사진과 증상을 남겨주시면 확인해 드려요.",
    serviceDescription: "보일러 점검·수리·교체",
  },
  booking: {
    businessHours: Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i + 1,
      isClosed: i > 4,
      openTime: i < 5 ? "09:00" : null,
      closeTime: i < 5 ? "18:00" : null,
    })),
    lunchStart: "12:00",
    lunchEnd: "13:00",
    maxDailyVisits: null,
    bufferMinutes: 15,
    travelMode: "CAR",
    autoBookingEnabled: false,
  },
  workTypes: (Object.keys(workCategories) as WorkCategory[]).map(
    (workCategory) => ({
      workCategory,
      isActive: workCategory !== "LEAK",
      durationMinutes: 60,
      autoBookingAllowed:
        workCategory === "INSPECTION" || workCategory === "REPAIR",
    }),
  ),
  serviceAreas: [{ regionCode: "41281", regionName: "경기 고양시 덕양구" }],
  intakePaused: false,
};

export default function SettingsPreview() {
  const saved = useRef(example);
  const [failNext, setFailNext] = useState(false);
  return (
    <>
      <div
        style={{
          maxWidth: 430,
          margin: "0 auto",
          padding: "12px 20px 0",
          fontSize: 13,
        }}
      >
        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            minHeight: 44,
          }}
        >
          <input
            type="checkbox"
            checked={failNext}
            onChange={(e) => setFailNext(e.target.checked)}
          />
          다음 저장 실패 테스트
        </label>
      </div>
      <SettingsForm
        preview
        initialData={example}
        onSave={async (section, draft) => {
          await new Promise((resolve) => setTimeout(resolve, 300));
          if (failNext) {
            setFailNext(false);
            throw new Error(
              "저장하지 못했어요. 입력한 내용은 유지돼요. 다시 저장해 주세요.",
            );
          }
          const previous = saved.current;
          saved.current =
            section === "business"
              ? { ...previous, business: draft.business }
              : section === "regions"
                ? { ...previous, serviceAreas: draft.serviceAreas }
                : section === "hours"
                  ? {
                      ...previous,
                      booking: {
                        ...draft.booking,
                        autoBookingEnabled: previous.booking.autoBookingEnabled,
                      },
                    }
                  : section === "work"
                    ? { ...previous, workTypes: draft.workTypes }
                    : {
                        ...previous,
                        intakePaused: draft.intakePaused,
                        booking: {
                          ...previous.booking,
                          autoBookingEnabled: draft.booking.autoBookingEnabled,
                        },
                      };
          return saved.current;
        }}
      />
    </>
  );
}
