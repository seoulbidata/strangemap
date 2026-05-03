"use client";

import { useState, useCallback, useRef } from "react";

/* ---- 타입 ---- */
interface PlaceCandidate {
  label: string;
  placeName: string;
  address: string;
  category: string;
  source: string;
  lat: number;
  lng: number;
}

interface TransitPath {
  mode: "subway" | "bus";
  fromId: string;
  fromName: string;
  fromLat: number | null;
  fromLng: number | null;
  lineName: string;
  routeId: string;
  busRouteType: string;
  routeColor?: string;
  toId: string;
  toName: string;
  toLat: number | null;
  toLng: number | null;
  railLinkCount: number;
  polyline?: { lat: number; lng: number }[];
  congestion?: CongestionInfo;
}

interface TransitRoute {
  distance: number;
  time: number;
  paths: TransitPath[];
  alternativeLabel?: string;
  congestion?: CongestionInfo;
}

interface CongestionInfo {
  score: number;
  label: string;
  color: string;
}

export interface RouteDrawPayload {
  origin: PlaceCandidate;
  destination: PlaceCandidate;
  route: TransitRoute;
}

interface Props {
  onRouteFound?: (payload: RouteDrawPayload) => void;
  onRouteClear?: () => void;
}

/* ---- 상수 ---- */
const LINE_COLORS: Record<string, string> = {
  "1호선": "#0052A4", "2호선": "#00A84D", "3호선": "#EF7C1C", "4호선": "#00A5DE",
  "5호선": "#996CAC", "6호선": "#CD7C2F", "7호선": "#747F00", "8호선": "#E6186C",
  "9호선": "#BDB092", "경의중앙선": "#77C4A3", "공항철도": "#0065B3",
  "경춘선": "#0C8E72", "수인분당선": "#F5A200", "신분당선": "#D4003B",
};

const BUS_TYPE_COLORS: Record<string, string> = {
  "1": "#8b5cf6", "2": "#16a34a", "3": "#2563eb", "4": "#16a34a",
  "5": "#f59e0b", "6": "#dc2626", "7": "#64748b", "8": "#dc2626",
};

/* ---- 유틸 ---- */
function normalizeText(v: string) {
  return v.replace(/\s+/g, "").replace(/역$/, "").toLowerCase();
}

