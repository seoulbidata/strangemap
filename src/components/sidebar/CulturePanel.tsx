"use client";

import { useState, useMemo } from "react";
import type { POIItem } from "@/app/api/poi/route";
import { CULTURE_CATEGORIES, type CultureCategory } from "@/lib/cultureCategories";

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
      });
  }, [pois, activeCategory, showFreeOnly]);

  const allCategories: Array<CultureCategory | "전체"> = ["전체", ...CULTURE_CATEGORIES];

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-4 border-b border-[#E5E1D8]">
        <h2 className="text-base font-bold text-[#1A1E2E]">문화행사</h2>
        <p className="text-xs text-[#9CA3AF] mt-0.5">서울시 실시간 문화행사 정보</p>
      </div>

      {/* 카테고리 필터 */}
      <div className="px-4 py-3 border-b border-[#E5E1D8] space-y-2.5">
        <div className="flex gap-1.5 flex-wrap">
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-[#2563EB] text-white"
                  : "bg-[#F5F2EC] text-[#6B7280] hover:bg-[#E5E1D8]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            onClick={() => setShowFreeOnly((v) => !v)}
            className={`w-8 h-4 rounded-full transition-colors relative ${showFreeOnly ? "bg-[#16A34A]" : "bg-[#D1CEC7]"}`}
          >
            <span
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${showFreeOnly ? "left-4" : "left-0.5"}`}
            />
          </div>
          <span className="text-[11px] text-[#6B7280]">무료 행사만</span>
        </label>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto thin-scroll">
        {culturePOIs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-[#9CA3AF]">
            해당 조건의 행사가 없습니다
          </div>
        ) : (
          <div className="py-2">
            <p className="text-[10px] text-[#9CA3AF] px-4 py-2">{culturePOIs.length}개 행사</p>
            {culturePOIs.map((poi) => (
              <button
                key={poi.id}
                onClick={() => onSelectPOI(poi)}
                className="w-full text-left border-b border-[#F0EDE8] last:border-0 hover:bg-[#F5F2EC] transition-colors"
              >
                {poi.thumbnail && (
                  <div className="h-[132px] overflow-hidden">
                    <img src={poi.thumbnail} alt={poi.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB]">
                        {poi.normalizedCategory ?? poi.category}
                      </span>
                      <p className="text-sm font-semibold text-[#1A1E2E] mt-1.5 leading-snug line-clamp-2">{poi.name}</p>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 mt-5 ${
                        poi.fee === "무료" || !poi.fee
                          ? "bg-[#F0FDF4] text-[#16A34A]"
                          : "bg-[#FFF7ED] text-[#EA580C]"
                      }`}
                    >
                      {poi.fee || "무료"}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-[#9CA3AF] space-y-0.5">
                    <p>{poi.place}</p>
                    {poi.date && <p>{poi.date}</p>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}