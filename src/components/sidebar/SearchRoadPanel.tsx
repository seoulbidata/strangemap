"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { FeedShell } from "./_feedKit";
import { useLocale } from "@/i18n/LocaleContext";
import { congestionLabel, stepIconLabel, ROUTE_ALT_LABEL_EN, TRANSIT_MODE_EN, type Locale } from "@/i18n/enums";

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
  routePool: TransitRoute[];
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

type TFn = ReturnType<typeof useLocale>["t"];

function transferLabel(step: TransitPath, t: TFn) {
  if (step.mode === "bus") return t("route.transfer.bus", { name: cleanBusRouteName(step.lineName) });
  if (step.mode === "subway") return t("route.transfer.subway", { name: normalizeLineName(step.lineName) });
  return t("route.transfer.generic");
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

function formatCountdown(seconds: number, t: TFn) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds <= 0) return t("route.soon");
  const minutes = Math.floor(safeSeconds / 60);
  const remainSeconds = safeSeconds % 60;
  if (minutes <= 0) return t("route.countdown.sec", { s: remainSeconds });
  return t("route.countdown.minSec", { m: minutes, s: remainSeconds });
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

function routeCongestionFromSteps(
  route: TransitRoute,
  realtimeMap?: Record<string, RealtimeInfo>
): CongestionInfo {
  const transitSteps = route.paths.filter((p) => p.mode !== "walk");
  const segmentCongestions = transitSteps
    .map((step) => {
      const actualCongestion = realtimeMap?.[realtimeKey(step)]?.congestion ?? step.congestion;
      return actualCongestion ?? (step.mode === "bus" ? undefined : estimateCongestion(step));
    })
    .filter((congestion): congestion is CongestionInfo => Boolean(congestion && !congestion.unavailable));

  if (!segmentCongestions.length) {
    return {
      score: 0,
      label: "정보 없음",
      color: "#9CA3AF",
      source: "routeAverageNoData",
      unavailable: true,
    };
  }

  const avg = Math.round(segmentCongestions.reduce((sum, congestion) => sum + congestion.score, 0) / segmentCongestions.length);
  return {
    ...scoreToLabel(avg),
    source: segmentCongestions.length > 1 ? "routeAverageCongestion" : segmentCongestions[0].source,
  };
}

function withRouteCongestion(route: TransitRoute, realtimeMap?: Record<string, RealtimeInfo>): TransitRoute {
  return { ...route, congestion: routeCongestionFromSteps(route, realtimeMap) };
}