function normalizeCandidates(items: Record<string, string>[], fallback: string): PlaceCandidate[] {
  const seen = new Set<string>();
  return items
    .map((item) => {
      const lng = parseFloat(item.x);
      const lat = parseFloat(item.y);
      const label = item.placeName || item.roadAddress || item.jibunAddress || fallback;
      if (!isFinite(lat) || !isFinite(lng) || !label) return null;
      const key = `${label}|${lat.toFixed(6)}|${lng.toFixed(6)}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { label, placeName: item.placeName ?? "", address: item.roadAddress || item.jibunAddress || "", category: item.category ?? "", source: item.source ?? "", lat, lng } satisfies PlaceCandidate;
    })
    .filter(Boolean)
    .slice(0, 6) as PlaceCandidate[];
}

function scoreCandidates(items: PlaceCandidate[], query: string): PlaceCandidate[] {
  const q = normalizeText(query);
  return [...items].sort((a, b) => {
    const scoreItem = (c: PlaceCandidate) => {
      let s = 0;
      if (c.source === "naverLocalPlace") s += 30;
      if (c.source === "naverGeocode") s += 20;
      if (/지하철|역|철도/.test(c.category)) s += 18;
      if (normalizeText(c.placeName) === q) s += 80;
      if (normalizeText(c.label) === q) s += 60;
      if (normalizeText(c.placeName).includes(q)) s += 30;
      if (normalizeText(c.label).includes(q)) s += 18;
      if (normalizeText(c.address).includes(q)) s += 8;
      return s;
    };
    return scoreItem(b) - scoreItem(a);
  });
}

function getLineColor(step: TransitPath): string {
  if (step.mode === "bus") {
    const inferredType = inferBusType(step.lineName);
    return BUS_TYPE_COLORS[step.busRouteType || inferredType] ?? "#2563eb";
  }
  return LINE_COLORS[step.lineName] ?? "#1d6a3a";
}

function inferBusType(name: string): string {
  if (/^M/i.test(name) || /^9\d{3}/.test(name)) return "6";
  if (/^[가-힣]+ ?\d+/.test(name)) return "2";
  if (/^\d{4}/.test(name)) return "4";
  return "3";
}

function estimateCongestion(step: TransitPath): CongestionInfo {
  const h = new Date().getHours();
  const day = new Date().getDay();
  const isWeekday = day >= 1 && day <= 5;
  const isRush = isWeekday && ((h >= 7 && h <= 9) || (h >= 17 && h <= 20));
  let score = step.mode === "subway" ? 46 : 40;
  if (isRush) score += 24;
  if (/2호선|9호선|신분당선|1호선/.test(step.lineName)) score += 8;
  if (/강남|잠실|홍대입구|서울역|시청|고속터미널|사당|신도림|여의도|왕십리/.test([step.lineName, step.fromName, step.toName].join(" "))) score += 10;
  return scoreToLabel(Math.min(score, 100));
}

function scoreToLabel(score: number): CongestionInfo {
  if (score <= 25) return { score, label: "원활", color: "#2563eb" };
  if (score <= 50) return { score, label: "보통", color: "#16a34a" };
  if (score <= 75) return { score, label: "약간 혼잡", color: "#f97316" };
  if (score <= 100) return { score, label: "혼잡", color: "#dc2626" };
  return { score, label: "매우 혼잡", color: "#991b1b" };
}

function countRouteTransfers(route: TransitRoute) {
  return Math.max(0, route.paths.length - 1);
}

function summarizeModes(route: TransitRoute) {
  const modes = new Set(route.paths.map((p) => p.mode));
  if (modes.has("bus") && modes.has("subway")) return "버스+지하철";
  if (modes.has("subway")) return "지하철";
  if (modes.has("bus")) return "버스";
  return "대중교통";
}

function decorateAlternatives(routes: TransitRoute[]): TransitRoute[] {
  const scored = routes.map((r) => {
    const seg = r.paths.map(estimateCongestion);
    const avg = seg.length ? Math.round(seg.reduce((a, b) => a + b.score, 0) / seg.length) : 50;
    return { ...r, congestion: scoreToLabel(avg) };
  });

  const selected: TransitRoute[] = [];
  const pick = (r: TransitRoute | undefined, label: string) => {
    if (!r || selected.includes(r)) return;
    (r as TransitRoute & { alternativeLabel: string }).alternativeLabel = label;
    selected.push(r);
  };

  const fastest = scored.reduce((a, b) => a.time < b.time ? a : b, scored[0]);
  pick(fastest, "가장 빠른 경로");

  const smoothest = scored.filter((r) => r !== fastest).reduce((a: TransitRoute | null, b) => {
    if (!a) return b;
    return (b.congestion!.score < a.congestion!.score || (b.congestion!.score === a.congestion!.score && b.time < a.time)) ? b : a;
  }, null);
  if (smoothest) pick(smoothest, "가장 원활한 경로");

  const balanced = scored.filter((r) => !selected.includes(r)).reduce((a: TransitRoute | null, b) => {
    if (!a) return b;
    const sa = a.congestion!.score * 0.6 + a.time * 0.4;
    const sb = b.congestion!.score * 0.6 + b.time * 0.4;
    return sb < sa ? b : a;
  }, null);
  if (balanced) pick(balanced, "빠른 원활 대안");

  return selected;
}

/* ---- 컴포넌트 ---- */
export default function SearchRoadPanel({ onRouteFound, onRouteClear }: Props) {
  const [originQuery, setOriginQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [originCandidates, setOriginCandidates] = useState<PlaceCandidate[]>([]);
  const [destCandidates, setDestCandidates] = useState<PlaceCandidate[]>([]);
  const [origin, setOrigin] = useState<PlaceCandidate | null>(null);
  const [dest, setDest] = useState<PlaceCandidate | null>(null);
  const [routeMode, setRouteMode] = useState<"all" | "subway" | "bus" | "mixed">("all");
  const [alternatives, setAlternatives] = useState<TransitRoute[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const geocacheRef = useRef(new Map<string, PlaceCandidate[]>());

  const searchPlaces = useCallback(async (kind: "origin" | "dest", query: string) => {
    if (!query.trim()) return;
    const key = normalizeText(query);
    if (geocacheRef.current.has(key)) {
      const cached = geocacheRef.current.get(key)!;
      kind === "origin" ? setOriginCandidates(cached) : setDestCandidates(cached);
      return;
    }
    setStatus("장소 검색 중…");
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const candidates = scoreCandidates(normalizeCandidates(data.addresses ?? [], query), query);
      geocacheRef.current.set(key, candidates);
      kind === "origin" ? setOriginCandidates(candidates) : setDestCandidates(candidates);
      setStatus(candidates.length ? "후보를 선택해 주세요." : "검색 결과가 없습니다.");
    } catch {
      setStatus("장소 검색 오류가 발생했습니다.");
    }
  }, []);

  const selectPlace = (kind: "origin" | "dest", place: PlaceCandidate) => {
    if (kind === "origin") {
      setOrigin(place);
      setOriginQuery(place.label);
      setOriginCandidates([]);
    } else {
      setDest(place);
      setDestQuery(place.label);
      setDestCandidates([]);
    }
    setStatus("");
  };

  const filterByMode = (routes: TransitRoute[]) => {
    if (routeMode === "all") return routes;
    return routes.filter((r) => {
      const modes = new Set(r.paths.map((p) => p.mode));
      if (routeMode === "subway") return modes.size === 1 && modes.has("subway");
      if (routeMode === "bus") return modes.size === 1 && modes.has("bus");
      if (routeMode === "mixed") return modes.has("bus") && modes.has("subway");
      return true;
    });
  };

  const searchRoute = async () => {
    if (!origin || !dest) {
      setStatus("출발지와 목적지를 모두 선택해 주세요.");
      return;
    }
    setLoading(true);
    setStatus("경로를 탐색하는 중…");
    setAlternatives([]);
    onRouteClear?.();

    try {
      const params = new URLSearchParams({
        startX: String(origin.lng),
        startY: String(origin.lat),
        endX: String(dest.lng),
        endY: String(dest.lat),
      });

      const res = await fetch(`/api/transit/tmap?${params}`);
      const data = await res.json();
      const allRoutes: TransitRoute[] = data.routes ?? [];

      if (!allRoutes.length) {
        setStatus("경로를 찾지 못했습니다. 출발/도착지를 다시 확인해 주세요.");
        setLoading(false);
        return;
      }

      const filtered = filterByMode(allRoutes);
      const decorated = decorateAlternatives(filtered.length ? filtered : allRoutes);

      setAlternatives(decorated);
      setSelectedIdx(0);
      setStatus(`${origin.label} → ${dest.label} 경로를 찾았습니다.`);

      if (decorated[0]) {
        onRouteFound?.({ origin, destination: dest, route: decorated[0] });
      }
    } catch (e) {
      setStatus("경로 탐색 중 오류가 발생했습니다.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const selectAlt = (idx: number) => {
    setSelectedIdx(idx);
    if (alternatives[idx] && origin && dest) {
      onRouteFound?.({ origin, destination: dest, route: alternatives[idx] });
    }
  };

  const currentRoute = alternatives[selectedIdx];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-[#FDECC8] shrink-0">
        <div className="text-sm font-bold text-[#1B3A6B]">길찾기</div>
        <div className="text-[11px] text-[#A8A29E] mt-0.5">버스·지하철 환승 경로 탐색</div>
      </div>

      <div className="flex-1 overflow-y-auto thin-scroll px-4 py-3 space-y-3">
        {/* 출발/도착 입력 */}
        <PlaceInput
          label="출발지"
          query={originQuery}
          onChange={setOriginQuery}
          onSearch={() => searchPlaces("origin", originQuery)}
          candidates={originCandidates}
          selected={origin}
          onSelect={(p) => selectPlace("origin", p)}
          onClear={() => { setOrigin(null); setOriginQuery(""); setOriginCandidates([]); }}
          placeholder="예: 홍대입구역, 서울시청"
          color="#16A34A"
        />

        <PlaceInput
          label="목적지"
          query={destQuery}
          onChange={setDestQuery}
          onSearch={() => searchPlaces("dest", destQuery)}
          candidates={destCandidates}
          selected={dest}
          onSelect={(p) => selectPlace("dest", p)}
          onClear={() => { setDest(null); setDestQuery(""); setDestCandidates([]); }}
          placeholder="예: 강남역, 코엑스"
          color="#DC2626"
        />

        {/* 경로 필터 */}
        <div>
          <div className="text-[11px] text-[#A8A29E] mb-1">경로 필터</div>
          <select
            value={routeMode}
            onChange={(e) => setRouteMode(e.target.value as typeof routeMode)}
            className="w-full text-sm border border-[#FDECC8] rounded-lg px-2 py-1.5 bg-white text-[#1B3A6B] focus:outline-none"
          >
            <option value="all">전체 최적 경로</option>
            <option value="subway">지하철만</option>
            <option value="bus">버스만</option>
            <option value="mixed">버스 + 지하철</option>
          </select>
        </div>

        {/* 검색 버튼 */}
        <button
          onClick={searchRoute}
          disabled={loading || !origin || !dest}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-[#1B3A6B] text-white disabled:opacity-40 hover:bg-[#2563EB] transition-colors"
        >
          {loading ? "탐색 중…" : "길찾기 실행"}
        </button>

        {/* 상태 메시지 */}
        {status && (
          <div className="text-[11px] text-[#A8A29E] text-center">{status}</div>
        )}

        {/* 결과: 대안 경로 */}
        {alternatives.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-[#A8A29E] font-medium">추천 경로</div>
            {alternatives.map((alt, idx) => (
              <button
                key={idx}
                onClick={() => selectAlt(idx)}
                className={`w-full text-left rounded-xl p-2.5 border transition-all ${idx === selectedIdx ? "border-[#1B3A6B] bg-[#EFF6FF]" : "border-[#FDECC8] bg-white hover:bg-[#FFF8E7]"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#1B3A6B]">{alt.alternativeLabel}</span>
                  <span className="text-[11px] text-[#A8A29E]">{alt.time}분</span>
                </div>
                <div className="text-[10px] text-[#A8A29E] mt-0.5">
                  {summarizeModes(alt)} · 환승 {countRouteTransfers(alt)}회
                  {alt.congestion && ` · 혼잡도 ${alt.congestion.label}`}
                </div>
                {alt.congestion && (
                  <CongestionBar congestion={alt.congestion} />
                )}
              </button>
            ))}
          </div>
        )}

        {/* 선택된 경로 단계 */}
        {currentRoute && (
          <div className="space-y-1.5">
            <div className="text-[11px] text-[#A8A29E] font-medium">이동 단계</div>
            {origin && (
              <StepItem icon="출발" label={origin.label} detail="" color="#16A34A" />
            )}
            {currentRoute.paths.map((step, idx) => (
              <StepItem
                key={idx}
                icon={step.mode === "subway" ? "지하철" : "버스"}
                label={`${step.fromName} → ${step.toName}`}
                detail={step.lineName}
                color={getLineColor(step)}
                congestion={step.congestion ?? estimateCongestion(step)}
              />
            ))}
            {dest && (
              <StepItem icon="도착" label={dest.label} detail="" color="#DC2626" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- 서브 컴포넌트 ---- */

function PlaceInput({
  label, query, onChange, onSearch, candidates, selected, onSelect, onClear, placeholder, color,
}: {
  label: string;
  query: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  candidates: PlaceCandidate[];
  selected: PlaceCandidate | null;
  onSelect: (p: PlaceCandidate) => void;
  onClear: () => void;
  placeholder: string;
  color: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#A8A29E] mb-1">{label}</div>
      <div className="flex gap-1.5">
        <input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder={placeholder}
          className="flex-1 text-sm border border-[#FDECC8] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#1B3A6B]"
        />
        <button
          onClick={onSearch}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-[#FDECC8] text-[#1B3A6B] hover:bg-[#EFF6FF] transition-colors"
        >
          검색
        </button>
      </div>
      {selected && (
        <div className="mt-1 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-[11px] text-[#1B3A6B] font-medium truncate flex-1">{selected.label}</span>
          <button onClick={onClear} className="text-[10px] text-[#A8A29E] hover:text-[#DC2626]">✕</button>
        </div>
      )}
      {candidates.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {candidates.map((c, idx) => (
            <button
              key={idx}
              onClick={() => onSelect(c)}
              className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] hover:bg-[#FFF8E7] border border-transparent hover:border-[#FDECC8] transition-all"
            >
              <span className="font-medium text-[#1B3A6B]">{c.placeName || c.label}</span>
              {c.address && <span className="text-[#A8A29E] ml-1">{c.address}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StepItem({ icon, label, detail, color, congestion }: {
  icon: string;
  label: string;
  detail: string;
  color: string;
  congestion?: CongestionInfo;
}) {
  return (
    <div className="flex gap-2 p-2 rounded-lg bg-white border border-[#FDECC8]">
      <span
        className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md text-white leading-none self-start mt-0.5"
        style={{ background: color }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-[#1B3A6B] truncate">{label}</div>
        {detail && <div className="text-[10px] text-[#A8A29E]">{detail}</div>}
        {congestion && <CongestionBar congestion={congestion} />}
      </div>
    </div>
  );
}

function CongestionBar({ congestion }: { congestion: CongestionInfo }) {
  return (
    <div className="mt-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-bold" style={{ color: congestion.color }}>{congestion.label}</span>
        <span className="text-[10px] text-[#A8A29E]">{congestion.score}%</span>
      </div>
      <div className="h-1 bg-[#F3F4F6] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(congestion.score, 100)}%`, background: congestion.color }}
        />
      </div>
    </div>
  );
}
