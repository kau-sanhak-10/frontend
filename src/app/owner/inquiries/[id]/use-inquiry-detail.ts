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
  const refresh = useCallback(
    async (reusePhotoUrls = false) => {
      const id = ++requestId.current;
      const res = await loadInquiryDetail(source, inquiryId);
      if (id === requestId.current && res.ok) {
        setLoadedAt(Date.now());
        setResult((previous) => {
          if (!reusePhotoUrls || !previous?.ok) return res;
          return {
            ...res,
            data: {
              ...res.data,
              photos: res.data.photos.map((photo) => {
                const old = previous.data.photos.find((p) => p.id === photo.id);
                // 주기적 조회마다 같은 원본을 다시 다운로드하지 않습니다.
                return old?.url &&
                  old.expiresAt &&
                  old.expiresAt > Date.now() + 10_000
                  ? { ...photo, url: old.url, expiresAt: old.expiresAt }
                  : photo;
              }),
            },
          };
        });
      }
    },
    [source, inquiryId],
  );

  useEffect(() => {
    // 화면에 들어오면 한 번 불러옵니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  const hasDetail = result?.ok === true;
  useEffect(() => {
    if (source.kind !== "live" || !hasDetail) return;
    let pending = false;
    let stopped = false;
    const recheck = async () => {
      if (stopped || pending || document.hidden) return;
      pending = true;
      try {
        await refresh(true);
      } catch {
        // 잠깐 조회에 실패해도 지금 보이는 대화·사진은 유지합니다.
      } finally {
        pending = false;
      }
    };
    // ponytail: 서버 변경 알림이 생기기 전까지 보이는 화면만 5초마다 조회합니다.
    const timer = window.setInterval(() => void recheck(), 5000);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [hasDetail, refresh, source.kind]);

  return { result, loadedAt, reload: load, refresh };
}
