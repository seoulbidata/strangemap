"use client";

import { useState } from "react";
import Image from "next/image";
import type { MobileTabId } from "@/components/mobile/MobileNavigation";
import { CULTURE_CATEGORIES, CATEGORY_COLOR, type CultureCategory } from "@/lib/cultureCategories";
import LanguageToggle from "@/components/LanguageToggle";
import { useLocale } from "@/i18n/LocaleContext";
import { categoryLabel } from "@/i18n/enums";

interface Props {
  showNight: boolean;
  activeCultureCategory: CultureCategory | null;
  locationStatus: "idle" | "requesting" | "granted" | "denied" | "unavailable" | "error";
  onOpenTab: (tab: MobileTabId) => void;
  onToggleNight: () => void;
  onSelectCultureCategory: (cat: CultureCategory | null) => void;
  onRequestLocation: () => void;
}

export default function MobileMapControls({
  showNight,
  activeCultureCategory,
  locationStatus,
  onOpenTab,
  onToggleNight,
  onSelectCultureCategory,
  onRequestLocation,
}: Props) {
  const { t, locale } = useLocale();
  const [isCultureOpen, setIsCultureOpen] = useState(false);
  const isLocationGranted = locationStatus === "granted";
  const isLocationRequesting = locationStatus === "requesting";

  // Handle main culture pill click
  const handleMainCultureClick = () => {
    const nextIsCultureOpen = !isCultureOpen;
    setIsCultureOpen(nextIsCultureOpen);
    
    // If we are closing the accordion, clear the active category (so markers disappear)
    if (!nextIsCultureOpen) {
      onSelectCultureCategory(null);
    }
  };

  // Handle category chip click
  const handleCategoryClick = (cat: CultureCategory) => {
    onSelectCultureCategory(activeCultureCategory === cat ? null : cat);
  };

  // Main button dynamic styles based on selected category color
  const activeColor = activeCultureCategory ? CATEGORY_COLOR[activeCultureCategory].active : "#7C3AED";
  const mainBtnStyle = activeCultureCategory
    ? {
        backgroundColor: activeColor,
        borderColor: activeColor,
        color: "#ffffff",
      }
    : isCultureOpen
    ? {
        backgroundColor: "#7C3AED",
        borderColor: "#6D28D9",
        color: "#ffffff",
      }
    : {
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        borderColor: "#FDECC8",
        color: "#4B5563",
      };

  const spanBg = activeCultureCategory || isCultureOpen ? "#ffffff" : "#7C3AED";

  return (
    <>
      {/* 1. 상단 컨트롤 패널 (검색 바 + 필터 알약 버튼들) */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-30 px-4 md:hidden flex flex-col gap-2">
        
        {/* 검색창 및 길찾기 버튼 그룹 */}
        <div className="flex gap-2 w-full items-center">
          {/* 검색창 */}
          <button
            onClick={() => onOpenTab("search")}
            className="pointer-events-auto flex-1 h-14 rounded-full bg-white/95 border border-[#FDECC8] shadow-[0_4px_20px_rgba(0,0,0,0.08)] px-4 flex items-center gap-3 active:scale-[0.98] transition-transform backdrop-blur-md"
          >
            <Image src="/icons/logo.png" alt="Seoulro" width={28} height={28} className="rounded-lg shrink-0" priority />
            <span className="min-w-0 flex-1 text-left text-base font-semibold text-[#6B7280]">
              {t("mobile.searchBar")}
            </span>
            <svg className="w-5 h-5 text-[#FE9C00] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          {/* 길찾기 버튼 */}
          <button
            onClick={() => onOpenTab("route")}
            className="pointer-events-auto w-14 h-14 shrink-0 rounded-full bg-white/95 border border-[#FDECC8] shadow-[0_4px_20px_rgba(0,0,0,0.08)] flex items-center justify-center active:scale-[0.98] transition-transform backdrop-blur-md"
            title={t("sidebar.tab.route")}
            aria-label={t("mobile.routeOpen")}
          >
            <Image
              src="/sidebaricons/route.png"
              alt={t("sidebar.tab.route")}
              width={24}
              height={24}
              className="object-contain"
            />
          </button>

          {/* 언어 전환 (모바일 컴팩트) */}
          <LanguageToggle size="sm" />
        </div>

        {/* 필터 알약 버튼 (네이버 레퍼런스 스타일) */}
        <div className="pointer-events-auto flex flex-col gap-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {/* 문화행사 메인 알약 */}
            <button
              onClick={handleMainCultureClick}
              style={mainBtnStyle}
              className="shrink-0 h-9 rounded-full px-4 text-xs font-bold border shadow-md transition-all flex items-center gap-1.5"
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                style={{ background: spanBg }}
              />
              {activeCultureCategory
                ? t("mobile.culturePrefix", { cat: categoryLabel(activeCultureCategory, locale) })
                : t("sidebar.tab.culture")}
              <span className={`text-[8px] transition-transform duration-200 ${isCultureOpen ? "rotate-180" : ""}`}>
                ▼
              </span>
            </button>

            {/* 야경명소 메인 알약 */}
            <button
              onClick={onToggleNight}
              className={`shrink-0 h-9 rounded-full px-4 text-xs font-bold border shadow-md transition-all flex items-center gap-1.5 ${
                showNight
                  ? "bg-[#FE9C00] border-[#D97706] text-white"
                  : "bg-white/95 border-[#FDECC8] text-[#4B5563]"
              }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                style={{ background: showNight ? "#fff" : "#FE9C00" }}
              />
              {t("sidebar.tab.night")}
            </button>
          </div>

          {/* 아코디언 형태로 열리는 문화행사 카테고리 선택기 */}
          {isCultureOpen && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar animate-fade-down">
              {CULTURE_CATEGORIES.map((cat) => {
                const color = CATEGORY_COLOR[cat];
                const isActive = activeCultureCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => handleCategoryClick(cat)}
                    className="shrink-0 h-8 rounded-full px-3 text-[11px] font-bold border shadow-sm transition-all"
                    style={{
                      background: isActive ? color.active : "rgba(255,255,255,0.95)",
                      color: isActive ? "#fff" : color.text,
                      borderColor: isActive ? color.active : "#FDECC8",
                    }}
                  >
                    {categoryLabel(cat, locale)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. 우측 플로팅 컨트롤러 (내 위치만 남김) */}
      <div className="pointer-events-none fixed right-4 bottom-24 z-10 flex flex-col gap-2.5 md:hidden">
        {/* 내 위치 버튼 */}
        <button
          onClick={onRequestLocation}
          disabled={isLocationRequesting}
          className={`pointer-events-auto w-12 h-12 rounded-full border shadow-lg flex items-center justify-center active:scale-95 transition-all disabled:opacity-75 ${
            isLocationGranted
              ? "bg-[#DC2626] border-[#B91C1C] text-white"
              : "bg-white/95 border-[#FDECC8] text-[#4B5563]"
          } ${isLocationRequesting ? "animate-pulse bg-red-100 border-[#DC2626] text-[#DC2626]" : ""}`}
          title={t("mobile.myLocation")}
          aria-label={t("mobile.myLocation")}
        >
          <svg className={`w-6 h-6 ${isLocationRequesting ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m9-9h-2M5 12H3m14 0a5 5 0 11-10 0 5 5 0 0110 0z" />
          </svg>
        </button>
      </div>
    </>
  );
}
