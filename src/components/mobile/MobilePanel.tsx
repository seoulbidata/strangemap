"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { POIItem } from "@/app/api/poi/route";
import type { ThemeCourse } from "@/data/themeCourses";
import CulturePanel from "@/components/sidebar/CulturePanel";
import SeoulSpotPanel from "@/components/sidebar/SeoulSpotPanel";
import NowRecommendPanel from "@/components/sidebar/NowRecommendPanel";
import SearchPanel from "@/components/sidebar/SearchPanel";
import SearchRoadPanel, { type RouteDrawPayload, type RouteSearchCache } from "@/components/sidebar/SearchRoadPanel";
import CourseCollection from "@/components/sidebar/CourseCollection";
import type { MobileTabId } from "@/components/mobile/MobileNavigation";
import { useLocale } from "@/i18n/LocaleContext";

interface Props {
  activeTab: MobileTabId | null;
  pois: POIItem[];
  onClose: () => void;
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
}

/** "half"는 첫 진입 자동 오픈 전용 정지점 — 드래그 스냅 후보에는 넣지 않는다. */
type SnapState = "closed" | "half" | "medium" | "max";

export default function MobilePanel({
  activeTab,
  pois,
  onClose,
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
}: Props) {
  const { t } = useLocale();
  const [lastActiveTab, setLastActiveTab] = useState<MobileTabId | null>(null);
  const [snap, setSnap] = useState<SnapState>("closed");
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startTouchY = useRef(0);
  const startTranslateY = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const isInitialOpen = useRef(true);

  // Track viewport height on mobile browsers to handle dynamic address bars
  useEffect(() => {
    if (typeof window === "undefined") return;
    setViewportHeight(window.innerHeight);
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keep track of the last active tab to prevent contents from vanishing during slide-down animation
  useEffect(() => {
    if (activeTab) {
      setLastActiveTab(activeTab);
      // 첫 진입은 탭이 이미 열린 채로 마운트된다(사용자가 누른 게 아니다).
      // 그때만 낮게 열어 지도를 덜 가리고, 이후 사용자가 직접 연 탭은 평소대로 medium.
      setSnap(isInitialOpen.current ? "half" : "medium");
    } else {
      setSnap("closed");
    }
    isInitialOpen.current = false;
  }, [activeTab]);

  const displayTab = activeTab || lastActiveTab;

  // Calculate pixel translation based on snap state
  const getSnapTranslation = useCallback((state: SnapState) => {
    const H = viewportHeight;
    const maxH = H * 0.88; // Maximum height
    
    if (state === "closed") return maxH;
    if (state === "max") return 0;
    if (state === "half") return maxH - H * 0.45;

    // medium state height
    const mediumH = displayTab === "search" ? H * 0.50 : H * 0.70;
    return maxH - mediumH;
  }, [displayTab, viewportHeight]);

  if (!displayTab) return null;

  // Touch Event Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    // If the touch target is a button or inside a button (like the close icon), do not drag.
    if ((e.target as HTMLElement).closest("button")) {
      return;
    }
    const touch = e.touches[0];
    startTouchY.current = touch.clientY;
    startTranslateY.current = getSnapTranslation(snap);
    setIsDragging(true);
    setDragY(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - startTouchY.current;
    
    const newTranslate = startTranslateY.current + deltaY;
    const maxH = viewportHeight * 0.88;
    
    // Constrain drag between 0 (max snap) and maxH (closed snap)
    const constrained = Math.max(0, Math.min(newTranslate, maxH));
    setDragY(constrained - startTranslateY.current);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const currentTranslate = startTranslateY.current + dragY;
    
    // Snap to the closest point
    const snapPoints: SnapState[] = ["closed", "medium", "max"];
    let closestSnap: SnapState = "medium";
    let minDistance = Infinity;
    
    for (const point of snapPoints) {
      const dist = Math.abs(currentTranslate - getSnapTranslation(point));
      if (dist < minDistance) {
        minDistance = dist;
        closestSnap = point;
      }
    }
    
    setDragY(0);
    setSnap(closestSnap);
    
    if (closestSnap === "closed") {
      onClose();
    }
  };

  const currentTranslation = getSnapTranslation(snap) + (isDragging ? dragY : 0);
  const isPointerEventsActive = snap !== "closed";

  const getTitle = () => {
    switch (displayTab) {
      case "search":
        return t("mobile.title.search");
      case "route":
        return t("mobile.title.route");
      case "culture":
        return t("mobile.title.culture");
      case "spot":
        return t("mobile.title.spot");
      case "course":
        return t("mobile.title.course");
      case "now":
        return t("mobile.title.now");
      default:
        return "";
    }
  };

  return (
    <div
      className={`fixed left-0 right-0 bottom-0 z-30 rounded-t-[32px] border-t border-[#FDECC8] bg-white shadow-[0_-10px_30px_rgba(0,0,0,0.12)] md:hidden flex flex-col ${
        isPointerEventsActive ? "pointer-events-auto" : "pointer-events-none"
      }`}
      style={{
        height: `${viewportHeight * 0.88}px`,
        transform: `translateY(${currentTranslation}px)`,
        transition: isDragging ? "none" : "transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}
    >
      {/* 바텀시트 헤더 - 터치 드래그 바인딩 */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative pt-2 pb-3 border-b border-[#F5F2EC] flex flex-col items-center shrink-0 bg-white cursor-grab active:cursor-grabbing select-none touch-none rounded-t-[32px]"
      >
        <div className="h-1.5 w-12 rounded-full bg-[#E5E1D8] mb-2" />
        <span className="text-sm font-bold text-[#1B3A6B]">
          {getTitle()}
        </span>
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-7 h-7 rounded-full bg-[#F5F2EC] hover:bg-[#E5E1D8] text-[#6B7280] flex items-center justify-center text-xs transition-colors"
          aria-label={t("common.close")}
        >
          ✕
        </button>
      </div>

      {/* 바텀시트 콘텐츠 */}
      <div className="flex-1 overflow-hidden pb-[76px]">
        {displayTab === "search" && <SearchPanel pois={pois} onSelectPOI={onSelectPOI} />}
        {displayTab === "route" && routeCacheRef && (
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
        {displayTab === "culture" && <CulturePanel pois={pois} onSelectPOI={onSelectPOI} />}
        {displayTab === "spot" && <SeoulSpotPanel pois={pois} onSelectPOI={onSelectPOI} />}
        {displayTab === "course" && (
          <CourseCollection
            onOpenCourse={onOpenCourse}
            activeCourseId={activeCourseId}
          />
        )}
        {displayTab === "now" && <NowRecommendPanel onSelectPOI={onSelectPOI} />}
      </div>
    </div>
  );
}
