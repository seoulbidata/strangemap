"use client";

import { useState } from "react";
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
}

type TabId = "search" | "culture" | "night" | "ai" | "course" | "now" | "route";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "search", label: "검색", icon: <SearchIcon /> },
  { id: "culture", label: "문화행사", icon: <CalendarIcon /> },
  { id: "night", label: "야경명소", icon: <MoonIcon /> },
  { id: "ai", label: "AI 추천", icon: <AIIcon /> },
  { id: "course", label: "테마코스", icon: <RouteIcon /> },
  { id: "now", label: "지금추천", icon: <ClockIcon /> },
  { id: "route", label: "길찾기", icon: <NavIcon /> },
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
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId | null>(null);

  const toggle = (id: TabId) => setActiveTab((prev) => (prev === id ? null : id));

  const xpPct = Math.min(100, Math.round((playerXp / playerXpToNext) * 100));

  return (
    <div className="absolute left-0 top-0 bottom-0 z-20 flex pointer-events-none">
      {/* 아이콘 스트립 */}
      <div className="w-[72px] bg-white border-r border-[#FDECC8] flex flex-col shadow-sm pointer-events-auto">
        {/* 로고 */}
        <div className="h-16 flex items-center justify-center border-b border-[#FDECC8] shrink-0">
          <div className="text-center">
            <div className="text-[13px] font-display font-bold text-[#FE9C00] leading-none tracking-widest">SM</div>
            <div className="text-[8px] text-[#A8A29E] mt-0.5 leading-none">지도</div>
          </div>
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
                    ? "bg-[#FE9C00] text-white shadow-md"
                    : "text-[#A8A29E] hover:bg-[#FFF8E7] hover:text-[#FE9C00]"
                }`}
              >
                <span className="w-5 h-5">{tab.icon}</span>
                <span className="text-[10px] font-medium leading-none truncate w-full text-center px-1">
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
            <SearchRoadPanel onRouteFound={onRouteFound} onRouteClear={onRouteClear} />
          )}
        </div>
      )}
    </div>
  );
}

/* ---- 아이콘 SVG ---- */
function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-full h-full">
      <circle cx="9" cy="9" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 13l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-full h-full">
      <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 3v2M13 3v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-full h-full">
      <path d="M15 13.5A6.5 6.5 0 016.5 5 6.5 6.5 0 1015 13.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function AIIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-full h-full">
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 3v2M10 15v2M3 10h2M15 10h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 5.5l1.5 1.5M13 13l1.5 1.5M5.5 14.5l1.5-1.5M13 7l1.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-full h-full">
      <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5" cy="15" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 5h3a2 2 0 012 2v1M7 15h3a2 2 0 002-2v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-full h-full">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-full h-full">
      <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="15" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 5h3a3 3 0 013 3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13 13l2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
