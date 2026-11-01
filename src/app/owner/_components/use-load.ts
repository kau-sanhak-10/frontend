"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LoadResult } from "@/lib/owner-inquiries/types";

/**
 * 화면에 들어오면 한 번 불러오고, '다시 시도'로 다시 부를 수 있게 합니다.
 * result가 null이면 불러오는 중입니다.
 */
export function useLoad<T>(fetcher: () => Promise<LoadResult<T>>) {
  const [result, setResult] = useState<LoadResult<T> | null>(null);
  // '오늘·어제' 기준 시각. 불러온 시점으로 고정합니다.
  const [loadedAt, setLoadedAt] = useState(0);
  // 늦게 도착한 이전 조회 결과가 최신 결과를 덮지 않게 합니다.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setResult(null);
    const res = await fetcher();
    if (id === requestId.current) {
      setLoadedAt(Date.now());
      setResult(res);
    }
  }, [fetcher]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  return { result, loadedAt, reload: load };
}
