"use client";

import { useEffect, useRef } from "react";

/** 애드센스 게시자 ID. 로더 스크립트는 layout.tsx의 <head>에서 불러온다. */
export const AD_CLIENT = "ca-pub-7327215771002130";

/**
 * 인피드(네이티브) 광고 단위.
 * AdSense 콘솔 > 광고 > 광고 단위 기준 > 인피드 광고에서 만든 뒤 두 값을 채운다.
 * 비워두면 AdFeedCard가 아무것도 렌더링하지 않으므로 안전하게 배포할 수 있다.
 */
export const IN_FEED_SLOT = "4900463689";
export const IN_FEED_LAYOUT_KEY = "-6w+ec+1u-6a+8b";

/**
 * <ins>가 마운트된 뒤 애드센스에 광고 요청을 넣는다.
 * 개발 모드의 이중 마운트에서 같은 <ins>에 두 번 push하면 애드센스가 에러를 내므로 한 번만 실행한다.
 */
export function useAdSensePush() {
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;

    try {
      const w = window as typeof window & { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      // 애드블록 등으로 로더가 없으면 조용히 넘어간다.
    }
  }, []);
}
