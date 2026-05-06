"use client";

import { useState, useEffect, useCallback } from "react";
import type { POIItem } from "@/app/api/poi/route";
import { SEOUL_PLACES, CATEGORIES, isPlaceOpen, type CategoryFilter } from "@/lib/seoulPlaces";
import type { CongestionData } from "@/app/api/places/congestion/route";

interface Props {
  onSelectPOI: (poi: POIItem) => void;
}

type SortOrder = "여유순" | "혼잡순";
type CongestLevel = CongestionData["level"];

// API: 여유/보통/약간 붐빔/붐빔 → 표시: 여유/보통/혼잡/매우 혼잡
const LEVEL_LABEL: Record<CongestLevel, string> = {
  여유: "여유",
  보통: "보통",
  "약간 붐빔": "혼잡",
  붐빔: "매우 혼잡",
};

const LEVEL_STYLE: Record<CongestLevel, { bg: string; text: string; border: string }> = {
  여유: { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
  보통: { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  "약간 붐빔": { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  붐빔: { bg: "#FFF1F2", text: "#DC2626", border: "#FECDD3" },
};

const LEVEL_ORDER: Record<CongestLevel, number> = { 여유: 0, 보통: 1, "약간 붐빔": 2, 붐빔: 3 };

function formatPpltn(min: number): string {
  if (min >= 10000) {
    const man = min / 10000;
    return `예상인원: ${Number.isInteger(man) ? `${man}만` : `${man.toFixed(1)}만`}명`;
  }
  return `예상인원: ${min.toLocaleString("ko-KR")}명`;
}

export default function NowRecommendPanel({ onSelectPOI }: Props) {
  const [now, setNow] = useState(new Date());
  const [category, setCategory] = useState<CategoryFilter>("전체");
  const [sortOrder, setSortOrder] = useState<SortOrder>("여유순");
  const [congestionMap, setCongestionMap] = useState<Record<string, CongestionData>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(false);
    try {
      const res = await fetch("/api/places/congestion");
      if (!res.ok) throw new Error("fetch failed");
      const data: Record<string, CongestionData> = await res.json();
      setCongestionMap(data);
      setLastUpdated(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(() => fetchData(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const hour = now.getHours();
  const timeStr = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

  const visiblePlaces = SEOUL_PLACES.filter((p) => {
    if (!isPlaceOpen(p, hour)) return false;
    if (category !== "전체" && p.category !== category) return false;
    return true;
  });

  const sortedPlaces = [...visiblePlaces].sort((a, b) => {
    const la = congestionMap[a.areaName];
    const lb = congestionMap[b.areaName];
    const oa = la ? LEVEL_ORDER[la.level] : 1;
    const ob = lb ? LEVEL_ORDER[lb.level] : 1;
    return sortOrder === "여유순" ? oa - ob : ob - oa;
  });

  const uncrowdedCount = visiblePlaces.filter((p) => {
    const c = congestionMap[p.areaName];
    return c && (c.level === "여유" || c.level === "보통");
  }).length;

  const updatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-4 border-b border-[#E5E1D8]">
        <h2 className="text-base font-bold text-[#1A1E2E]">지금 추천</h2>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-[#9CA3AF]">
            {loading
              ? "실시간 데이터 로딩 중..."
              : error
              ? "데이터 로드 실패 · 새로고침 해주세요"
              : `${visiblePlaces.length}곳 운영중 · ${uncrowdedCount}곳 여유`}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-[#1B3A6B] font-semibold">
            <span
              className={`w-1.5 h-1.5 rounded-full inline-block ${
                loading ? "bg-[#D97706] animate-pulse" : "bg-[#16A34A] animate-pulse"
              }`}
            />
            {timeStr}
          </div>
        </div>
      </div>

      {/* 카테고리 탭 */}
      <div className="px-4 py-3 border-b border-[#E5E1D8]">
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                category === c
                  ? "bg-[#1B3A6B] text-white"
                  : "bg-[#F5F2EC] text-[#6B7280] hover:bg-[#E5E1D8]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* 정렬 / 업데이트 시각 */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-[#E5E1D8]">
        <p className="text-[10px] text-[#9CA3AF]">
          {updatedStr ? `${updatedStr} 기준 실시간 혼잡도` : "서울시 실시간 도시데이터"}
        </p>
        <div className="flex gap-1">
          {(["여유순", "혼잡순"] as SortOrder[]).map((s) => (
            <button
              key={s}
              onClick={() => setSortOrder(s)}
              className={`text-[10px] px-2.5 py-1 rounded-md font-medium transition-colors ${
                sortOrder === s ? "bg-[#1B3A6B] text-white" : "text-[#6B7280] hover:bg-[#F5F2EC]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto thin-scroll py-3">
        {loading ? (
          <div className="px-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl border border-[#E5E1D8] p-4 space-y-2 animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="h-3 bg-[#F0EDE8] rounded w-1/3" />
                  <div className="h-4 bg-[#F0EDE8] rounded w-12" />
                </div>
                <div className="h-2.5 bg-[#F0EDE8] rounded w-4/5" />
                <div className="h-2.5 bg-[#F0EDE8] rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : sortedPlaces.length === 0 ? (
          <div className="px-4 py-10 text-center space-y-1">
            <p className="text-sm text-[#6B7280] font-medium">현재 운영 중인 장소가 없습니다</p>
            <p className="text-[11px] text-[#9CA3AF]">다른 카테고리를 선택하거나 잠시 후 다시 확인하세요</p>
          </div>
        ) : (
          <div className="px-4 space-y-2.5">
            {sortedPlaces.map((place, i) => {
              const cData = congestionMap[place.areaName];
              const level = cData?.level;
              const cStyle = level ? LEVEL_STYLE[level] : null;
              const ppltnText = cData && cData.ppltnMin > 0 ? formatPpltn(cData.ppltnMin) : null;
              return (
                <button
                  key={place.areaName}
                  onClick={() =>
                    onSelectPOI({
                      id: `congestion_${i}`,
                      name: place.displayName,
                      category: place.category,
                      source: "nightview",
                      lat: place.lat,
                      lng: place.lng,
                      place: place.place,
                      fee: "",
                    })
                  }
                  className="w-full text-left rounded-xl border border-[#E5E1D8] bg-white hover:border-[#1B3A6B] hover:shadow-sm transition-all p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[#1A1E2E]">{place.displayName}</p>
                        {cStyle && level ? (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded border font-medium"
                            style={{
                              background: cStyle.bg,
                              color: cStyle.text,
                              borderColor: cStyle.border,
                            }}
                          >
                            {LEVEL_LABEL[level]}
                          </span>
                        ) : (
                          !loading && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-[#F5F5F5] text-[#9CA3AF] border-[#E5E5E5]">
                              정보없음
                            </span>
                          )
                        )}
                      </div>
                      <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                        {place.category} · {place.place}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#6B7280] mt-2 leading-relaxed">{place.description}</p>
                  {ppltnText && (
                    <p className="text-[10px] text-[#2563EB] mt-1.5 font-medium">{ppltnText}</p>
                  )}
                  {cData?.message && (
                    <p className="text-[10px] text-[#9CA3AF] mt-1 leading-relaxed line-clamp-2">
                      {cData.message}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 새로고침 */}
      <div className="px-4 py-3 border-t border-[#E5E1D8]">
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing || loading}
          className="w-full py-2 rounded-lg border border-[#E5E1D8] text-xs text-[#6B7280] hover:bg-[#F5F2EC] transition-colors disabled:opacity-50"
        >
          {refreshing ? "업데이트 중..." : "새로고침"}
        </button>
      </div>
    </div>
  );
}
