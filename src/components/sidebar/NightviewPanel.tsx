"use client";

import { useState, useMemo } from "react";
import type { POIItem } from "@/app/api/poi/route";

interface Props {
  pois: POIItem[];
  onSelectPOI: (poi: POIItem) => void;
}

const AREA_FILTERS = ["전체", "강북", "강남", "한강변", "도심"];

const areaMatch = (poi: POIItem, area: string): boolean => {
  const place = poi.place + poi.name;
  if (area === "강북") return /노원|도봉|강북|성북|종로|중구|용산|은평|서대문|마포/.test(place);
  if (area === "강남") return /강남|서초|송파|강동|관악|동작|영등포|구로|금천/.test(place);
  if (area === "한강변") return /한강|여의도|반포|뚝섬|잠실|이촌|망원/.test(place);
  if (area === "도심") return /광화문|종로|명동|청계|을지로|시청|남산/.test(place);
  return true;
};

export default function NightviewPanel({ pois, onSelectPOI }: Props) {
  const [activeArea, setActiveArea] = useState("전체");

  const nightPOIs = useMemo(() => {
    return pois
      .filter((p) => p.source === "nightview")
      .filter((p) => areaMatch(p, activeArea));
  }, [pois, activeArea]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-4 border-b border-[#E5E1D8]">
        <h2 className="text-base font-bold text-[#1A1E2E]">야경명소</h2>
        <p className="text-xs text-[#9CA3AF] mt-0.5">서울 대표 야경 포인트 {pois.filter((p) => p.source === "nightview").length}곳</p>
      </div>

      {/* 지역 필터 */}
      <div className="px-4 py-3 border-b border-[#E5E1D8]">
        <div className="flex gap-1.5 flex-wrap">
          {AREA_FILTERS.map((area) => (
            <button
              key={area}
              onClick={() => setActiveArea(area)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                activeArea === area
                  ? "bg-[#D97706] text-white"
                  : "bg-[#F5F2EC] text-[#6B7280] hover:bg-[#E5E1D8]"
              }`}
            >
              {area}
            </button>
          ))}
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto thin-scroll">
        {nightPOIs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-[#9CA3AF]">
            해당 지역의 야경명소가 없습니다
          </div>
        ) : (
          <div className="py-2">
            <p className="text-[10px] text-[#9CA3AF] px-4 py-2">{nightPOIs.length}곳</p>
            {nightPOIs.map((poi) => (
              <button
                key={poi.id}
                onClick={() => onSelectPOI(poi)}
                className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-[#FFFBEB] transition-colors text-left border-b border-[#F0EDE8] last:border-0"
              >
                <div className="w-9 h-9 rounded-lg bg-[#FEF3C7] flex items-center justify-center shrink-0">
                  <span className="text-sm">★</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1A1E2E]">{poi.name}</p>
                  <p className="text-[11px] text-[#9CA3AF] mt-0.5">{poi.category}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-[#6B7280]">
                    <span>{poi.place}</span>
                    {poi.subway && <span>· {poi.subway}</span>}
                    {poi.operating_time && <span>· {poi.operating_time}</span>}
                  </div>
                </div>
                <span className={`text-[10px] shrink-0 mt-0.5 ${poi.fee === "무료" || !poi.fee ? "text-[#16A34A]" : "text-[#6B7280]"}`}>
                  {poi.fee || "무료"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
