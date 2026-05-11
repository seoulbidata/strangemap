"use client";

import { useState, useCallback, useRef, useEffect } from "react";

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
  mode: "walk" | "subway" | "bus";
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
  arrivals?: ArrivalInfo[];
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

interface ArrivalInfo {
  primary: string;
  secondary?: string;
}

interface RealtimeInfo {
  arrivalMsg: string;
  arrivalSeconds: number;
  nextArrivalMsg?: string;
  nextArrivalSeconds?: number;
  congestion?: CongestionInfo;
}

export interface RouteDrawPayload {
  origin: PlaceCandidate;
  destination: PlaceCandidate;
  route: TransitRoute;
}

interface Props {
  onRouteFound?: (payload: RouteDrawPayload) => void;
  onRouteClear?: () => void;
  presetDest?: { label: string; lat: number; lng: number } | null;
  presetOrigin?: { label: string; lat: number; lng: number } | null;
}

/* ---- 상수 ---- */
const LINE_COLORS: Record<string, string> = {
  "1호선": "#0052A4", "2호선": "#00A84D", "3호선": "#EF7C1C", "4호선": "#00A5DE",
  "5호선": "#996CAC", "6호선": "#CD7C2F", "7호선": "#747F00", "8호선": "#E6186C",
  "9호선": "#BDB092", "경의중앙선": "#77C4A3", "공항철도": "#0090D2",
  "경춘선": "#0C8E72", "수인분당선": "#F5A200", "신분당선": "#D4003B",
  "우이신설선": "#B0CE18", "신림선": "#6789CA", "서해선": "#8FC31F",
  "김포골드라인": "#A17800", "인천1호선": "#7CA8D5", "인천2호선": "#ED8B00",
  "의정부경전철": "#FDA600", "용인경전철": "#509F22",
};

const BUS_COLORS = {
  metropolitan: "#DC2626",
  city: "#2563EB",
  village: "#16A34A",
};

const SUBWAY_LINE_CODES: Record<string, string> = {
  "1호선": "1001", "2호선": "1002", "3호선": "1003", "4호선": "1004",
  "5호선": "1005", "6호선": "1006", "7호선": "1007", "8호선": "1008",
  "9호선": "1009", "경의중앙선": "1063", "공항철도": "1065",
  "경춘선": "1067", "수인분당선": "1075", "신분당선": "1077",
  "우이신설선": "1092", "신림선": "1093",
};

/* ---- 유틸 ---- */
function normalizeText(v: string) {
  return v.replace(/\s+/g, "").replace(/역$/, "").toLowerCase();
}

function normalizeLineName(v: string) {
  return v.replace(/\s+/g, "").replace(/^수도권/, "").replace(/\(급행\)$/, "");
}

