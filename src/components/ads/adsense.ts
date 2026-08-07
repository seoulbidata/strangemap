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

/** fluid(인피드) 광고가 요구하는 최소 실폭. 이보다 좁으면 애드센스가 요청을 거부한다. */
const MIN_FLUID_WIDTH = 250;

/**
 * <ins>가 "실제로 폭을 가진 뒤에" 애드센스에 광고 요청을 넣고, ins에 붙일 ref를 돌려준다.
 *
 * 폭을 재는 이유 — 사이드바(데스크톱)와 바텀시트(모바일)는 서로를 display:none으로 가릴 뿐
 * 둘 다 React 트리에 마운트된다. 숨은 쪽 사본에서 그냥 push하면 폭이 0이라
 * "Fluid responsive ads must be at least 250px wide: availableWidth=0" 에러가 나고 요청도 낭비된다.
 * 바텀시트가 열리며 폭이 생기는 경우도 있어서 ResizeObserver로 기다린다.
 *
 * push는 <ins> 하나당 정확히 한 번만 — 두 번 넣으면 애드센스가 에러를 낸다.
 */
export function useAdSensePush() {
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    const el = insRef.current;
    if (!el || pushed.current) return;

    const observer = new ResizeObserver(() => tryPush());

    function tryPush() {
      if (pushed.current || !el) return;
      if (el.getBoundingClientRect().width < MIN_FLUID_WIDTH) return;

      pushed.current = true;
      observer.disconnect();
      try {
        const w = window as typeof window & { adsbygoogle?: unknown[] };
        (w.adsbygoogle = w.adsbygoogle || []).push({});
      } catch {
        // 애드블록 등으로 로더가 없으면 조용히 넘어간다.
      }
    }

    observer.observe(el);
    tryPush();

    return () => observer.disconnect();
  }, []);

  return insRef;
}
