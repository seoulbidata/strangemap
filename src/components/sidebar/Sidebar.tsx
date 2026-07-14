"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import type { POIItem } from "@/app/api/poi/route";
import type { ThemeCourse } from "@/data/themeCourses";
import SearchPanel from "./SearchPanel";
import CulturePanel from "./CulturePanel";
import SeoulSpotPanel from "./SeoulSpotPanel";
import CourseCollection from "./CourseCollection";
import NowRecommendPanel from "./NowRecommendPanel";
import SearchRoadPanel, { type RouteDrawPayload, type RouteSearchCache } from "./SearchRoadPanel";
import type { AIQuestCache } from "./AIQuestPanel";
import { useLocale } from "@/i18n/LocaleContext";
import type { UIKey } from "@/i18n/ui.ko";

interface Props {
  pois: POIItem[];
  onSelectPOI: (poi: POIItem) => void;
  onOpenCourse: (course: ThemeCourse) => void;
  activeCourseId: string | null;
  onRouteFound?: (payload: RouteDrawPayload) => void;
  onRouteClear?: () => void;
  presetDest?: { label: string; lat: number; lng: number } | null;
  presetOrigin?: { label: string; lat: number; lng: number } | null;
  onClearOrigin?: () => void;
  onClearDest?: () => void;
  routeCacheRef?: React.MutableRefObject<RouteSearchCache>;
  aiQuestCacheRef?: React.MutableRefObject<AIQuestCache>;
  activeTab: TabId | null;
  onActiveTabChange: (tab: TabId | null) => void;
}

type TabId = "search" | "culture" | "spot" | "course" | "now" | "route";

const TABS: { id: TabId; labelKey: UIKey; icon: string }[] = [
  { id: "search", labelKey: "sidebar.tab.search", icon: "/sidebaricons/search.png" },
  { id: "route", labelKey: "sidebar.tab.route", icon: "/sidebaricons/route.png" },
  { id: "course", labelKey: "sidebar.tab.course", icon: "/sidebaricons/course.png" },
  { id: "culture", labelKey: "sidebar.tab.culture", icon: "/sidebaricons/culture.png" },
  { id: "spot", labelKey: "sidebar.tab.spot", icon: "/sidebaricons/night.png" },
  { id: "now", labelKey: "sidebar.tab.now", icon: "/sidebaricons/now.png" },
];

export default function Sidebar({
  pois,
  onSelectPOI,
  onOpenCourse,
  activeCourseId,
  onRouteFound,
  onRouteClear,
  presetDest,
  presetOrigin,
  onClearOrigin,
  onClearDest,
  routeCacheRef,
  aiQuestCacheRef,
  activeTab,
  onActiveTabChange,
}: Props) {
  const { t } = useLocale();
  const toggle = (id: TabId) => onActiveTabChange(activeTab === id ? null : id);

  const prevPresetDest = useRef(presetDest);
  const prevPresetOrigin = useRef(presetOrigin);

  useEffect(() => {
    const destChanged = presetDest && presetDest !== prevPresetDest.current;
    const originChanged = presetOrigin && presetOrigin !== prevPresetOrigin.current;

    if (destChanged || originChanged) {
      onActiveTabChange("route");
    }

    prevPresetDest.current = presetDest;
    prevPresetOrigin.current = presetOrigin;
  }, [onActiveTabChange, presetDest, presetOrigin]);

  return (
    <div className="fixed left-0 top-0 bottom-0 z-20 flex pointer-events-none overflow-x-hidden">
      {/* 아이콘 스트립 */}
      <div className="w-[72px] bg-white border-r border-[#FDECC8] flex flex-col shadow-sm pointer-events-auto">
        {/* 로고 */}
        <div className="h-16 flex items-center justify-center border-b border-[#FDECC8] shrink-0">
          <Image src="/icons/logo.png" alt="서울로" width={48} height={48} className="rounded-lg" priority />
        </div>

        {/* 탭 버튼 */}
        <div className="flex-1 flex flex-col items-center py-3 gap-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const label = t(tab.labelKey);
            return (
              <button
                key={tab.id}
                onClick={() => toggle(tab.id)}
                title={label}
                className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                  isActive
                    ? "bg-[#FE9C00] shadow-md"
                    : "hover:bg-[#FFF8E7]"
                }`}
              >
                <Image src={tab.icon} alt={label} width={28} height={28} className="object-contain" />
                <span className="text-[10px] font-medium leading-tight line-clamp-2 w-full text-center px-0.5 text-[#2F4F4F]">
                  {label}
                </span>
              </button>
            );
          })}
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
          {activeTab === "spot" && (
            <SeoulSpotPanel pois={pois} onSelectPOI={onSelectPOI} />
          )}
          {activeTab === "course" && (
            <CourseCollection
              onOpenCourse={onOpenCourse}
              activeCourseId={activeCourseId}
              cacheRef={aiQuestCacheRef}
            />
          )}
          {activeTab === "now" && (
            <NowRecommendPanel onSelectPOI={onSelectPOI} />
          )}
          {activeTab === "route" && routeCacheRef && (
            <SearchRoadPanel
              onRouteFound={onRouteFound}
              onRouteClear={onRouteClear}
              presetDest={presetDest}
              presetOrigin={presetOrigin}
              onClearOrigin={onClearOrigin}
              onClearDest={onClearDest}
              routeCacheRef={routeCacheRef}
            />
          )}
        </div>
      )}
    </div>
  );
}
