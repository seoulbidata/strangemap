"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import type { POIItem } from "@/app/api/poi/route";
import { FeedShell } from "./_feedKit";

interface Props {
  pois: POIItem[];
  onSelectPOI: (poi: POIItem) => void;
}

type FilterType = "all" | "culture" | "nightview";

/* ───────────────────────── 시간 컨텍스트 ───────────────────────── */

type TimeBucket = "morning" | "day" | "dusk" | "night";

interface TimeContext {
  now: Date;
  bucket: TimeBucket;
  isWeekend: boolean;
}

function getTimeContext(now: Date): TimeContext {
  const hour = now.getHours();
  const day = now.getDay();
  let bucket: TimeBucket;
  if (hour >= 5 && hour < 11) bucket = "morning";
  else if (hour >= 11 && hour < 17) bucket = "day";
  else if (hour >= 17 && hour < 20) bucket = "dusk";
  else bucket = "night";
  return { now, bucket, isWeekend: day === 0 || day === 6 };
}

const BUCKET_HEADLINE: Record<TimeBucket, { title: string; subtitle: string }> = {
  morning: { title: "오늘 둘러볼 만한 곳", subtitle: "아침에 가볍게 다녀오기 좋은 장소" },
  day: { title: "지금 즐기는 전시·문화행사", subtitle: "한낮에 둘러보기 좋은 문화행사" },
  dusk: { title: "해질 무렵, 노을 명소", subtitle: "노을과 함께 보기 좋은 곳" },
  night: { title: "오늘 밤 가기 좋은 야경", subtitle: "밤에 빛나는 서울의 야경 명소" },
};

/* ───────────────────────── 운영시간 / 날짜 파싱 (best-effort) ───────────────────────── */

type OpenState = "open" | "closed" | "always" | "unknown";