function formatRouteColor(color?: string) {
  if (!color) return "";
  const hex = color.replace(/^#/, "").trim();
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : "";
}

function cleanStationName(v: string) {
  return v.replace(/^지하철\d+호선/, "").replace(/\(.+?\)/g, "").replace(/역$/, "").trim();
}

function cleanBusRouteName(v: string) {
  return v.includes(":") ? v.split(":").at(-1)!.trim() : v.trim();
}

async function fetchStepArrivals(step: TransitPath): Promise<ArrivalInfo[]> {
  if (step.mode === "walk") return [];

  try {
    if (step.mode === "subway") {
      const lineName = normalizeLineName(step.lineName);
      const params = new URLSearchParams({
        station: cleanStationName(step.fromName),
        lineName,
      });
      const lineCode = SUBWAY_LINE_CODES[lineName];
      if (lineCode) params.set("lineCode", lineCode);

      const res = await fetch(`/api/subway/realtime?${params}`);
      const data = await res.json();
      return ((data.arrivals ?? []) as Record<string, unknown>[]).slice(0, 2).map((item) => ({
        primary: String(item.arvlMsg2 ?? ""),
        secondary: String(item.trainLineNm ?? item.arvlMsg3 ?? ""),
      })).filter((item) => item.primary);
    }

    if (!step.fromId) return [];
    const params = new URLSearchParams({
      stopId: step.fromId,
      routeName: cleanBusRouteName(step.lineName),
    });
    if (step.routeId) params.set("routeId", step.routeId);

    const res = await fetch(`/api/bus/realtime?${params}`);
    const data = await res.json();
    const first = ((data.arrivals ?? []) as Record<string, unknown>[])[0];
    if (!first) return [];

    return [
      { primary: String(first.arrmsg1 ?? ""), secondary: String(first.plainNo1 ?? "") },
      { primary: String(first.arrmsg2 ?? ""), secondary: String(first.plainNo2 ?? "") },
    ].filter((item) => item.primary);
  } catch {
    return [];
  }
}

async function enrichRouteArrivals(route: TransitRoute): Promise<TransitRoute> {
  const paths = await Promise.all(route.paths.map(async (step) => ({
    ...step,
    arrivals: await fetchStepArrivals(step),
  })));
  return { ...route, paths };
}

async function fetchStepCongestion(step: TransitPath): Promise<CongestionInfo | undefined> {
  if (step.mode === "walk") return undefined;

  try {
    if (step.mode === "subway") {
      const params = new URLSearchParams({
        station: cleanStationName(step.fromName),
        toStation: cleanStationName(step.toName),
        lineName: normalizeLineName(step.lineName),
      });
      const res = await fetch(`/api/subway/congestion?${params}`);
      if (!res.ok) return undefined;
      const data = await res.json();
      if (data.status !== "OK") return undefined;
      return {
        score: Number(data.score ?? 0),
        label: String(data.label ?? ""),
        color: String(data.color ?? ""),
      };
    }

    if (!step.fromId) return undefined;
    const params = new URLSearchParams({
      stopId: step.fromId,
      routeName: cleanBusRouteName(step.lineName),
    });
    if (step.routeId) params.set("routeId", step.routeId);
    const res = await fetch(`/api/bus/congestion?${params}`);
    if (!res.ok) return undefined;
    const data = await res.json();
    if (data.status !== "OK") return undefined;
    return {
      score: Number(data.score ?? 0),
      label: String(data.label ?? ""),
      color: String(data.color ?? ""),
    };
  } catch {
    return undefined;
  }
}

async function enrichRouteCongestion(route: TransitRoute): Promise<TransitRoute> {
  const paths = await Promise.all(route.paths.map(async (step) => ({
    ...step,
    congestion: await fetchStepCongestion(step) ?? step.congestion,
  })));
  return { ...route, paths };
}

async function fetchStepPolyline(step: TransitPath): Promise<{ lat: number; lng: number }[]> {
  if (step.mode === "walk" || !step.fromId || !step.toId) return step.polyline ?? [];

  try {
    const params = new URLSearchParams({
      fromId: step.fromId,
      toId: step.toId,
    });

    if (step.mode === "bus") {
      if (!step.routeId) return step.polyline ?? [];
      params.set("routeId", step.routeId);
      const res = await fetch(`/api/bus/segment-shape?${params}`);
      const data = await res.json();
      return (data.points ?? []) as { lat: number; lng: number }[];
    }

    params.set("fromName", step.fromName);
    params.set("toName", step.toName);
    params.set("lineName", step.lineName);
    params.set("railLinkCount", String(step.railLinkCount));
    if (step.fromLat != null && step.fromLng != null) {
      params.set("fromLat", String(step.fromLat));
      params.set("fromLng", String(step.fromLng));
    }
    if (step.toLat != null && step.toLng != null) {
      params.set("toLat", String(step.toLat));
      params.set("toLng", String(step.toLng));
    }
    const res = await fetch(`/api/subway/segment-shape?${params}`);
    const data = await res.json();
    return (data.points ?? []) as { lat: number; lng: number }[];
  } catch {
    return step.polyline ?? [];
  }
}

async function enrichRouteGeometry(route: TransitRoute): Promise<TransitRoute> {
  const paths = await Promise.all(route.paths.map(async (step) => ({
    ...step,
    polyline: await fetchStepPolyline(step),
  })));
  return { ...route, paths };
}

function routeEndpointsForMode(mode: "all" | "subway" | "bus" | "mixed") {
  if (mode === "subway") return ["/api/transit/subway-route"];
  if (mode === "bus") return ["/api/transit/bus-route"];
  if (mode === "mixed") return ["/api/transit/mixed-route"];
  return ["/api/transit/subway-route", "/api/transit/bus-route", "/api/transit/mixed-route"];
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
      if (c.source === "seoulSubwayStation") s += 120;
      if (c.source === "seoulTransitLocation") s += 35;
      if (c.source === "naverLocalPlace") s += 30;
      if (c.source === "naverGeocode") s += 20;
      if (/지하철|역|철도/.test(c.category)) s += 18;
      if (c.source === "seoulSubwayStation" && normalizeText(c.label) === q) s += 160;
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

function routeSignature(route: TransitRoute) {
  return route.paths
    .filter((step) => step.mode !== "walk")
    .map((step) => `${step.mode}:${step.lineName}:${step.fromName}:${step.toName}`)
    .join("|");
}

function dedupeRoutes(routes: TransitRoute[]) {
  const seen = new Set<string>();
  return routes.filter((route) => {
    const key = routeSignature(route) || `${route.time}:${route.distance}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getLineColor(step: TransitPath): string {
  if (step.mode === "walk") return "#8a968e";
  if (step.mode === "bus") {
    return getBusColor(step.lineName, step.busRouteType);
  }
  return LINE_COLORS[normalizeLineName(step.lineName)] ?? (formatRouteColor(step.routeColor) || "#1d6a3a");
}

function getBusColor(name: string, type?: string): string {
  const routeName = cleanBusRouteName(name).replace(/\s+/g, "");
  if (type === "4" || type === "5" || type === "6" || /^M/i.test(routeName) || /^9\d{3}/.test(routeName) || /^2\d{3}/.test(routeName)) {
    return BUS_COLORS.metropolitan;
  }
  if (/^[가-힣]+[0-9-]+$/.test(routeName) || type === "2" || type === "12") {
    return BUS_COLORS.village;
  }
  return BUS_COLORS.city;
}

function estimateCongestion(step: TransitPath): CongestionInfo {
  if (step.mode === "walk") return { score: 0, label: "도보", color: "#8a968e" };
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

function busCongestionCodeToInfo(code: number): CongestionInfo | undefined {
  if (code === 1) return { score: 20, label: "여유", color: "#2563eb" };
  if (code === 2) return { score: 45, label: "보통", color: "#16a34a" };
  if (code === 3) return { score: 75, label: "약간 혼잡", color: "#f97316" };
  if (code === 4) return { score: 95, label: "혼잡", color: "#dc2626" };
  return undefined;
}

function realtimeKey(step: TransitPath) {
  return `${step.mode}|${step.fromId}|${step.routeId}`;
}

async function fetchBusRealtime(step: TransitPath): Promise<RealtimeInfo | null> {
  if (!step.fromId) return null;
  try {
    const params = new URLSearchParams({
      stopId: step.fromId,
      routeId: step.routeId,
      routeName: cleanBusRouteName(step.lineName),
    });
    const res = await fetch(`/api/bus/realtime?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const first = data.arrivals?.[0];
    if (!first) return null;
    const nextMsg = first.arrmsg2 || "";
    const nextSecs = first.arrivalSeconds2 ?? 0;
    return {
      arrivalMsg: first.arrmsg1 || "",
      arrivalSeconds: first.arrivalSeconds1 ?? 0,
      nextArrivalMsg: nextMsg || undefined,
      nextArrivalSeconds: nextSecs > 0 ? nextSecs : undefined,
      congestion: busCongestionCodeToInfo(first.congestionCode1 ?? 0),
    };
  } catch {
    return null;
  }
}

async function fetchSubwayRealtime(step: TransitPath): Promise<RealtimeInfo | null> {
  if (!step.fromName) return null;
  try {
    const lineName = normalizeLineName(step.lineName);
    const params = new URLSearchParams({
      station: cleanStationName(step.fromName),
      lineName,
    });
    const lineCode = SUBWAY_LINE_CODES[lineName];
    if (lineCode) params.set("lineCode", lineCode);
    const res = await fetch(`/api/subway/realtime?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const arrivals: Record<string, unknown>[] = data.arrivals ?? [];
    const first = arrivals[0];
    if (!first) return null;
    const firstSecs = parseInt(String(first.barvlDt ?? "0"), 10);

    // 다음 열차: 같은 방향(updnLine)의 두 번째 항목
    const second = arrivals.find(
      (a, i) => i > 0 && a.updnLine === first.updnLine
    );
    const secondSecs = second ? parseInt(String(second.barvlDt ?? "0"), 10) : undefined;

    return {
      arrivalMsg: (first.arvlMsg2 as string) || "",
      arrivalSeconds: isFinite(firstSecs) ? firstSecs : 0,
      nextArrivalMsg: second ? ((second.arvlMsg2 as string) || "") : undefined,
      nextArrivalSeconds: secondSecs !== undefined && isFinite(secondSecs) ? secondSecs : undefined,
    };
  } catch {
    return null;
  }
}

async function fetchRealtimeForRoutes(routes: TransitRoute[]): Promise<Record<string, RealtimeInfo>> {
  const seen = new Set<string>();
  const tasks: { key: string; step: TransitPath }[] = [];
  for (const route of routes) {
    for (const step of route.paths) {
      if (step.mode === "walk") continue;
      const key = realtimeKey(step);
      if (!seen.has(key)) {
        seen.add(key);
        tasks.push({ key, step });
      }
    }
  }
  const results = await Promise.all(
    tasks.map(async ({ key, step }) => {
      const info = step.mode === "bus"
        ? await fetchBusRealtime(step)
        : await fetchSubwayRealtime(step);
      return { key, info };
    })
  );
  const map: Record<string, RealtimeInfo> = {};
  for (const { key, info } of results) {
    if (info) map[key] = info;
  }
  return map;
}

function countRouteTransfers(route: TransitRoute) {
  const transitSteps = route.paths.filter((p) => p.mode !== "walk");
  return Math.max(0, transitSteps.length - 1);
}

function summarizeModes(route: TransitRoute) {
  const modes = new Set(route.paths.filter((p) => p.mode !== "walk").map((p) => p.mode));
  if (modes.has("bus") && modes.has("subway")) return "버스+지하철";
  if (modes.has("subway")) return "지하철";
  if (modes.has("bus")) return "버스";
  return "대중교통";
}

function decorateAlternatives(routes: TransitRoute[]): TransitRoute[] {
  const scored = routes.map((r) => {
    const seg = r.paths.filter((p) => p.mode !== "walk").map((p) => p.congestion ?? estimateCongestion(p));
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
  pick(fastest, "최단시간 경로");

  const smoothest = scored.filter((r) => r !== fastest).reduce((a: TransitRoute | null, b) => {
    if (!a) return b;
    return (b.congestion!.score < a.congestion!.score || (b.congestion!.score === a.congestion!.score && b.time < a.time)) ? b : a;
  }, null);
  if (smoothest) pick(smoothest, "가장 원활한 경로");

  const minTime = Math.min(...scored.map((r) => r.time));
  const maxTime = Math.max(...scored.map((r) => r.time));
  const recommendationScore = (route: TransitRoute) => {
    const congestionScore = 100 - (route.congestion?.score ?? 50);
    const timeScore = maxTime === minTime ? 100 : ((maxTime - route.time) / (maxTime - minTime)) * 100;
    return congestionScore * 0.7 + timeScore * 0.3;
  };

  const recommended = scored.filter((r) => !selected.includes(r)).reduce((a: TransitRoute | null, b) => {
    if (!a) return b;
    const aScore = recommendationScore(a);
    const bScore = recommendationScore(b);
    return bScore > aScore || (bScore === aScore && b.time < a.time) ? b : a;
  }, null);
  if (recommended) pick(recommended, "서울로의 추천경로");

  return selected;
}

/* ---- 컴포넌트 ---- */
export default function SearchRoadPanel({ onRouteFound, onRouteClear, presetDest, presetOrigin }: Props) {
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
  const [stepArrivals, setStepArrivals] = useState<Record<string, RealtimeInfo>>({});
  const geocacheRef = useRef(new Map<string, PlaceCandidate[]>());

  useEffect(() => {
    if (!presetDest) return;
    const candidate: PlaceCandidate = { label: presetDest.label, placeName: presetDest.label, address: "", category: "", source: "preset", lat: presetDest.lat, lng: presetDest.lng };
    setDest(candidate);
    setDestQuery(presetDest.label);
    setDestCandidates([]);
  }, [presetDest]);

  useEffect(() => {
    if (!presetOrigin) return;
    const candidate: PlaceCandidate = { label: presetOrigin.label, placeName: presetOrigin.label, address: "", category: "", source: "preset", lat: presetOrigin.lat, lng: presetOrigin.lng };
    setOrigin(candidate);
    setOriginQuery(presetOrigin.label);
    setOriginCandidates([]);
  }, [presetOrigin]);

  const searchPlaces = useCallback(async (kind: "origin" | "dest", query: string) => {
    if (!query.trim()) return;
    const key = normalizeText(query);
    if (geocacheRef.current.has(key)) {
      const cached = geocacheRef.current.get(key)!;
      if (kind === "origin") {
        setOriginCandidates(cached);
      } else {
        setDestCandidates(cached);
      }
      return;
    }
    setStatus("장소 검색 중…");
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const candidates = scoreCandidates(normalizeCandidates(data.addresses ?? [], query), query);
      geocacheRef.current.set(key, candidates);
      if (kind === "origin") {
        setOriginCandidates(candidates);
      } else {
        setDestCandidates(candidates);
      }
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
      modes.delete("walk");
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
    setStepArrivals({});
    onRouteClear?.();

    try {
      const params = new URLSearchParams({
        startX: String(origin.lng),
        startY: String(origin.lat),
        endX: String(dest.lng),
        endY: String(dest.lat),
      });

      const routeResults = await Promise.allSettled(
        routeEndpointsForMode(routeMode).map(async (endpoint) => {
          const res = await fetch(`${endpoint}?${params}`);
          if (!res.ok) return [];
          const data = await res.json();
          return (data.routes ?? []) as TransitRoute[];
        })
      );
      const allRoutes = dedupeRoutes(routeResults.flatMap((result) => (
        result.status === "fulfilled" ? result.value : []
      )));

      if (!allRoutes.length) {
        setStatus("경로를 찾지 못했습니다. 출발/도착지를 다시 확인해 주세요.");
        setLoading(false);
        return;
      }

      const filtered = filterByMode(allRoutes);
      setStatus("실시간 혼잡도를 확인하는 중…");
      const routesWithCongestion = await Promise.all((filtered.length ? filtered : allRoutes).map(enrichRouteCongestion));
      const decorated = decorateAlternatives(routesWithCongestion);
      setStatus("노선 동선을 불러오는 중…");
      const routesWithGeometry = await Promise.all(decorated.map(enrichRouteGeometry));
      setStatus("실시간 도착 정보를 확인하는 중…");
      const routesWithArrivals = await Promise.all(routesWithGeometry.map(enrichRouteArrivals));

      setAlternatives(routesWithArrivals);
      setSelectedIdx(0);
      setStatus(`${origin.label} → ${dest.label} 경로를 찾았습니다.`);

      if (routesWithArrivals[0]) {
        onRouteFound?.({ origin, destination: dest, route: routesWithArrivals[0] });
      }

      fetchRealtimeForRoutes(decorated).then(setStepArrivals);
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
            {currentRoute.paths.map((step, idx) => {
              const rt = stepArrivals[realtimeKey(step)];
              return (
                <StepItem
                  key={idx}
                  icon={step.mode === "walk" ? "도보" : step.mode === "subway" ? "지하철" : "버스"}
                  label={`${step.fromName} → ${step.toName}`}
                  detail={step.lineName}
                  color={getLineColor(step)}
                  congestion={step.mode === "walk" ? undefined : rt?.congestion ?? step.congestion ?? estimateCongestion(step)}
                  arrivals={step.arrivals}
                  realtimeInfo={rt}
                />
              );
            })}
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

function StepItem({ icon, label, detail, color, congestion, arrivals, realtimeInfo }: {
  icon: string;
  label: string;
  detail: string;
  color: string;
  congestion?: CongestionInfo;
  arrivals?: ArrivalInfo[];
  realtimeInfo?: RealtimeInfo;
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
        {realtimeInfo?.arrivalMsg && (
          <div className="mt-1 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold px-1 py-0.5 rounded text-white shrink-0" style={{ background: color }}>현재</span>
              <span className="text-[10px] font-medium text-[#1B3A6B] truncate">
                {realtimeInfo.arrivalSeconds === 0 ? "곧 도착" : realtimeInfo.arrivalMsg}
              </span>
            </div>
            {realtimeInfo.nextArrivalMsg && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold px-1 py-0.5 rounded text-white shrink-0 opacity-60" style={{ background: color }}>다음</span>
                <span className="text-[10px] text-[#A8A29E] truncate">
                  {realtimeInfo.nextArrivalSeconds !== undefined && realtimeInfo.nextArrivalSeconds >= 60
                    ? `약 ${Math.round(realtimeInfo.nextArrivalSeconds / 60)}분 후`
                    : realtimeInfo.nextArrivalSeconds !== undefined && realtimeInfo.nextArrivalSeconds < 60
                    ? realtimeInfo.nextArrivalMsg || "곧 도착"
                    : realtimeInfo.nextArrivalMsg || "곧 도착"}
                </span>
              </div>
            )}
          </div>
        )}
        {!realtimeInfo?.arrivalMsg && !!arrivals?.length && (
          <div className="mt-1 space-y-0.5">
            {arrivals.map((arrival, idx) => (
              <div key={idx} className="flex items-center gap-1 text-[10px] text-[#1B3A6B]">
                <span className="font-bold text-[#FE9C00]">도착</span>
                <span className="truncate">{arrival.primary}</span>
                {arrival.secondary && <span className="text-[#A8A29E] truncate">{arrival.secondary}</span>}
              </div>
            ))}
          </div>
        )}
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
