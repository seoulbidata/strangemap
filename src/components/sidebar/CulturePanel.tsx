"use client";

import { useState, useMemo } from "react";
import type { POIItem } from "@/app/api/poi/route";
import { CULTURE_CATEGORIES, type CultureCategory } from "@/lib/cultureCategories";
import { FeedShell, FeedHeader, FilterPills, FeedCard, HeroChip } from "./_feedKit";

interface Props {
  pois: POIItem[];
  onSelectPOI: (poi: POIItem) => void;
}

export default function CulturePanel({ pois, onSelectPOI }: Props) {
  const [activeCategory, setActiveCategory] = useState<CultureCategory | "전체">("전체");
  const [showFreeOnly, setShowFreeOnly] = useState(false);

  const culturePOIs = useMemo(() => {
    return pois
      .filter((p) => p.source === "culture")
      .filter((p) => activeCategory === "전체" || p.normalizedCategory === activeCategory)
      .filter((p) => {
        if (showFreeOnly) return p.fee === "무료" || p.fee === "" || !p.fee;
        return true;
      })
      .sort((a, b) => {
        if (!a.endDate && !b.endDate) return 0;
        if (!a.endDate) return 1;
        if (!b.endDate) return -1;
        return a.endDate.localeCompare(b.endDate);
      });
  }, [pois, activeCategory, showFreeOnly]);

  const allCategories: Array<CultureCategory | "전체"> = ["전체", ...CULTURE_CATEGORIES];

  return (
    <FeedShell>
      <FeedHeader title="문화행사" subtitle="서울시 실시간 문화행사 정보" />

      {/* 카테고리 필터 */}
      <div className="px-5 pb-3 md:pt-0 pt-5 space-y-3">
        <FilterPills options={allCategories} value={activeCategory} onChange={setActiveCategory} />
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            onClick={() => setShowFreeOnly((v) => !v)}
            className={`w-8 h-4 rounded-full transition-colors relative ${showFreeOnly ? "bg-[#16A34A]" : "bg-[#D1CEC7]"}`}
          >
            <span
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${showFreeOnly ? "left-4" : "left-0.5"}`}
            />
          </div>
          <span className="text-[12px] text-[#8B8678]">무료 행사만</span>
        </label>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pt-2 pb-4">
        {culturePOIs.length === 0 ? (
          <p className="text-[13px] text-[#A8A398] text-center mt-16 leading-relaxed">
            해당 조건의 행사가 없습니다
          </p>
        ) : (
          <>
            <p className="text-[11px] text-[#A8A398] pb-3">{culturePOIs.length}개 행사</p>
            <div className="space-y-5">
              {culturePOIs.map((poi) => {
                const isFree = poi.fee === "무료" || !poi.fee;
                return (
                  <FeedCard key={poi.id} onClick={() => onSelectPOI(poi)}>
                    {/* 히어로 (썸네일 있을 때만) */}
                    {poi.thumbnail && (
                      <div className="relative h-44 bg-center bg-cover overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={poi.thumbnail} alt={poi.name} className="w-full h-full object-cover" />
                        <div className="absolute top-3.5 left-3.5">
                          <HeroChip>{poi.normalizedCategory ?? poi.category}</HeroChip>
                        </div>
                        {isFree && (
                          <div className="absolute top-3.5 right-3.5">
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#16A34A] text-white">
                              무료
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 본문 */}
                    <div className="px-5 pt-4 pb-5">
                      {/* 썸네일이 없으면 카테고리/무료 배지를 본문 상단에 */}
                      {!poi.thumbnail && (
                        <div className="flex items-center gap-1.5 mb-2">
                          <HeroChip>{poi.normalizedCategory ?? poi.category}</HeroChip>
                          {isFree && (
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#16A34A] text-white">
                              무료
                            </span>
                          )}
                        </div>
                      )}
                      <h3 className="text-[18px] font-semibold leading-snug tracking-[-0.01em] line-clamp-2 text-[#16243C] group-hover:text-[#1E2F4D] transition-colors duration-150">
                        {poi.name}
                      </h3>
                      <div className="mt-2 text-[13px] text-[#9A958A] space-y-0.5">
                        <p className="line-clamp-1">{poi.place}</p>
                        {poi.date && <p className="line-clamp-1">{poi.date}</p>}
                      </div>
                    </div>
                  </FeedCard>
                );
              })}
            </div>
          </>
        )}
      </div>
    </FeedShell>
  );
}