function openNow(op: string | undefined, now: Date): OpenState {
  if (!op) return "unknown";
  if (/24시간|상시|연중무휴|운영\s*제한\s*없음|00:00\s*[-~]\s*24:00/.test(op)) return "always";
  const m = op.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (!m) return "unknown";
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = Number(m[1]) * 60 + Number(m[2]);
  let end = Number(m[3]) * 60 + Number(m[4]);
  if (end <= start) end += 24 * 60; // 자정 넘김
  let c = cur;
  if (c < start && end > 24 * 60) c += 24 * 60;
  return c >= start && c <= end ? "open" : "closed";
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function cultureRange(poi: POIItem): { start: string | null; end: string | null } {
  const found = [...(poi.date ?? "").matchAll(/(\d{4})-(\d{2})-(\d{2})/g)].map((mm) => mm[0]);
  const start = found[0] ?? null;
  const end = poi.endDate ?? found[found.length - 1] ?? null;
  return { start, end };
}

function isRunningToday(poi: POIItem, today: string): boolean {
  const { start, end } = cultureRange(poi);
  if (start && start > today) return false;
  if (end && end < today) return false;
  return Boolean(start || end);
}

function isEndingSoon(poi: POIItem, now: Date): boolean {
  const { end } = cultureRange(poi);
  if (!end) return false;
  const endDate = new Date(`${end}T23:59:59`);
  const diffDays = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 7;
}

/* ───────────────────────── 시간 적합도 점수 ───────────────────────── */

const SOURCE_WEIGHT: Record<TimeBucket, { nightview: number; culture: number }> = {
  morning: { nightview: 5, culture: 35 },
  day: { nightview: 10, culture: 45 },
  dusk: { nightview: 45, culture: 20 },
  night: { nightview: 60, culture: 5 },
};

function timeScore(poi: POIItem, ctx: TimeContext): number {
  const today = ymd(ctx.now);
  const isNight = poi.source === "nightview";
  let s = isNight ? SOURCE_WEIGHT[ctx.bucket].nightview : SOURCE_WEIGHT[ctx.bucket].culture;

  if (isNight) {
    const nc = poi.nightCategory;
    if (ctx.bucket === "night" || ctx.bucket === "dusk") {
      if (nc === "한강·다리" || nc === "전망대·산" || nc === "도심·거리") s += 15;
    } else if (nc === "고궁·역사" || nc === "공원·정원") {
      s += 12;
    }
  } else {
    if (isRunningToday(poi, today)) s += 20;
    if (isEndingSoon(poi, ctx.now)) s += 15;
    if (ctx.isWeekend) s += 10;
  }

  const op = openNow(poi.operating_time, ctx.now);
  if (op === "open") s += 10;
  else if (op === "always") s += 5;
  else if (op === "closed") s -= 15;

  if (poi.thumbnail) s += 5;
  if (poi.fee === "무료") s += 5;
  return s;
}

function reasonChips(poi: POIItem, ctx: TimeContext): string[] {
  const chips: string[] = [];
  const op = openNow(poi.operating_time, ctx.now);
  if (op === "open" || op === "always") chips.push("운영 중");
  if (poi.source === "culture" && isEndingSoon(poi, ctx.now)) chips.push("마감임박");
  if (poi.fee === "무료") chips.push("무료");
  if (poi.source === "nightview" && (ctx.bucket === "night" || ctx.bucket === "dusk")) {
    chips.push(ctx.bucket === "dusk" ? "노을" : "야경");
  }
  return chips.slice(0, 2);
}

/* ───────────────────────── 거리 계산 ───────────────────────── */

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)}km`;
  return `${Math.round(m / 10) * 10}m`;
}

/* ───────────────────────── 컴포넌트 ───────────────────────── */

type LocStatus = "idle" | "requesting" | "granted" | "denied" | "unavailable";

export default function SearchPanel({ pois, onSelectPOI }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [now, setNow] = useState(() => new Date());
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus] = useState<LocStatus>("idle");

  // 시간대 전환을 반영하기 위해 1분마다 현재 시각 갱신
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocStatus("unavailable");
      return;
    }
    setLocStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus("granted");
      },
      (err) => {
        setLocStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return pois
      .filter((p) => {
        const matchesText =
          p.name.toLowerCase().includes(q) ||
          p.place.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q);
        const matchesFilter = filter === "all" || p.source === filter;
        return matchesText && matchesFilter;
      })
      .slice(0, 20);
  }, [query, filter, pois]);

  const ctx = useMemo(() => getTimeContext(now), [now]);

  // 필터를 추천 풀에도 적용
  const recoPool = useMemo(
    () => pois.filter((p) => filter === "all" || p.source === filter),
    [pois, filter]
  );

  // 시간 기반 추천
  const timeRecos = useMemo(() => {
    return [...recoPool]
      .map((poi) => ({ poi, score: timeScore(poi, ctx) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.poi);
  }, [recoPool, ctx]);

  // 위치 기반 추천 (가까운 순)
  const nearbyRecos = useMemo(() => {
    if (!userLoc) return [];
    return [...recoPool]
      .map((poi) => ({ poi, dist: distanceMeters(userLoc, { lat: poi.lat, lng: poi.lng }) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 6);
  }, [recoPool, userLoc]);

  const FILTERS: { id: FilterType; label: string }[] = [
    { id: "all", label: "전체" },
    { id: "culture", label: "문화행사" },
    { id: "nightview", label: "야경명소" },
  ];

  return (
    <FeedShell>
      {/* 헤더 */}
      <div className="px-6 pt-7 pb-5 md:block hidden">
        <h2 className="text-[22px] font-bold text-[#16243C] leading-tight tracking-[-0.01em]">검색</h2>
        <p className="text-[13px] text-[#8B8678] mt-1">장소, 행사, 명소를 찾아보세요</p>
      </div>

      {/* 검색 입력 + 필터 */}
      <div className="px-5 md:pt-0 pt-5 pb-3 space-y-3">
        <div className="relative">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B8B3A8]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="장소명 또는 카테고리 검색"
            className="w-full pl-10 pr-9 py-2.5 text-[14px] rounded-2xl bg-white border border-[#ECE8E0] text-[#16243C] placeholder:text-[#B8B3A8] focus:outline-none focus:border-[#16243C] transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#B8B3A8] hover:text-[#5C5950]"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3.5 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all ${
                  active
                    ? "bg-[#16243C] text-white shadow-[0_3px_10px_rgba(22,36,60,0.18)]"
                    : "bg-white text-[#5C5950] border border-[#ECE8E0] hover:border-[#D6D1C7]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-4">
        {/* 검색 결과 */}
        {query.trim() ? (
          results.length === 0 ? (
            <div className="py-16 text-center space-y-1">
              <p className="text-[14px] text-[#7C7870] font-medium">검색 결과가 없습니다</p>
              <p className="text-[12px] text-[#A8A398]">다른 검색어를 시도해 보세요</p>
            </div>
          ) : (
            <div className="pt-1">
              <p className="text-[12px] text-[#8B8678] font-semibold pb-2">검색 결과 {results.length}개</p>
              <div className="space-y-2.5">
                {results.map((poi) => (
                  <SearchResultRow key={poi.id} poi={poi} onSelect={() => onSelectPOI(poi)} />
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="space-y-6 pt-1">
            {/* 내 주변 (위치 기반) */}
            <section className="space-y-3">
              <SectionHeading title="내 주변" subtitle="현재 위치에서 가까운 순" />
              {locStatus === "granted" && nearbyRecos.length > 0 ? (
                <div className="space-y-4">
                  {nearbyRecos.map(({ poi, dist }) => (
                    <RecoCard
                      key={poi.id}
                      poi={poi}
                      chips={[formatDistance(dist)]}
                      onSelect={() => onSelectPOI(poi)}
                    />
                  ))}
                </div>
              ) : (
                <LocationPrompt status={locStatus} onRequest={requestLocation} />
              )}
            </section>

            {/* 지금 추천 (시간 기반) */}
            <section className="space-y-3">
              <SectionHeading
                title={BUCKET_HEADLINE[ctx.bucket].title}
                subtitle={BUCKET_HEADLINE[ctx.bucket].subtitle}
              />
              {timeRecos.length === 0 ? (
                <p className="text-[13px] text-[#A8A398] py-2">추천할 장소가 없습니다</p>
              ) : (
                <div className="space-y-4">
                  {timeRecos.map((poi) => (
                    <RecoCard
                      key={poi.id}
                      poi={poi}
                      chips={reasonChips(poi, ctx)}
                      onSelect={() => onSelectPOI(poi)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </FeedShell>
  );
}

/* ───────────────────────── 서브 컴포넌트 ───────────────────────── */

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-[16px] font-bold text-[#16243C] tracking-[-0.01em]">{title}</h3>
      <p className="text-[12px] text-[#8B8678] mt-0.5">{subtitle}</p>
    </div>
  );
}

function LocationPrompt({ status, onRequest }: { status: LocStatus; onRequest: () => void }) {
  if (status === "denied") {
    return (
      <div className="rounded-[22px] bg-white p-5 text-center shadow-[0_6px_24px_rgba(20,30,50,0.07)]">
        <p className="text-[13px] text-[#7C7870]">위치 권한이 거부되었습니다</p>
        <p className="text-[12px] text-[#A8A398] mt-1">브라우저 설정에서 위치 접근을 허용해 주세요</p>
      </div>
    );
  }
  if (status === "unavailable") {
    return (
      <div className="rounded-[22px] bg-white p-5 text-center shadow-[0_6px_24px_rgba(20,30,50,0.07)]">
        <p className="text-[13px] text-[#7C7870]">현재 위치를 사용할 수 없습니다</p>
      </div>
    );
  }
  return (
    <button
      onClick={onRequest}
      disabled={status === "requesting"}
      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-[#ECE8E0] text-[13px] font-semibold text-[#5C5950] hover:border-[#D6D1C7] transition-colors disabled:opacity-60"
    >
      <PinIcon className="w-4 h-4 text-[#16243C]" />
      {status === "requesting" ? "위치 확인 중..." : "내 주변 추천 받기"}
    </button>
  );
}

function RecoCard({
  poi,
  chips,
  onSelect,
}: {
  poi: POIItem;
  chips: string[];
  onSelect: () => void;
}) {
  const isNightview = poi.source === "nightview";
  return (
    <div className="group relative rounded-[22px] bg-white overflow-hidden transition-all duration-200 hover:-translate-y-0.5 shadow-[0_6px_24px_rgba(20,30,50,0.07)] hover:shadow-[0_14px_40px_rgba(20,30,50,0.14)]">
      <button onClick={onSelect} className="w-full text-left block">
        <div className="h-[132px] max-md:h-[108px] overflow-hidden relative bg-[#F4F2EC]">
          {poi.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poi.thumbnail} alt={poi.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#16243C] to-[#33486E] flex items-center justify-center">
              <span className="text-[11px] text-white/70 text-center px-4 leading-tight">{poi.name}</span>
            </div>
          )}
          {isNightview && <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />}
          <span
            className={`absolute top-2.5 right-2.5 text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm ${
              isNightview ? "bg-black/40 text-white/90" : "bg-white/90 text-[#16243C]"
            }`}
          >
            {isNightview ? poi.category : poi.normalizedCategory ?? poi.category}
          </span>
        </div>

        <div className="px-5 py-3.5 max-md:py-3">
          <p className="text-[15px] font-semibold text-[#16243C] leading-snug line-clamp-2 group-hover:text-[#1E2F4D] transition-colors">
            {poi.name}
          </p>
          <p className="text-[12.5px] text-[#9A958A] mt-1 truncate">{poi.place}</p>
          {poi.date && <p className="text-[11.5px] text-[#A8A398] mt-0.5 truncate">{poi.date}</p>}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {chips.map((c) => (
                <span
                  key={c}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#F4F2EC] text-[#5C5950]"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

function SearchResultRow({ poi, onSelect }: { poi: POIItem; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-start gap-3 px-4 py-3.5 rounded-2xl bg-white shadow-[0_4px_16px_rgba(20,30,50,0.06)] hover:shadow-[0_10px_28px_rgba(20,30,50,0.12)] transition-all text-left"
    >
      <span
        className="w-2 h-2 rounded-full shrink-0 mt-1.5"
        style={{ background: poi.source === "nightview" ? "#D97706" : "#2563EB" }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-[#16243C] truncate">{poi.name}</p>
        <p className="text-[12px] text-[#9A958A] mt-0.5 truncate">
          {poi.category} · {poi.place}
        </p>
      </div>
      <span className="text-[11px] font-semibold text-[#A8A398] shrink-0 mt-0.5">
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

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
