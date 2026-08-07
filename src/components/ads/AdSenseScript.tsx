"use client";

import Script from "next/script";
import type { POIItem } from "@/app/api/poi/route";
import type { MobileTabId } from "@/components/mobile/MobileNavigation";
import { AD_CLIENT } from "./adsense";

/**
 * 애드센스 로더를 "광고가 실제로 들어가는 피드가 채워졌을 때"만 내려받는다.
 *
 * 예전엔 layout.tsx의 <head>에 무조건 박혀 있었는데, 그러면 로딩 스플래시·웰컴 모달·
 * 지도만 있는 화면·404에도 광고 코드가 남는다. 애드센스는 이걸 "게시자 콘텐츠가 없는
 * 화면에 게재된 광고"로 보고 정책 위반으로 잡는다. (2026-08 심사 반려 사유)
 *
 * 그래서 판정 근거를 아예 없앤다 — 콘텐츠가 없는 화면엔 스크립트 자체가 가지 않는다.
 * 소유권 확인은 layout.tsx의 google-adsense-account 메타와 public/ads.txt가 계속 담당하므로
 * 여기서 스크립트를 빼도 심사에는 지장이 없다.
 */

/** 인피드 광고를 렌더하는 탭 → 그 탭이 그리는 POI source. AdFeedCard를 쓰는 패널과 짝이 맞아야 한다. */
const AD_TAB_SOURCE: Partial<Record<MobileTabId, POIItem["source"]>> = {
  culture: "culture",
  spot: "spot",
};

interface Props {
  activeTab: MobileTabId | null;
  pois: POIItem[];
}

export default function AdSenseScript({ activeTab, pois }: Props) {
  const source = activeTab ? AD_TAB_SOURCE[activeTab] : undefined;
  // 탭만 열리고 목록이 아직 비어 있으면(로딩·실패) 그것도 "콘텐츠 없는 화면"이다.
  if (!source || !pois.some((p) => p.source === source)) return null;

  return (
    <Script
      id="adsbygoogle-loader"
      strategy="afterInteractive"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`}
      crossOrigin="anonymous"
    />
  );
}
