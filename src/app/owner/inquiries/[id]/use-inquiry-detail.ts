"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadInquiryDetail,
  type InquirySource,
} from "@/lib/owner-inquiries/source";
import type { InquiryDetail, LoadResult } from "@/lib/owner-inquiries/types";

/** 접수 상세·대화 화면이 함께 쓰는 상세 조회. null이면 불러오는 중입니다. */
export function useInquiryDetail(source: InquirySource, inquiryId: string) {
  const [result, setResult] = useState<LoadResult<InquiryDetail> | null>(null);
  // '오늘·어제' 기준 시각. 불러온 시점으로 고정합니다.
  const [loadedAt, setLoadedAt] = useState(0);
  // 늦게 도착한 이전 조회 결과가 최신 결과를 덮지 않게 합니다.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setResult(null);
    const res = await loadInquiryDetail(source, inquiryId);
    if (id === requestId.current) {
      setLoadedAt(Date.now());
      setResult(res);
    }
  }, [source, inquiryId]);

  /**
   * 화면을 비우지 않고 조용히 다시 불러옵니다. (만료된 사진 주소를 새로 받을 때)
   * 실패하면 지금 보이는 내용을 그대로 둡니다.
   */
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    const res = await loadInquiryDetail(source, inquiryId);
    if (id === requestId.current && res.ok) {
      setLoadedAt(Date.now());
      setResult(res);
    }
  }, [source, inquiryId]);

  useEffect(() => {
    // 화면에 들어오면 한 번 불러옵니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  return { result, loadedAt, reload: load, refresh };
}
