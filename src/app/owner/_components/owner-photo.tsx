"use client";

import { createContext, useContext, useState, type MouseEvent } from "react";
import type { InquiryPhoto } from "@/lib/owner-inquiries/types";
import styles from "./owner-inquiries.module.css";

/**
 * 만료된 사진 주소를 새로 받는 방법. 접수 상세·대화 화면이 넣어 줍니다.
 * 실제 서버의 사진 주소는 5분 뒤 만료됩니다. (BE-06)
 */
export const PhotoRefreshContext = createContext<(() => void) | null>(null);

/** 만료 10초 전부터는 만료된 것으로 봅니다. */
function isExpired(photo: InquiryPhoto) {
  return (
    photo.expiresAt !== undefined && Date.now() >= photo.expiresAt - 10_000
  );
}

/** 원본은 브라우저 새 탭에서 확대한다. 사진 하나의 실패가 대화·요약을 가리지 않는다. */
export function OwnerPhoto({ photo }: { photo?: InquiryPhoto }) {
  const [failed, setFailed] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const refresh = useContext(PhotoRefreshContext);

  function renew() {
    if (!refresh) return false;
    setRenewing(true);
    refresh();
    return true;
  }
  if (!photo?.url) {
    return <span className={styles.photoThumb}>사진 없음</span>;
  }
  // 서버 응답에 잘못된 스킴이 섞여도 링크로 실행하지 않는다.
  let url: URL;
  try {
    url = new URL(photo.url, "https://illo.invalid");
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error("Invalid photo URL");
    }
  } catch {
    return <span className={styles.photoThumb}>사진 주소 오류</span>;
  }
  return (
    <span className={styles.photoItem}>
      {failed ? (
        <span className={styles.photoFailure} role="status">
          사진을 불러오지 못했어요.
          <button
            type="button"
            onClick={() => {
              // 주소가 만료됐으면 새 주소를 받고, 아니면 같은 주소로 다시 불러옵니다.
              if (!(photo.expiresAt !== undefined && renew())) setFailed(false);
            }}
          >
            다시 시도
          </button>
        </span>
      ) : (
        <a
          href={photo.url}
          target="_blank"
          rel="noreferrer"
          className={styles.photoLink}
          aria-label={`${photo.alt} 원본 보기 (새 탭)`}
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            // 만료된 주소로 새 탭을 열지 않고, 새 주소를 먼저 받습니다.
            if (isExpired(photo) && renew()) event.preventDefault();
          }}
        >
          {/* 저장소의 서버 발급 URL·로컬 예시를 사용한다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.photoThumb}
            src={photo.url}
            alt={photo.alt}
            onError={() => {
              // 만료로 못 불러왔으면 한 번은 조용히 새 주소를 받습니다.
              if (!(isExpired(photo) && !renewing && renew())) setFailed(true);
            }}
          />
          <span>{renewing ? "사진 주소를 새로 받는 중…" : "원본 보기"}</span>
        </a>
      )}
    </span>
  );
}
