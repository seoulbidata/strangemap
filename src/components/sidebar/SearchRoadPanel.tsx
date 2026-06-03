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
  walkTimeBefore?: number;
  walkDistanceBefore?: number;
}

interface TransitRoute {
  distance: number;
  time: number;
  paths: TransitPath[];
  alternativeLabel?: string;
  congestion?: CongestionInfo;
  walkTimeAfter?: number;
  walkDistanceAfter?: number;
}

interface CongestionInfo {
  score: number;
  label: string;
  color: string;
  source?: string;
  unavailable?: boolean;
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
  fetchedAt?: number;
}

type RoutePreference = "recommended" | "fastest" | "smoothest";

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
  onClearOrigin?: () => void;
  onClearDest?: () => void;
  routeCacheRef: React.MutableRefObject<RouteSearchCache>;
}

export interface RouteSearchCache {
  alternatives: TransitRoute[];
  selectedIdx: number;
  status: string;
  stepArrivals: Record<string, RealtimeInfo>;
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
  return v.replace(/\s+/g, "").replace(/^(수도권|지하철)/, "").replace(/\(급행\)$/, "");
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

function transferLabel(step: TransitPath) {
  if (step.mode === "bus") return `버스 ${cleanBusRouteName(step.lineName)} 환승`;
  if (step.mode === "subway") return `${normalizeLineName(step.lineName)} 환승`;
  return "환승";
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

    // 버스: 서울 실시간 도착 API의 reride_Div/reride_Num 기반 혼잡도를 사용
    if (!step.fromId) return undefined;
    const params = new URLSearchParams({
      stopId: step.fromId,
      routeName: cleanBusRouteName(step.lineName),
    });
    if (step.routeId) params.set("routeId", step.routeId);
    const res = await fetch(`/api/bus/realtime?${params}`);
    if (!res.ok) return undefined;
    const data = await res.json();
    // bus/realtime이 반환하는 reride 기반 congestion 객체를 직접 사용
    if (data.congestion?.score != null) {
      return {
        score: Number(data.congestion.score),
        label: String(data.congestion.label ?? ""),
        color: String(data.congestion.color ?? ""),
        source: String(data.congestion.source ?? "seoulBusRealtime"),
        unavailable: Boolean(data.congestion.unavailable),
      };
    }
    return {
      score: 0,
      label: "정보 없음",
      color: "#9CA3AF",
      source: "seoulBusNoCongestionData",
      unavailable: true,
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

async function fetchStepPolyline(step: TransitPath, precision: "fast" | "rail" = "fast"): Promise<{ lat: number; lng: number }[]> {
  if (step.mode === "walk" || !step.fromId || !step.toId) return step.polyline ?? [];

  try {
    const params = new URLSearchParams({
      fromId: step.fromId,
      toId: step.toId,
    });

    if (step.mode === "bus") {
      if (!step.routeId) return step.polyline ?? [];
      params.set("routeId", step.routeId);
      params.set("routeName", cleanBusRouteName(step.lineName));
      params.set("fromName", step.fromName);
      params.set("toName", step.toName);
      if (step.fromLat != null && step.fromLng != null) {
        params.set("fromLat", String(step.fromLat));
        params.set("fromLng", String(step.fromLng));
      }
      if (step.toLat != null && step.toLng != null) {
        params.set("toLat", String(step.toLat));
        params.set("toLng", String(step.toLng));
      }
      const res = await fetch(`/api/bus/segment-shape?${params}`);
      const data = await res.json();
      if (data && typeof data.stopCount === "number" && data.stopCount > 0) {
        step.railLinkCount = data.stopCount;
      }
      return (data.points ?? []) as { lat: number; lng: number }[];
    }

    params.set("fromName", step.fromName);
    params.set("toName", step.toName);
    params.set("lineName", step.lineName);
    params.set("railLinkCount", String(step.railLinkCount));
    params.set("precision", precision);
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

async function enrichRouteGeometry(route: TransitRoute, precision: "fast" | "rail" = "fast"): Promise<TransitRoute> {
  const paths = await Promise.all(route.paths.map(async (step) => {
    const polyline = await fetchStepPolyline(step, precision);
    return {
      ...step,
      polyline,
    };
  }));
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
    .filter((p) => p.mode !== "walk")
    .map((p) => [
      p.mode,
      cleanBusRouteName(normalizeLineName(p.lineName)),
      p.routeId,
      p.fromId,
      p.toId,
    ].join(":"))
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

/** routeId/lineName 기반 결정적 해시 → 노선마다 고정적인 편차를 부여 */
function routeHash(step: TransitPath): number {
  const seed = (step.routeId || step.lineName || step.fromName || "x").slice(0, 12);
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  }
  return h;
}

function estimateCongestion(step: TransitPath): CongestionInfo {
  if (step.mode === "walk") return { score: 0, label: "도보", color: "#8a968e" };
  const h = new Date().getHours();
  const day = new Date().getDay();
  const isWeekday = day >= 1 && day <= 5;
  const isRush = isWeekday && ((h >= 7 && h <= 9) || (h >= 17 && h <= 20));

  // 노선별 편차: 해시로 -14 ~ +14 사이의 고정 오프셋 부여 (같은 노선은 항상 같은 값)
  const variance = (routeHash(step) % 29) - 14;

  let score = step.mode === "subway" ? 44 : 38;
  if (isRush) score += step.mode === "subway" ? 20 : 16;
  if (/2호선|9호선|신분당선|1호선/.test(step.lineName)) score += 8;
  if (/강남|잠실|홍대입구|서울역|시청|고속터미널|사당|신도림|여의도|왕십리/.test(
    [step.lineName, step.fromName, step.toName].join(" ")
  )) score += 10;

  score += variance;
  return scoreToLabel(Math.max(5, Math.min(score, 100)));
}

function scoreToLabel(score: number): CongestionInfo {
  if (score <= 25) return { score, label: "원활", color: "#2563eb" };
  if (score <= 50) return { score, label: "보통", color: "#16a34a" };
  if (score <= 75) return { score, label: "약간 혼잡", color: "#f97316" };
  if (score <= 100) return { score, label: "혼잡", color: "#dc2626" };
  return { score, label: "매우 혼잡", color: "#991b1b" };
}

/** 서울 버스 API 혼잡도 코드 3-7 → CongestionInfo 변환 (실시간 도착 정보에서 사용) */
function busCongestionCodeToInfo(code: number): CongestionInfo | undefined {
  if (code === 3) return { score: 22, label: "여유",     color: "#2563eb" };
  if (code === 4) return { score: 45, label: "보통",     color: "#16a34a" };
  if (code === 5) return { score: 75, label: "혼잡",     color: "#f97316" };
  if (code === 6) return { score: 92, label: "매우 혼잡", color: "#dc2626" };
  if (code === 7) return { score: 100, label: "만차",    color: "#991b1b" };
  return undefined;
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds <= 0) return "곧 도착";
  const minutes = Math.floor(safeSeconds / 60);
  const remainSeconds = safeSeconds % 60;
  if (minutes <= 0) return `${remainSeconds}초 후`;
  return `${minutes}분 ${remainSeconds}초 후`;
}

function remainingArrivalSeconds(info: RealtimeInfo, key: "arrivalSeconds" | "nextArrivalSeconds", now: number) {
  const baseSeconds = info[key];
  if (baseSeconds === undefined) return undefined;
  const elapsedSeconds = info.fetchedAt ? Math.floor((now - info.fetchedAt) / 1000) : 0;
  return Math.max(0, baseSeconds - elapsedSeconds);
}

function realtimeKey(step: TransitPath) {
  return `${step.mode}|${step.fromId}|${step.routeId}`;
}


async function fetchBusRouteCongestion(step: TransitPath): Promise<CongestionInfo | undefined> {
  if (step.mode !== "bus" || !step.fromId) return undefined;

  try {
    const params = new URLSearchParams({ stationId: step.fromId });
    if (step.routeId) params.set("routeId", step.routeId);
    const res = await fetch(`/api/bus/route-congestion?${params}`);
    if (!res.ok) return undefined;
    const data = await res.json();
    if (data.status !== "OK" || data.score == null) return undefined;
    return {
      score: Number(data.score),
      label: String(data.label ?? ""),
      color: String(data.color ?? ""),
      source: String(data.source ?? "routeCongestionLevel"),
    };
  } catch {
    return undefined;
  }
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
      congestion: step.congestion ?? data.congestion ?? busCongestionCodeToInfo(first.congestionCode1 ?? 0),
      fetchedAt: Date.now(),
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
      fetchedAt: Date.now(),
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

function decorateAlternatives(routes: TransitRoute[], preference: RoutePreference): TransitRoute[] {
  const scored = routes.map((r) => {
    const seg = r.paths.filter((p) => p.mode !== "walk").map((p) => p.congestion ?? estimateCongestion(p));
    const avg = seg.length ? Math.round(seg.reduce((a, b) => a + b.score, 0) / seg.length) : 50;
    return { ...r, congestion: scoreToLabel(avg) };
  });

  if (scored.length === 0) return [];

  const minTime = Math.min(...scored.map((r) => r.time));
  const maxTime = Math.max(...scored.map((r) => r.time));
  const recommendationScore = (route: TransitRoute) => {
    const congestionScore = 100 - (route.congestion?.score ?? 50);
    const timeScore = maxTime === minTime ? 100 : ((maxTime - route.time) / (maxTime - minTime)) * 100;
    const transfers = countRouteTransfers(route);
    // 6:4 비율 반영 (혼잡도 6, 시간 4 가중치) 및 환승 1회당 10점 페널티 적용
    return congestionScore * 0.6 + timeScore * 0.4 - transfers * 10;
  };

  const deepClone = (r: TransitRoute): TransitRoute => JSON.parse(JSON.stringify(r));

  const recommended = scored.reduce((a, b) => {
    const aScore = recommendationScore(a);
    const bScore = recommendationScore(b);
    return bScore > aScore || (bScore === aScore && b.time < a.time) ? b : a;
  }, scored[0]);

  const fastest = scored.reduce((a, b) => a.time < b.time ? a : b, scored[0]);

  const smoothest = scored.reduce((a, b) => {
    const aCong = a.congestion?.score ?? 50;
    const bCong = b.congestion?.score ?? 50;
    return (bCong < aCong || (bCong === aCong && b.time < a.time)) ? b : a;
  }, scored[0]);

  const selectedByPreference: Record<RoutePreference, [TransitRoute, string]> = {
    recommended: [recommended, "서울로의 추천경로 안내"],
    fastest: [fastest, "가장 빠른길 안내"],
    smoothest: [smoothest, "가장 원활한 경로 안내"],
  };

  const [route, label] = selectedByPreference[preference];
  return [{ ...deepClone(route), alternativeLabel: label }];
}
function renderAlternativeLabel(label?: string) {
  if (!label) return null;
  let bgClass = "bg-[#EFF6FF] text-[#1B3A6B] border-[#EFF6FF]";
  if (label === "서울로의 추천경로 안내") {
    bgClass = "bg-[#FE9C00] text-white border-[#FE9C00] shadow-sm";
  } else if (label === "가장 빠른길 안내") {
    bgClass = "bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE]";
  } else if (label === "가장 원활한 경로 안내") {
    bgClass = "bg-[#D1FAE5] text-[#047857] border-[#A7F3D0]";
  }

  return (
    <span className={`px-2 py-0.5 text-[9px] font-bold rounded-md border ${bgClass}`}>
      {label}
    </span>
  );
}

/* ---- 컴포넌트 ---- */
export default function SearchRoadPanel({
  onRouteFound,
  onRouteClear,
  presetDest,
  presetOrigin,
  onClearOrigin,
  onClearDest,
  routeCacheRef,
}: Props) {
  const [originQuery, setOriginQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [originCandidates, setOriginCandidates] = useState<PlaceCandidate[]>([]);
  const [destCandidates, setDestCandidates] = useState<PlaceCandidate[]>([]);
  const [origin, setOrigin] = useState<PlaceCandidate | null>(null);
  const [dest, setDest] = useState<PlaceCandidate | null>(null);
  const [routePreference, setRoutePreference] = useState<RoutePreference>("recommended");
  const [alternatives, setAlternativesState] = useState<TransitRoute[]>(() => routeCacheRef.current.alternatives);
  const [selectedIdx, setSelectedIdxState] = useState(() => routeCacheRef.current.selectedIdx);
  const [status, setStatusState] = useState(() => routeCacheRef.current.status);
  const [loading, setLoading] = useState(false);
  const [stepArrivals, setStepArrivalsState] = useState<Record<string, RealtimeInfo>>({});
  const [nowMs, setNowMs] = useState(Date.now());
  const geocacheRef = useRef(new Map<string, PlaceCandidate[]>());

  const setAlternatives = (val: TransitRoute[]) => {
    routeCacheRef.current.alternatives = val;
    setAlternativesState(val);
  };
  const setSelectedIdx = (val: number) => {
    routeCacheRef.current.selectedIdx = val;
    setSelectedIdxState(val);
  };
  const setStatus = (val: string) => {
    routeCacheRef.current.status = val;
    setStatusState(val);
  };
  const setStepArrivals = (val: Record<string, RealtimeInfo>) => {
    routeCacheRef.current.stepArrivals = val;
    setStepArrivalsState(val);
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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

  useEffect(() => {
    if (!origin && !dest && !originQuery.trim() && !destQuery.trim()) {
      onRouteClear?.();
      setAlternatives([]);
      setSelectedIdx(0);
      setStatus("");
      setStepArrivals({});
    }
  }, [origin, dest, originQuery, destQuery, onRouteClear]);

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

  /** 텍스트만 입력되어 있고 후보를 직접 선택하지 않은 경우, 자동 지오코딩으로 첫 번째 결과를 사용 */
  const autoResolvePlace = async (kind: "origin" | "dest", query: string): Promise<PlaceCandidate | null> => {
    const q = query.trim();
    if (!q) return null;
    const key = normalizeText(q);
    const cached = geocacheRef.current.get(key);
    if (cached && cached.length > 0) {
      const top = cached[0];
      if (kind === "origin") { setOrigin(top); setOriginQuery(top.label); setOriginCandidates([]); }
      else { setDest(top); setDestQuery(top.label); setDestCandidates([]); }
      return top;
    }
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const candidates = scoreCandidates(normalizeCandidates(data.addresses ?? [], q), q);
      geocacheRef.current.set(key, candidates);
      if (candidates.length > 0) {
        const top = candidates[0];
        if (kind === "origin") { setOrigin(top); setOriginQuery(top.label); setOriginCandidates([]); }
        else { setDest(top); setDestQuery(top.label); setDestCandidates([]); }
        return top;
      }
    } catch { /* ignore */ }
    return null;
  };

  const searchRoute = async () => {
    setLoading(true);
    setStatus("출발·도착지 확인 중…");
    setAlternatives([]);
    setStepArrivals({});
    onRouteClear?.();

    // 직접 후보를 선택하지 않았더라도 텍스트가 있으면 자동 지오코딩
    let resolvedOrigin: PlaceCandidate | null = origin;
    let resolvedDest: PlaceCandidate | null = dest;

    if (!resolvedOrigin && originQuery.trim()) {
      setStatus("출발지 검색 중…");
      resolvedOrigin = await autoResolvePlace("origin", originQuery);
    }
    if (!resolvedDest && destQuery.trim()) {
      setStatus("목적지 검색 중…");
      resolvedDest = await autoResolvePlace("dest", destQuery);
    }

    if (!resolvedOrigin || !resolvedDest) {
      setStatus("출발지와 목적지를 모두 입력해 주세요.");
      setLoading(false);
      return;
    }

    setStatus("경로를 탐색하는 중…");

    try {
      const params = new URLSearchParams({
        startX: String(resolvedOrigin.lng),
        startY: String(resolvedOrigin.lat),
        endX: String(resolvedDest.lng),
        endY: String(resolvedDest.lat),
      });

      const routeResults = await Promise.allSettled(
        routeEndpointsForMode("all").map(async (endpoint) => {
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

      const decorated = decorateAlternatives(allRoutes, routePreference);
      setStatus("실시간 혼잡도를 확인하는 중…");
      const routesWithCongestion = await Promise.all(decorated.map(enrichRouteCongestion));
      setStatus("지하철 노선 동선을 불러오는 중…");
      const routesWithGeometry = await Promise.all(routesWithCongestion.map((route) => enrichRouteGeometry(route, "rail")));
      setStatus("실시간 도착 정보를 확인하는 중…");
      const routesWithArrivals = await Promise.all(routesWithGeometry.map(enrichRouteArrivals));

      setAlternatives(routesWithArrivals);
      setSelectedIdx(0);
      setStatus(`${resolvedOrigin.label} → ${resolvedDest.label} 경로를 찾았습니다.`);

      if (routesWithArrivals[0]) {
        onRouteFound?.({ origin: resolvedOrigin, destination: resolvedDest, route: routesWithArrivals[0] });
      }

      fetchRealtimeForRoutes(routesWithArrivals).then(setStepArrivals);
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
      <div className="px-4 py-3 border-b border-[#FDECC8] shrink-0 md:block hidden">
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
          onClear={() => {
            setOrigin(null);
            setOriginQuery("");
            setOriginCandidates([]);
            onClearOrigin?.();
          }}
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
          onClear={() => {
            setDest(null);
            setDestQuery("");
            setDestCandidates([]);
            onClearDest?.();
          }}
          placeholder="예: 강남역, 코엑스"
          color="#DC2626"
        />

        {/* 검색 옵션 */}
        <div>
          <div className="text-[11px] text-[#A8A29E] mb-1">검색 옵션</div>
          <select
            value={routePreference}
            onChange={(e) => setRoutePreference(e.target.value as RoutePreference)}
            className="w-full text-sm border border-[#FDECC8] rounded-lg px-2 py-1.5 bg-white text-[#1B3A6B] focus:outline-none"
          >
            <option value="recommended">서울로의 추천경로 받기</option>
            <option value="fastest">가장 빠른길 찾기</option>
            <option value="smoothest">가장 원활한 길찾기</option>
          </select>
        </div>

        {/* 검색 버튼 */}
        <button
          onClick={searchRoute}
          disabled={loading || (!origin && !originQuery.trim()) || (!dest && !destQuery.trim())}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-[#1B3A6B] text-white disabled:opacity-40 hover:bg-[#2563EB] transition-colors"
        >
          {loading ? "탐색 중…" : "길찾기 실행"}
        </button>

        {/* 상태 메시지 */}
        {status && (
          <div className="text-[11px] text-[#A8A29E] text-center">{status}</div>
        )}

        {/* 결과: 선택 경로 */}
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
                  {renderAlternativeLabel(alt.alternativeLabel)}
                  <span className="text-[11px] text-[#A8A29E]">{alt.time}분</span>
                </div>
                <div className="text-[10px] text-[#A8A29E] mt-0.5">
                  {summarizeModes(alt)} · 환승 {countRouteTransfers(alt)}회
                  {alt.congestion && ` · 혼잡도 ${alt.congestion.label}`}
                </div>
                {alt.congestion && (
                  <CongestionBar congestion={alt.congestion} showPercentage={false} />
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
              const stopLabel = step.railLinkCount > 0
                ? ` · ${step.railLinkCount}개 ${step.mode === "subway" ? "역" : "정류장"} 이동 후 도착`
                : "";
              const detailText = `${step.lineName}${stopLabel}`;
              const prevTransitStep = currentRoute.paths
                .slice(0, idx)
                .reverse()
                .find((s) => s.mode !== "walk");
              const isTransfer = step.mode !== "walk" && prevTransitStep && 
                (prevTransitStep.lineName !== step.lineName);

              const fromStation = prevTransitStep && (
                prevTransitStep.toName.endsWith("역") || prevTransitStep.toName.endsWith("정류장")
                  ? prevTransitStep.toName
                  : prevTransitStep.toName + (prevTransitStep.mode === "subway" ? "역" : " 정류장")
              );

              const nextTransitStep = currentRoute.paths
                .slice(idx + 1)
                .find((s) => s.mode !== "walk");
              const isLastTransit = step.mode !== "walk" && !nextTransitStep;

              const lastStation = isLastTransit && (
                step.toName.endsWith("역") || step.toName.endsWith("정류장")
                  ? step.toName
                  : step.toName + (step.mode === "subway" ? "역" : " 정류장")
              );

              return (
                <div key={idx} className="space-y-1.5 animate-fade-in">
                  {step.walkTimeBefore != null && step.walkTimeBefore > 0 && (
                    <StepItem
                      icon="도보"
                      label="도보 이동"
                      detail={`약 ${step.walkTimeBefore}분 (${step.walkDistanceBefore}m)`}
                      color="#8a968e"
                    />
                  )}
                  {isTransfer && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] animate-fade-in">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                      <span className="text-[10px] font-bold text-[#1E40AF]">
                        {fromStation} 하차 후 {transferLabel(step)}
                      </span>
                      <span className="ml-auto text-[8px] text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] px-1 rounded font-bold">하차 & 환승</span>
                    </div>
                  )}
                  <StepItem
                    icon={step.mode === "walk" ? "도보" : step.mode === "subway" ? "지하철" : "버스"}
                    label={
                      step.mode === "walk"
                        ? "도보 이동"
                        : `${
                            step.fromName.endsWith("역") || step.fromName.endsWith("정류장") || step.fromName.endsWith("정류소")
                              ? step.fromName
                              : step.fromName + (step.mode === "subway" ? "역" : " 정류장")
                          } 탑승 → ${
                            step.toName.endsWith("역") || step.toName.endsWith("정류장") || step.toName.endsWith("정류소")
                              ? step.toName
                              : step.toName + (step.mode === "subway" ? "역" : " 정류장")
                          } 하차`
                    }
                    detail={detailText}
                    color={getLineColor(step)}
                    congestion={step.mode === "walk" ? undefined : rt?.congestion ?? step.congestion ?? (step.mode === "bus" ? undefined : estimateCongestion(step))}
                    arrivals={step.arrivals}
                    realtimeInfo={rt}
                    nowMs={nowMs}
                  />
                  {isLastTransit && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F3F4F6] border border-[#D1D5DB] animate-fade-in">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4B5563]" />
                      <span className="text-[10px] font-bold text-[#374151]">
                        {lastStation} 하차
                      </span>
                      <span className="ml-auto text-[8px] text-[#4B5563] bg-[#F3F4F6] border border-[#D1D5DB] px-1 rounded font-bold">하차</span>
                    </div>
                  )}
                </div>
              );
            })}
            {currentRoute.walkTimeAfter != null && currentRoute.walkTimeAfter > 0 && (
              <StepItem
                icon="도보"
                label="도보 이동"
                detail={`약 ${currentRoute.walkTimeAfter}분 (${currentRoute.walkDistanceAfter}m)`}
                color="#8a968e"
              />
            )}
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

function StepItem({ icon, label, detail, color, congestion, arrivals, realtimeInfo, nowMs }: {
  icon: string;
  label: string;
  detail: string;
  color: string;
  congestion?: CongestionInfo;
  arrivals?: ArrivalInfo[];
  realtimeInfo?: RealtimeInfo;
  nowMs?: number;
}) {
  const renderNowMs = nowMs ?? Date.now();
  const currentRemaining = realtimeInfo ? remainingArrivalSeconds(realtimeInfo, "arrivalSeconds", renderNowMs) : undefined;
  const nextRemaining = realtimeInfo ? remainingArrivalSeconds(realtimeInfo, "nextArrivalSeconds", renderNowMs) : undefined;

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
                {currentRemaining !== undefined ? formatCountdown(currentRemaining) : realtimeInfo.arrivalMsg}
              </span>
            </div>
            {realtimeInfo.nextArrivalMsg && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold px-1 py-0.5 rounded text-white shrink-0 opacity-60" style={{ background: color }}>다음</span>
                <span className="text-[10px] text-[#A8A29E] truncate">
                  {nextRemaining !== undefined ? formatCountdown(nextRemaining) : realtimeInfo.nextArrivalMsg || "곧 도착"}
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
        {congestion && <CongestionBar congestion={congestion} showPercentage={icon === "지하철"} />}
      </div>
    </div>
  );
}

function CongestionBar({ congestion, showPercentage = true }: { congestion: CongestionInfo; showPercentage?: boolean }) {
  return (
    <div className="mt-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-bold" style={{ color: congestion.color }}>{congestion.label}</span>
        {showPercentage && <span className="text-[10px] text-[#A8A29E]">{congestion.score}%</span>}
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
