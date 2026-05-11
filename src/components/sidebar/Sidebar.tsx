"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { POIItem } from "@/app/api/poi/route";
import type { ThemeCourse } from "@/data/themeCourses";
import SearchPanel from "./SearchPanel";
import CulturePanel from "./CulturePanel";
import NightviewPanel from "./NightviewPanel";
import AIQuestPanel from "./AIQuestPanel";
import ThemeCoursePanel from "./ThemeCoursePanel";
import NowRecommendPanel from "./NowRecommendPanel";
import SearchRoadPanel, { type RouteDrawPayload } from "./SearchRoadPanel";

interface Props {
  pois: POIItem[];
  onSelectPOI: (poi: POIItem) => void;
  onSelectCourse: (course: ThemeCourse) => void;
  activeCourseId: string | null;
  playerLevel: number;
  playerXp: number;
  playerXpToNext: number;
  onRouteFound?: (payload: RouteDrawPayload) => void;
  onRouteClear?: () => void;
  presetDest?: { label: string; lat: number; lng: number } | null;
  presetOrigin?: { label: string; lat: number; lng: number } | null;
}

type TabId = "search" | "culture" | "night" | "ai" | "course" | "now" | "route";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "search", label: "검색", icon: "/sidebaricons/search.png" },
  { id: "route", label: "길찾기", icon: "/sidebaricons/route.png" },
  { id: "culture", label: "문화행사", icon: "/sidebaricons/culture.png" },
  { id: "night", label: "야경명소", icon: "/sidebaricons/night.png" },
  { id: "ai", label: "AI 추천", icon: "/sidebaricons/ai.png" },
  { id: "course", label: "테마코스", icon: "/sidebaricons/course.png" },
  { id: "now", label: "혼잡도", icon: "/sidebaricons/now.png" },
];

export default function Sidebar({
  pois,
  onSelectPOI,
  onSelectCourse,
  activeCourseId,
  playerLevel,
  playerXp,
  playerXpToNext,
  onRouteFound,
  onRouteClear,
  presetDest,
  presetOrigin,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId | null>(null);

  const toggle = (id: TabId) => setActiveTab((prev) => (prev === id ? null : id));

  useEffect(() => {
    if (presetDest || presetOrigin) setActiveTab("route");
  }, [presetDest, presetOrigin]);

  const xpPct = Math.min(100, Math.round((playerXp / playerXpToNext) * 100));

  return (
    <div className="fixed left-0 top-0 bottom-0 z-20 flex pointer-events-none overflow-x-hidden">
      {/* 아이콘 스트립 */}
      <div className="w-[72px] bg-white border-r border-[#FDECC8] flex flex-col shadow-sm pointer-events-auto">
        {/* 로고 */}
        <div className="h-16 flex items-center justify-center border-b border-[#FDECC8] shrink-0">
          <Image src="/icons/logo.png" alt="서울로" width={48} height={48} className="rounded-lg" />
        </div>

        {/* 탭 버튼 */}
        <div className="flex-1 flex flex-col items-center py-3 gap-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => toggle(tab.id)}
                title={tab.label}
                className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                  isActive
                    ? "bg-[#FE9C00] shadow-md"
                    : "hover:bg-[#FFF8E7]"
                }`}
              >
                <Image src={tab.icon} alt={tab.label} width={28} height={28} className="object-contain" />
                <span className="text-[10px] font-medium leading-none truncate w-full text-center px-1 text-[#2F4F4F]">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* 플레이어 레벨 (하단) */}
        <div className="shrink-0 border-t border-[#FDECC8] py-3 flex flex-col items-center gap-1.5">
          <div className="w-10 h-10 rounded-xl bg-[#FE9C00] flex items-center justify-center">
            <div className="text-center">
              <div className="text-[7px] font-display text-white/70 leading-none">Lv</div>
              <div className="text-sm font-display font-bold text-white leading-tight">{playerLevel}</div>
            </div>
          </div>
          {/* XP 바 */}
          <div className="w-10 h-1.5 bg-[#FDECC8] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${xpPct}%`, background: "linear-gradient(to right, #FE9C00, #D97706)" }}
            />
          </div>
          <span className="text-[8px] font-display text-[#A8A29E]">{playerXp}XP</span>
        </div>
      </div>

      {/* 패널 */}
      {activeTab && (
        <div className="w-80 bg-white border-r border-[#FDECC8] flex flex-col shadow-lg pointer-events-auto animate-slide-in overflow-hidden">
          {activeTab === "search" && (
            <SearchPanel pois={pois} onSelectPOI={onSelectPOI} />
          )}
          {activeTab === "culture" && (
            <CulturePanel pois={pois} onSelectPOI={onSelectPOI} />
          )}
          {activeTab === "night" && (
            <NightviewPanel pois={pois} onSelectPOI={onSelectPOI} />
          )}
          {activeTab === "ai" && <AIQuestPanel />}
          {activeTab === "course" && (
            <ThemeCoursePanel onSelectCourse={onSelectCourse} activeCourseId={activeCourseId} />
          )}
          {activeTab === "now" && (
            <NowRecommendPanel onSelectPOI={onSelectPOI} />
          )}
          {activeTab === "route" && (
            <SearchRoadPanel onRouteFound={onRouteFound} onRouteClear={onRouteClear} presetDest={presetDest} presetOrigin={presetOrigin} />
          )}
        </div>
      )}
    </div>
  );
}

