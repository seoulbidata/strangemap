"use client";

import { useState, useEffect, useCallback } from "react";
import type { POIItem } from "@/app/api/poi/route";
import { SEOUL_PLACES, CATEGORIES, isPlaceOpen, type CategoryFilter } from "@/lib/seoulPlaces";
import type { CongestionData } from "@/app/api/places/congestion/route";
import { FeedShell, FilterPills } from "./_feedKit";

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

// 서울시 API는 인원을 min~max 범위로 주므로 최대값을 대표값으로 사용한다.
// max가 비어있으면(0) min을, 둘 다 없으면 0을 반환.
function estimatePpltn(c: CongestionData): number {
  return c.ppltnMax || c.ppltnMin || 0;
}

function formatPpltn(n: number): string {
  if (n >= 10000) {
    const man = n / 10000;
    return `예상인원 약 ${Number.isInteger(man) ? `${man}만` : `${man.toFixed(1)}만`}명`;
  }
  return `예상인원 약 ${n.toLocaleString("ko-KR")}명`;
}

function UsersIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-[#A8A398]">
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19c0-2.4-1-4-2.5-4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
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
    <FeedShell>
      {/* 헤더 */}
      <div className="px-6 pt-7 pb-5 md:block hidden">
        <h2 className="text-[22px] font-bold text-[#16243C] leading-tight tracking-[-0.01em]">실시간 혼잡도</h2>
        <div className="flex items-center justify-between mt-1">
          <p className="text-[13px] text-[#8B8678]">
            {loading
              ? "실시간 데이터 로딩 중..."
              : error
              ? "데이터 로드 실패 · 새로고침 해주세요"
              : `${visiblePlaces.length}곳 운영중 · ${uncrowdedCount}곳 여유`}
          </p>
          <div className="flex items-center gap-1.5 text-[12px] text-[#16243C] font-semibold">
            <span
              className={`w-1.5 h-1.5 rounded-full inline-block ${
                loading ? "bg-[#D97706] animate-pulse" : "bg-[#16A34A] animate-pulse"
              }`}
            />
            {timeStr}
          </div>
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className="px-5 pb-3 md:pt-0 pt-5">
        <FilterPills options={CATEGORIES} value={category} onChange={setCategory} />
      </div>

      {/* 정렬 / 업데이트 시각 */}
      <div className="px-5 pb-2 flex items-center justify-between">
        <p className="text-[11px] text-[#A8A398]">
          {updatedStr ? `${updatedStr} 기준 실시간 혼잡도` : "서울시 실시간 도시데이터"}
        </p>
        <div className="flex gap-1">
          {(["여유순", "혼잡순"] as SortOrder[]).map((s) => (
            <button
              key={s}
              onClick={() => setSortOrder(s)}
              className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-colors ${
                sortOrder === s ? "bg-[#16243C] text-white" : "text-[#8B8678] hover:bg-[#F1EFEA]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pt-2 pb-4">
        {loading ? (
          <div className="space-y-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-[22px] bg-white p-5 space-y-2.5 animate-pulse shadow-[0_6px_24px_rgba(20,30,50,0.07)]">
                <div className="flex items-center gap-2">
                  <div className="h-3.5 bg-[#F0EDE8] rounded w-1/3" />
                  <div className="h-4 bg-[#F0EDE8] rounded-full w-14" />
                </div>
                <div className="h-2.5 bg-[#F0EDE8] rounded w-4/5" />
                <div className="h-2.5 bg-[#F0EDE8] rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : sortedPlaces.length === 0 ? (
          <div className="py-16 text-center space-y-1">
            <p className="text-[14px] text-[#7C7870] font-medium">현재 운영 중인 장소가 없습니다</p>
            <p className="text-[12px] text-[#A8A398]">다른 카테고리를 선택하거나 잠시 후 다시 확인하세요</p>
          </div>
        ) : (
          <div className="space-y-5">
            {sortedPlaces.map((place, i) => {
              const cData = congestionMap[place.areaName];
              const level = cData?.level;
              const cStyle = level ? LEVEL_STYLE[level] : null;
              const ppltn = cData ? estimatePpltn(cData) : 0;
              const ppltnText = ppltn > 0 ? formatPpltn(ppltn) : null;
              return (
                <div
                  key={place.areaName}
                  className="group relative rounded-[22px] bg-white overflow-hidden transition-all duration-200 hover:-translate-y-0.5 shadow-[0_6px_24px_rgba(20,30,50,0.07)] hover:shadow-[0_14px_40px_rgba(20,30,50,0.14)]"
                >
                  <button
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
                    className="w-full text-left block px-5 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[18px] font-semibold text-[#16243C] leading-snug tracking-[-0.01em] truncate group-hover:text-[#1E2F4D] transition-colors">
                        {place.displayName}
                      </p>
                      {cStyle && level ? (
                        <span
                          className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: cStyle.bg, color: cStyle.text }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: cStyle.text }} />
                          {LEVEL_LABEL[level]}
                        </span>
                      ) : (
                        !loading && (
                          <span className="shrink-0 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-[#F4F2EC] text-[#A8A398]">
                            정보없음
                          </span>
                        )
                      )}
                    </div>
                    <p className="text-[13px] text-[#9A958A] mt-1">
                      {place.category} · {place.place}
                    </p>
                    <p className="text-[13.5px] text-[#5C5950] mt-2.5 leading-[1.6]">{place.description}</p>
                    {ppltnText && (
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#F4F2EC] px-3 py-1.5">
                        <UsersIcon />
                        <span className="text-[12px] font-semibold text-[#5C5950]">{ppltnText}</span>
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 새로고침 */}
      <div className="px-5 pt-3 pb-5 bg-gradient-to-t from-[#FBFAF7] via-[#FBFAF7] to-transparent">
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing || loading}
          className="w-full py-3 rounded-2xl bg-white border border-[#ECE8E0] text-[13px] font-semibold text-[#5C5950] hover:border-[#D6D1C7] transition-colors disabled:opacity-50"
        >
          {refreshing ? "업데이트 중..." : "새로고침"}
        </button>
      </div>
    </FeedShell>
  );
}
