"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminResult } from "@/lib/admin/types";

/** 화면에 들어오면 한 번 불러오고, 다시 부를 수 있게 합니다. result가 null이면 불러오는 중 */
export function useAdminLoad<T>(fetcher: () => Promise<AdminResult<T>>) {
  const [result, setResult] = useState<AdminResult<T> | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setResult(null);
    const res = await fetcher();
    if (id === requestId.current) setResult(res);
  }, [fetcher]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  return { result, reload: load, setResult };
}
