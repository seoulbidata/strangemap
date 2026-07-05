"use client";

import { useState } from "react";
import { useLocale } from "@/i18n/LocaleContext";

interface Props {
  /** 데스크톱 50px(기본) / 모바일 상단 행 40px */
  size?: "md" | "sm";
}

const ICON_SRC = "/icons/translation.png";

/**
 * 우상단 언어 전환 버튼. 클릭 시 ko ↔ en 토글.
 * 아이콘은 번역 이미지 하나(/icons/translation.png)를 언어와 무관하게 사용하고,
 * 파일이 없으면 전환될 대상 언어("EN"/"한") 텍스트로 폴백한다.
 */
export default function LanguageToggle({ size = "md" }: Props) {
  const { locale, setLocale, t } = useLocale();
  const [imgError, setImgError] = useState(false);

  const next = locale === "ko" ? "en" : "ko";
  const px = size === "md" ? 50 : 40;

  return (
    <button
      onClick={() => setLocale(next)}
      title={t("lang.toggleTo")}
      aria-label={t("lang.toggleTo")}
      style={{ width: px, height: px }}
      className="pointer-events-auto rounded-xl bg-white/95 border border-[#FDECC8] shadow-md hover:border-[#FE9C00] flex items-center justify-center overflow-hidden transition-all active:scale-95 backdrop-blur-md"
    >
      {imgError ? (
        <span className="text-[13px] font-bold text-[#16243C] leading-none">
          {next === "en" ? "EN" : "한"}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ICON_SRC}
          alt=""
          width={px - 16}
          height={px - 16}
          className="object-contain rounded"
          onError={() => setImgError(true)}
        />
      )}
    </button>
  );
}
