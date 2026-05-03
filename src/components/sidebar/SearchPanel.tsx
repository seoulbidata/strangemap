"use client";

import { useState, useMemo } from "react";
import type { POIItem } from "@/app/api/poi/route";

interface Props {
  pois: POIItem[];
  onSelectPOI: (poi: POIItem) => void;
}

type FilterType = "all" | "culture" | "nightview";

export default function SearchPanel({ pois, onSelectPOI }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return pois
      .filter((p) => {
        const matchesText = p.name.toLowerCase().includes(q) || p.place.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
        const matchesFilter = filter === "all" || p.source === filter;
        return matchesText && matchesFilter;
      })
      .slice(0, 20);
  }, [query, filter, pois]);

  const FILTERS: { id: FilterType; label: string }[] = [
    { id: "all", label: "전체" },
    { id: "culture", label: "문화행사" },
    { id: "nightview", label: "야경명소" },
  ];

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="검색" subtitle="장소, 행사, 명소를 찾아보세요" />

      <div className="px-4 py-3 border-b border-[#E5E1D8] space-y-2.5">
        {/* 검색 입력 */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="장소명 또는 카테고리 검색"
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-[#FDECC8] bg-[#FFFBF0] text-[#1A1E2E] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#FE9C00] transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]"
            >
              ✕
            </button>
          )}
        </div>

        {/* 필터 칩 */}
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                filter === f.id
                  ? "bg-[#FE9C00] text-white"
                  : "bg-[#FFF8E7] text-[#78716C] hover:bg-[#FDECC8]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 결과 목록 */}
      <div className="flex-1 overflow-y-auto thin-scroll">
        {!query.trim() && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 text-[#9CA3AF]">
            <SearchIcon className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">검색어를 입력하세요</p>
            <p className="text-xs mt-1">장소명, 행사명, 카테고리로 검색 가능합니다</p>
          </div>
        )}

        {query.trim() && results.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 text-[#9CA3AF]">
            <p className="text-sm">검색 결과가 없습니다</p>
            <p className="text-xs mt-1">다른 검색어를 시도해 보세요</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="py-2">
            <p className="text-[10px] text-[#9CA3AF] px-4 py-2">검색 결과 {results.length}개</p>
            {results.map((poi) => (
              <button
                key={poi.id}
                onClick={() => onSelectPOI(poi)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#F5F2EC] transition-colors text-left border-b border-[#F0EDE8] last:border-0"
              >
                <span
                  className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 mt-2"
                  style={{ background: poi.source === "nightview" ? "#D97706" : "#2563EB" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1A1E2E] truncate">{poi.name}</p>
                  <p className="text-[11px] text-[#9CA3AF] mt-0.5 truncate">{poi.category} · {poi.place}</p>
                </div>
                <span className="text-[10px] text-[#9CA3AF] shrink-0 mt-0.5">
                  {poi.source === "nightview" ? "야경" : "문화"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-4 pt-5 pb-4 border-b border-[#E5E1D8]">
      <h2 className="text-base font-bold text-[#1A1E2E]">{title}</h2>
      <p className="text-xs text-[#9CA3AF] mt-0.5">{subtitle}</p>
    </div>
  );
}
