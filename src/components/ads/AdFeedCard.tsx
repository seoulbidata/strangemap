"use client";

import { useLocale } from "@/i18n/LocaleContext";
import { AD_CLIENT, IN_FEED_SLOT, IN_FEED_LAYOUT_KEY, useAdSensePush } from "./adsense";

/**
 * 사이드바 피드 안에 끼워 넣는 인피드(네이티브) 광고 카드.
 * 껍데기는 _feedKit의 FeedCard와 같은 라운드·그림자를 쓰되,
 * 우리가 만든 콘텐츠가 아니므로 hover 인터랙션은 빼고 "광고" 라벨을 항상 노출한다.
 * (라벨을 감추면 애드센스 기만적 배치 정책 위반이다.)
 *
 * 광고 내부(이미지 비율·글꼴·여백)는 iframe 안이라 CSS로 손댈 수 없고,
 * 애드센스 콘솔의 인피드 광고 단위 스타일 설정이 결정한다.
 */
export default function AdFeedCard() {
  const { t } = useLocale();
  useAdSensePush();

  return (
    <div className="relative rounded-[22px] bg-white overflow-hidden shadow-[0_6px_24px_rgba(20,30,50,0.07)]">
      <span className="absolute top-3.5 right-3.5 z-10 text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#F4F2EC] text-[#8B8678]">
        {t("common.ad")}
      </span>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={IN_FEED_SLOT}
        data-ad-format="fluid"
        data-ad-layout-key={IN_FEED_LAYOUT_KEY}
      />
    </div>
  );
}

/** 인피드 광고 단위가 아직 설정되지 않았으면 피드에 아무것도 끼우지 않는다. */
export const inFeedAdReady = Boolean(IN_FEED_SLOT && IN_FEED_LAYOUT_KEY);

/**
 * 피드 목록 몇 번째마다 광고를 끼울지.
 * 광고가 콘텐츠보다 많아 보이면 정책 위반이므로 넉넉하게 둔다.
 */
export const AD_EVERY = 6;
