"use client";

import { useState } from "react";
import type { InquiryPhoto } from "@/lib/owner-inquiries/types";
import styles from "./owner-inquiries.module.css";

/** 원본은 브라우저 새 탭에서 확대한다. 사진 하나의 실패가 대화·요약을 가리지 않는다. */
export function OwnerPhoto({ photo }: { photo?: InquiryPhoto }) {
  const [failed, setFailed] = useState(false);
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
          <button type="button" onClick={() => setFailed(false)}>
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
        >
          {/* 저장소의 서버 발급 URL·로컬 예시를 사용한다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.photoThumb}
            src={photo.url}
            alt={photo.alt}
            onError={() => setFailed(true)}
          />
          <span>원본 보기</span>
        </a>
      )}
    </span>
  );
}
