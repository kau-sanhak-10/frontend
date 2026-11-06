"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchInquiryDetail } from "@/lib/owner-inquiries/mock-api";
import type { InquiryDetail, LoadResult } from "@/lib/owner-inquiries/types";

/** 접수 상세·대화 화면이 함께 쓰는 상세 조회. null이면 불러오는 중입니다. */
export function useInquiryDetail(businessId: string, inquiryId: string) {
  const [result, setResult] = useState<LoadResult<InquiryDetail> | null>(null);
  // '오늘·어제' 기준 시각. 불러온 시점으로 고정합니다.
  const [loadedAt, setLoadedAt] = useState(0);
  // 늦게 도착한 이전 조회 결과가 최신 결과를 덮지 않게 합니다.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setResult(null);
    const res = await fetchInquiryDetail(businessId, inquiryId);
    if (id === requestId.current) {
      setLoadedAt(Date.now());
      setResult(res);
    }
  }, [businessId, inquiryId]);

  useEffect(() => {
    // 화면에 들어오면 한 번 불러옵니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  return { result, loadedAt, reload: load };
}
