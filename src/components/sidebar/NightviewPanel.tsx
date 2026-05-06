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
  if (area === "한강변") return /한강|여의도|반포|뚝섬|잠실|이촌|망원|선유도|세빛|성산|동작대교|한강대교|성수대교/.test(place);
  if (area === "도심") return /광화문|종로|명동|청계|을지로|시청|남산|중구/.test(place);
  return true;
};

function PlaceholderImage({ name }: { name: string }) {
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#0F1F3D] to-[#1B3A6B] flex flex-col items-center justify-center gap-1">
      <span className="text-2xl">🌃</span>
      <span className="text-[10px] text-white/50 text-center px-2 leading-tight">{name}</span>
    </div>
  );
}

export default function NightviewPanel({ pois, onSelectPOI }: Props) {
  const [activeArea, setActiveArea] = useState("전체");

  const nightPOIs = useMemo(() => {
    return pois
      .filter((p) => p.source === "nightview")
      .filter((p) => areaMatch(p, activeArea));
  }, [pois, activeArea]);

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-4 border-b border-[#E5E1D8]">
        <h2 className="text-base font-bold text-[#1A1E2E]">야경명소</h2>
        <p className="text-xs text-[#9CA3AF] mt-0.5">
          서울 대표 야경 포인트 {pois.filter((p) => p.source === "nightview").length}곳
        </p>
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
              <NightviewCard key={poi.id} poi={poi} onSelect={() => onSelectPOI(poi)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NightviewCard({ poi, onSelect }: { poi: POIItem; onSelect: () => void }) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      onClick={onSelect}
      className="w-full text-left border-b border-[#F0EDE8] last:border-0 hover:bg-[#FFFBEB] transition-colors"
    >
      {/* 이미지 */}
      <div className="h-[164px] overflow-hidden relative bg-[#0F1F3D]">
        {poi.thumbnail && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poi.thumbnail}
            alt={poi.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <PlaceholderImage name={poi.name} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-white/80 backdrop-blur-sm">
          {poi.category}
        </span>
      </div>

      {/* 텍스트 */}
      <div className="px-4 py-2.5">
        <p className="text-sm font-semibold text-[#1A1E2E]">{poi.name}</p>
        <p className="text-[11px] text-[#9CA3AF] mt-0.5 truncate">{poi.place}</p>
      </div>
    </button>
  );
}