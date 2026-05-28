"use client";

import { useEffect, useState, useMemo } from "react";
import type { POIItem } from "@/app/api/poi/route";

interface Props {
  pois: POIItem[];
  onSelectPOI: (poi: POIItem) => void;
}

type FilterType = "all" | "culture" | "nightview";

const RECOMMENDATION_CACHE_KEY = "seoulro-search-recommendations-v1";
const RECOMMENDATION_CACHE_MS = 60 * 60 * 1000;

interface RecommendationCache {
  bucket: number;
  cultureIds: string[];
  nightviewIds: string[];
}

function pickRandomPOIs(items: POIItem[], count: number): POIItem[] {
  return [...items]
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
}

function readRecommendationCache(bucket: number): RecommendationCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RECOMMENDATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecommendationCache>;
    if (
      parsed.bucket !== bucket ||
      !Array.isArray(parsed.cultureIds) ||
      !Array.isArray(parsed.nightviewIds)
    ) {
      return null;
    }
    return {
      bucket,
      cultureIds: parsed.cultureIds.filter((id): id is string => typeof id === "string"),
      nightviewIds: parsed.nightviewIds.filter((id): id is string => typeof id === "string"),
    };
  } catch {
    return null;
  }
}

function writeRecommendationCache(cache: RecommendationCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECOMMENDATION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage can be unavailable in private modes; the in-memory result still works.
  }
}

function resolveCachedPOIs(ids: string[], source: POIItem["source"], pois: POIItem[]): POIItem[] {
  const byId = new Map(pois.map((poi) => [poi.id, poi]));
  return ids
    .map((id) => byId.get(id))
    .filter((poi): poi is POIItem => !!poi && poi.source === source)
    .slice(0, 3);
}

export default function SearchPanel({ pois, onSelectPOI }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [recommendationBucket, setRecommendationBucket] = useState(() =>
    Math.floor(Date.now() / RECOMMENDATION_CACHE_MS)
  );

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

  const recommendations = useMemo(() => {
    const culturePool = pois.filter((p) => p.source === "culture");
    const nightviewPool = pois.filter((p) => p.source === "nightview");
    const cached = readRecommendationCache(recommendationBucket);

    if (cached) {
      const culture = resolveCachedPOIs(cached.cultureIds, "culture", pois);
      const nightview = resolveCachedPOIs(cached.nightviewIds, "nightview", pois);
      if (
        culture.length === Math.min(3, culturePool.length) &&
        nightview.length === Math.min(3, nightviewPool.length)
      ) {
        return { culture, nightview };
      }
    }

    const culture = pickRandomPOIs(culturePool, 3);
    const nightview = pickRandomPOIs(nightviewPool, 3);
    writeRecommendationCache({
      bucket: recommendationBucket,
      cultureIds: culture.map((poi) => poi.id),
      nightviewIds: nightview.map((poi) => poi.id),
    });

    return { culture, nightview };
  }, [pois, recommendationBucket]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRecommendationBucket(Math.floor(Date.now() / RECOMMENDATION_CACHE_MS));
    }, 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

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
          <div className="py-3">
            <div className="px-4 pb-2">
              <p className="text-sm font-bold text-[#1A1E2E]">서울로의 추천</p>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">지금 둘러볼 만한 문화행사와 야경명소</p>
            </div>

            <RecommendationSection
              title="문화행사"
              countLabel="3개 추천"
              items={recommendations.culture}
              emptyLabel="추천할 문화행사가 없습니다"
              onSelectPOI={onSelectPOI}
            />

            <RecommendationSection
              title="야경명소"
              countLabel="3곳 추천"
              items={recommendations.nightview}
              emptyLabel="추천할 야경명소가 없습니다"
              onSelectPOI={onSelectPOI}
            />
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
              <SearchResultRow key={poi.id} poi={poi} onSelect={() => onSelectPOI(poi)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationSection({
  title,
  countLabel,
  items,
  emptyLabel,
  onSelectPOI,
}: {
  title: string;
  countLabel: string;
  items: POIItem[];
  emptyLabel: string;
  onSelectPOI: (poi: POIItem) => void;
}) {
  return (
    <section className="border-t border-[#F0EDE8]">
      <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
        <h3 className="text-[12px] font-bold text-[#1B3A6B]">{title}</h3>
        <span className="text-[10px] text-[#A8A29E]">{countLabel}</span>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-3 text-[11px] text-[#9CA3AF]">{emptyLabel}</div>
      ) : (
        items.map((poi) => (
          <RecommendationCard key={poi.id} poi={poi} onSelect={() => onSelectPOI(poi)} />
        ))
      )}
    </section>
  );
}

function RecommendationCard({ poi, onSelect }: { poi: POIItem; onSelect: () => void }) {
  const isNightview = poi.source === "nightview";

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left border-b border-[#F0EDE8] last:border-0 transition-colors ${
        isNightview ? "hover:bg-[#FFFBEB]" : "hover:bg-[#F5F2EC]"
      }`}
    >
      <div className="h-[128px] max-md:h-[104px] overflow-hidden relative bg-[#F5F2EC]">
        {poi.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poi.thumbnail} alt={poi.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#0F1F3D] to-[#1B3A6B] flex flex-col items-center justify-center">
            <span className="text-[10px] text-white/60 text-center px-4 leading-tight">{poi.name}</span>
          </div>
        )}
        {isNightview && <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />}
        <span
          className={`absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm ${
            isNightview ? "bg-black/40 text-white/85" : "bg-white/90 text-[#2563EB]"
          }`}
        >
          {isNightview ? poi.category : poi.normalizedCategory ?? poi.category}
        </span>
      </div>

      <div className="px-4 py-2.5 max-md:py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm max-md:text-[13px] font-semibold text-[#1A1E2E] leading-snug line-clamp-2">{poi.name}</p>
            <p className="text-[11px] text-[#9CA3AF] mt-1 truncate">{poi.place}</p>
            {poi.date && <p className="text-[10px] text-[#A8A29E] mt-0.5 truncate">{poi.date}</p>}
          </div>
          {(poi.fee === "무료" || (!poi.fee && !isNightview)) && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 bg-[#F0FDF4] text-[#16A34A]">
              무료
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function SearchResultRow({ poi, onSelect }: { poi: POIItem; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#F5F2EC] transition-colors text-left border-b border-[#F0EDE8] last:border-0"
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0 mt-2"
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
    <div className="px-4 pt-5 pb-4 border-b border-[#E5E1D8] md:block hidden">
      <h2 className="text-base font-bold text-[#1A1E2E]">{title}</h2>
      <p className="text-xs text-[#9CA3AF] mt-0.5">{subtitle}</p>
    </div>
  );
}