function decorateAlternatives(routes: TransitRoute[], preference: RoutePreference): TransitRoute[] {
  const scored = routes.map((r) => {
    return withRouteCongestion(r);
  });

  if (scored.length === 0) return [];

  const minTime = Math.min(...scored.map((r) => r.time));
  const maxTime = Math.max(...scored.map((r) => r.time));
  const recommendationScore = (route: TransitRoute) => {
    const congestionScore = 100 - (route.congestion?.score ?? 50);
    const timeScore = maxTime === minTime ? 100 : ((maxTime - route.time) / (maxTime - minTime)) * 100;
    const transfers = countRouteTransfers(route);
    // 7:3 비율 반영 (혼잡도 7, 시간 3 가중치)
    return congestionScore * 0.7 + timeScore * 0.3;
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
function renderAlternativeLabel(label: string | undefined, locale: Locale) {
  if (!label) return null;
  // label 값 자체는 한글 고정(=== 비교용) — 표시만 locale에 따라 변환
  let bgClass = "bg-[#F4F2EC] text-[#5C5950]";
  if (label === "서울로의 추천경로 안내") {
    bgClass = "bg-[#16243C] text-white";
  } else if (label === "가장 빠른길 안내") {
    bgClass = "bg-[#DBEAFE] text-[#1D4ED8]";
  } else if (label === "가장 원활한 경로 안내") {
    bgClass = "bg-[#D1FAE5] text-[#047857]";
  }

  return (
    <span className={`px-2.5 py-1 text-[11px] font-semibold rounded-full ${bgClass}`}>
      {locale === "en" ? ROUTE_ALT_LABEL_EN[label] ?? label : label}
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
  const { t, locale } = useLocale();
  const [originQuery, setOriginQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [originCandidates, setOriginCandidates] = useState<PlaceCandidate[]>([]);
  const [destCandidates, setDestCandidates] = useState<PlaceCandidate[]>([]);
  const [origin, setOrigin] = useState<PlaceCandidate | null>(null);
  const [dest, setDest] = useState<PlaceCandidate | null>(null);
  const [routePreference, setRoutePreference] = useState<RoutePreference>("recommended");
  const [routePool, setRoutePoolState] = useState<TransitRoute[]>(() => routeCacheRef.current.routePool ?? []);
  const [alternatives, setAlternativesState] = useState<TransitRoute[]>(() => routeCacheRef.current.alternatives);
  const [selectedIdx, setSelectedIdxState] = useState(() => routeCacheRef.current.selectedIdx);
  const [status, setStatusState] = useState(() => routeCacheRef.current.status);
  const [loading, setLoading] = useState(false);
  const [stepArrivals, setStepArrivalsState] = useState<Record<string, RealtimeInfo>>({});
  const [nowMs, setNowMs] = useState(Date.now());
  const geocacheRef = useRef(new Map<string, PlaceCandidate[]>());
  const preferenceApplySeqRef = useRef(0);

  const setRoutePool = (val: TransitRoute[]) => {
    routeCacheRef.current.routePool = val;
    setRoutePoolState(val);
  };
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
      setRoutePool([]);
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
    setStatus(t("route.status.searchingPlace"));
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
      setStatus(candidates.length ? t("route.status.pickCandidate") : t("route.status.noResults"));
    } catch {
      setStatus(t("route.status.placeError"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

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

  const applyRoutePreference = async (
    routes: TransitRoute[],
    preference: RoutePreference,
    resolvedOrigin: PlaceCandidate,
    resolvedDest: PlaceCandidate
  ) => {
    const seq = ++preferenceApplySeqRef.current;
    const decorated = decorateAlternatives(routes, preference);

    setStatus(t("route.status.checkingCongestion"));
    const routesWithCongestion = await Promise.all(decorated.map(enrichRouteCongestion));
    if (seq !== preferenceApplySeqRef.current) return;

    setStatus(t("route.status.loadingGeometry"));
    const routesWithGeometry = await Promise.all(routesWithCongestion.map((route) => enrichRouteGeometry(route, "rail")));
    if (seq !== preferenceApplySeqRef.current) return;

    setStatus(t("route.status.checkingArrivals"));
    const routesWithArrivals = (await Promise.all(routesWithGeometry.map(enrichRouteArrivals))).map((route) => withRouteCongestion(route));
    if (seq !== preferenceApplySeqRef.current) return;

    setAlternatives(routesWithArrivals);
    setSelectedIdx(0);
    setStatus(t("route.status.found", { origin: resolvedOrigin.label, dest: resolvedDest.label }));

    if (routesWithArrivals[0]) {
      onRouteFound?.({ origin: resolvedOrigin, destination: resolvedDest, route: routesWithArrivals[0] });
    }

    fetchRealtimeForRoutes(routesWithArrivals).then((nextArrivals) => {
      if (seq !== preferenceApplySeqRef.current) return;
      setStepArrivals(nextArrivals);
      setAlternatives(routesWithArrivals.map((route) => withRouteCongestion(route, nextArrivals)));
    });
  };

  const searchRoute = async () => {
    setLoading(true);
    setStatus(t("route.status.checkingEndpoints"));
    setRoutePool([]);
    setAlternatives([]);
    setStepArrivals({});
    onRouteClear?.();

    // 직접 후보를 선택하지 않았더라도 텍스트가 있으면 자동 지오코딩
    let resolvedOrigin: PlaceCandidate | null = origin;
    let resolvedDest: PlaceCandidate | null = dest;

    if (!resolvedOrigin && originQuery.trim()) {
      setStatus(t("route.status.searchingOrigin"));
      resolvedOrigin = await autoResolvePlace("origin", originQuery);
    }
    if (!resolvedDest && destQuery.trim()) {
      setStatus(t("route.status.searchingDest"));
      resolvedDest = await autoResolvePlace("dest", destQuery);
    }

    if (!resolvedOrigin || !resolvedDest) {
      setStatus(t("route.status.needBoth"));
      setLoading(false);
      return;
    }

    setStatus(t("route.status.searchingRoute"));

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
        setStatus(t("route.status.noRoute"));
        setLoading(false);
        return;
      }

      setRoutePool(allRoutes);
      await applyRoutePreference(allRoutes, routePreference, resolvedOrigin, resolvedDest);
    } catch (e) {
      setStatus(t("route.status.routeError"));
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!routePool.length || !origin || !dest || loading) return;

    let cancelled = false;
    setLoading(true);
    setStepArrivals({});
    applyRoutePreference(routePool, routePreference, origin, dest)
      .catch((error) => {
        if (!cancelled) {
          setStatus(t("route.status.preferenceError"));
          console.error(error);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [routePreference]);

  const selectAlt = (idx: number) => {
    setSelectedIdx(idx);
    if (alternatives[idx] && origin && dest) {
      onRouteFound?.({ origin, destination: dest, route: alternatives[idx] });
    }
  };

  const currentRoute = alternatives[selectedIdx];

  const routeOptions: { value: RoutePreference; label: string }[] = [
    { value: "recommended", label: t("route.opt.recommended") },
    { value: "fastest", label: t("route.opt.fastest") },
    { value: "smoothest", label: t("route.opt.smoothest") },
  ];

  // 역/정류장 접미사: 이미 붙어있으면 그대로, 없으면 로케일 접미사 부착 (역명 자체는 한글 유지)
  const stationLabel = (name: string, mode: TransitPath["mode"]) =>
    name.endsWith("역") || name.endsWith("정류장") || name.endsWith("정류소")
      ? name
      : name + (mode === "subway" ? t("route.suffix.station") : t("route.suffix.busStop"));

  return (
    <FeedShell>
      {/* 헤더 */}
      <div className="px-6 pt-7 pb-5 md:block hidden">
        <h2 className="text-[22px] font-bold text-[#16243C] leading-tight tracking-[-0.01em]">{t("route.title")}</h2>
        <p className="text-[13px] text-[#8B8678] mt-1">{t("route.subtitle")}</p>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 md:pt-0 pt-5 pb-4 space-y-4">
        {/* 출발/도착 입력 */}
        <PlaceInput
          label={t("route.origin")}
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
          placeholder={t("route.originPh")}
          color="#16A34A"
        />

        <PlaceInput
          label={t("route.dest")}
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
          placeholder={t("route.destPh")}
          color="#DC2626"
        />

        {/* 검색 옵션 */}
        <div>
          <div className="text-[12px] font-semibold text-[#8B8678] mb-2">{t("route.options")}</div>
          <div className="flex gap-2">
            {routeOptions.map((opt) => {
              const active = routePreference === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setRoutePreference(opt.value)}
                  className={`flex-1 px-3 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all ${
                    active
                      ? "bg-[#16243C] text-white shadow-[0_3px_10px_rgba(22,36,60,0.18)]"
                      : "bg-white text-[#5C5950] border border-[#ECE8E0] hover:border-[#D6D1C7]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 검색 버튼 */}
        <button
          onClick={searchRoute}
          disabled={loading || (!origin && !originQuery.trim()) || (!dest && !destQuery.trim())}
          className="w-full py-3 rounded-2xl text-[14px] font-bold bg-[#16243C] text-white disabled:opacity-40 hover:bg-[#1E2F4D] transition-colors shadow-[0_3px_10px_rgba(22,36,60,0.18)]"
        >
          {loading ? t("route.running") : t("route.run")}
        </button>

        {/* 상태 메시지 */}
        {status && (
          <div className="text-[12px] text-[#A8A398] text-center">{status}</div>
        )}

        {/* 결과: 선택 경로 */}
        {alternatives.length > 0 && (
          <div className="space-y-2.5">
            <div className="text-[12px] text-[#8B8678] font-semibold">{t("route.results")}</div>
            {alternatives.map((alt, idx) => (
              <button
                key={idx}
                onClick={() => selectAlt(idx)}
                className={`w-full text-left rounded-[22px] p-4 transition-all duration-200 ${
                  idx === selectedIdx
                    ? "bg-white shadow-[0_14px_40px_rgba(20,30,50,0.14)] ring-1 ring-[#16243C]"
                    : "bg-white shadow-[0_6px_24px_rgba(20,30,50,0.07)] hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(20,30,50,0.14)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  {renderAlternativeLabel(alt.alternativeLabel, locale)}
                  <span className="text-[13px] font-semibold text-[#16243C]">{t("route.minutes", { n: alt.time })}</span>
                </div>
                <div className="text-[12px] text-[#9A958A] mt-1.5">
                  {t("route.summary", {
                    modes: locale === "en" ? TRANSIT_MODE_EN[summarizeModes(alt)] ?? summarizeModes(alt) : summarizeModes(alt),
                    n: countRouteTransfers(alt),
                  })}
                  {alt.congestion && t("route.congestionSuffix", { label: congestionLabel(alt.congestion.label, locale) })}
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
          <div className="space-y-2">
            <div className="text-[12px] text-[#8B8678] font-semibold">{t("route.steps")}</div>
            {origin && (
              <StepItem icon="출발" label={origin.label} detail="" color="#16A34A" />
            )}
            {currentRoute.paths.map((step, idx) => {
              const rt = stepArrivals[realtimeKey(step)];
              const stopLabel = step.railLinkCount > 0
                ? t(step.mode === "subway" ? "route.stopsToGo.subway" : "route.stopsToGo.bus", { n: step.railLinkCount })
                : "";
              const detailText = `${step.lineName}${stopLabel}`;
              const prevTransitStep = currentRoute.paths
                .slice(0, idx)
                .reverse()
                .find((s) => s.mode !== "walk");
              const isTransfer = step.mode !== "walk" && prevTransitStep && 
                (prevTransitStep.lineName !== step.lineName);

              const fromStation = prevTransitStep && stationLabel(prevTransitStep.toName, prevTransitStep.mode);

              const nextTransitStep = currentRoute.paths
                .slice(idx + 1)
                .find((s) => s.mode !== "walk");
              const isLastTransit = step.mode !== "walk" && !nextTransitStep;

              const lastStation = isLastTransit && stationLabel(step.toName, step.mode);

              return (
                <div key={idx} className="space-y-1.5 animate-fade-in">
                  {step.walkTimeBefore != null && step.walkTimeBefore > 0 && (
                    <StepItem
                      icon="도보"
                      label={t("route.walkMove")}
                      detail={t("route.walkDetail", { min: step.walkTimeBefore, m: step.walkDistanceBefore ?? 0 })}
                      color="#8a968e"
                    />
                  )}
                  {isTransfer && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EFF6FF] animate-fade-in">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                      <span className="text-[11px] font-semibold text-[#1E40AF]">
                        {t("route.transferChip", { station: fromStation ?? "", transfer: transferLabel(step, t) })}
                      </span>
                      <span className="ml-auto text-[9px] text-white bg-[#2563EB] px-1.5 py-0.5 rounded-full font-semibold">{t("route.badge.alightTransfer")}</span>
                    </div>
                  )}
                  <StepItem
                    icon={step.mode === "walk" ? "도보" : step.mode === "subway" ? "지하철" : "버스"}
                    label={
                      step.mode === "walk"
                        ? t("route.walkMove")
                        : t("route.boardAlight", {
                            from: stationLabel(step.fromName, step.mode),
                            to: stationLabel(step.toName, step.mode),
                          })
                    }
                    detail={detailText}
                    color={getLineColor(step)}
                    congestion={step.mode === "walk" ? undefined : rt?.congestion ?? step.congestion ?? (step.mode === "bus" ? undefined : estimateCongestion(step))}
                    arrivals={step.arrivals}
                    realtimeInfo={rt}
                    nowMs={nowMs}
                  />
                  {isLastTransit && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F4F2EC] animate-fade-in">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5C5950]" />
                      <span className="text-[11px] font-semibold text-[#5C5950]">
                        {t("route.alightStation", { station: lastStation || "" })}
                      </span>
                      <span className="ml-auto text-[9px] text-white bg-[#5C5950] px-1.5 py-0.5 rounded-full font-semibold">{t("route.badge.alight")}</span>
                    </div>
                  )}
                </div>
              );
            })}
            {currentRoute.walkTimeAfter != null && currentRoute.walkTimeAfter > 0 && (
              <StepItem
                icon="도보"
                label={t("route.walkMove")}
                detail={t("route.walkDetail", { min: currentRoute.walkTimeAfter, m: currentRoute.walkDistanceAfter ?? 0 })}
                color="#8a968e"
              />
            )}
            {dest && (
              <StepItem icon="도착" label={dest.label} detail="" color="#DC2626" />
            )}
          </div>
        )}
      </div>
    </FeedShell>
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
  const { t } = useLocale();
  const searchLabel = t("common.search");
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-[12px] font-semibold" style={{ color }}>{label}</span>
      </div>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder={placeholder}
          className="flex-1 text-[14px] bg-white border border-[#ECE8E0] rounded-2xl px-3.5 py-2.5 text-[#16243C] placeholder:text-[#B8B3A8] focus:outline-none transition-colors"
          onFocus={(e) => (e.currentTarget.style.borderColor = color)}
          onBlur={(e) => (e.currentTarget.style.borderColor = "#ECE8E0")}
        />
        <button
          onClick={onSearch}
          className="px-4 py-2.5 rounded-2xl text-[13px] font-semibold bg-white border border-[#ECE8E0] text-[#5C5950] hover:border-[#D6D1C7] transition-colors shrink-0"
        >
          {searchLabel}
        </button>
      </div>
      {selected && (
        <div
          className="mt-2 flex items-center gap-2 rounded-2xl px-3.5 py-2.5"
          style={{ background: `${color}12` }}
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-[13px] font-semibold truncate flex-1" style={{ color }}>{selected.label}</span>
          <button onClick={onClear} className="text-[13px] text-[#A8A398] hover:text-[#DC2626] shrink-0">✕</button>
        </div>
      )}
      {candidates.length > 0 && (
        <div className="mt-2 space-y-1 rounded-2xl bg-white p-1.5 shadow-[0_6px_24px_rgba(20,30,50,0.07)]">
          {candidates.map((c, idx) => (
            <button
              key={idx}
              onClick={() => onSelect(c)}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#F4F2EC] transition-colors"
            >
              <span className="text-[14px] font-semibold text-[#16243C]">{c.placeName || c.label}</span>
              {c.address && <span className="text-[12px] text-[#9A958A] ml-1.5">{c.address}</span>}
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
  const { t, locale } = useLocale();
  const renderNowMs = nowMs ?? Date.now();
  const currentRemaining = realtimeInfo ? remainingArrivalSeconds(realtimeInfo, "arrivalSeconds", renderNowMs) : undefined;
  const nextRemaining = realtimeInfo ? remainingArrivalSeconds(realtimeInfo, "nextArrivalSeconds", renderNowMs) : undefined;

  return (
    <div className="flex gap-2.5 p-3 rounded-2xl bg-white shadow-[0_4px_16px_rgba(20,30,50,0.06)]">
      <span
        className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-full text-white leading-none self-start mt-0.5"
        style={{ background: color }}
      >
        {stepIconLabel(icon, locale)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[#16243C] truncate">{label}</div>
        {detail && <div className="text-[12px] text-[#9A958A] mt-0.5">{detail}</div>}
        {realtimeInfo?.arrivalMsg && (
          <div className="mt-1.5 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0" style={{ background: color }}>{t("route.current")}</span>
              <span className="text-[12px] font-semibold text-[#16243C] truncate">
                {currentRemaining !== undefined ? formatCountdown(currentRemaining, t) : realtimeInfo.arrivalMsg}
              </span>
            </div>
            {realtimeInfo.nextArrivalMsg && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0 opacity-60" style={{ background: color }}>{t("route.next")}</span>
                <span className="text-[12px] text-[#9A958A] truncate">
                  {nextRemaining !== undefined ? formatCountdown(nextRemaining, t) : realtimeInfo.nextArrivalMsg || t("route.soon")}
                </span>
              </div>
            )}
          </div>
        )}
        {!realtimeInfo?.arrivalMsg && !!arrivals?.length && (
          <div className="mt-1.5 space-y-1">
            {arrivals.map((arrival, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-[12px] text-[#16243C]">
                <span className="font-bold text-[#FE9C00]">{t("route.arrival")}</span>
                <span className="truncate">{arrival.primary}</span>
                {arrival.secondary && <span className="text-[#9A958A] truncate">{arrival.secondary}</span>}
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
  const { locale } = useLocale();
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold" style={{ color: congestion.color }}>{congestionLabel(congestion.label, locale)}</span>
        {showPercentage && <span className="text-[11px] text-[#A8A398]">{congestion.score}%</span>}
      </div>
      <div className="h-1.5 bg-[#F4F2EC] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(congestion.score, 100)}%`, background: congestion.color }}
        />
      </div>
    </div>
  );
}
