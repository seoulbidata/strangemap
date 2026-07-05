import { NextRequest, NextResponse } from "next/server";
import type { AIPlaceInfo, AIEvent } from "@/types/quest";
import { SEOUL_PLACES } from "@/lib/seoulPlaces";
import { incrementAIUsage } from "@/lib/aiUsage";
import {
  extractJsonObjectText,
  generateGeminiJsonText,
  parseJsonWithEscapedControlChars,
} from "@/lib/gemini";
import * as koKit from "./prompts.ko";
import * as enKit from "./prompts.en";

// Server-side cache: 30-min TTL
const _serverCache = new Map<string, { data: AIPlaceInfo; ts: number }>();
const SERVER_CACHE_TTL = 30 * 60 * 1000;

// ── Real data fetchers ──────────────────────────────────────────────────────

async function fetchCongestionMessage(
  placeName: string,
  lat?: number,
  lng?: number
): Promise<string | null> {
  const apiKey = process.env.SEOUL_API_KEY;
  if (!apiKey) return null;

  // Name-based match first
  let areaName =
    SEOUL_PLACES.find(
      (p) =>
        p.areaName.includes(placeName) ||
        placeName.includes(p.areaName) ||
        p.displayName.includes(placeName) ||
        placeName.includes(p.displayName)
    )?.areaName ?? null;

  // Proximity match if coords provided
  if (!areaName && lat && lng) {
    let minDist = Infinity;
    for (const p of SEOUL_PLACES) {
      const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
      if (d < minDist) {
        minDist = d;
        areaName = p.areaName;
      }
    }
    if (minDist > 0.005) areaName = null; // > ~500m → 무관
  }

  if (!areaName) return null;

  try {
    const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/citydata_ppltn/1/5/${encodeURIComponent(areaName)}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = await res.json();
    const item = json["SeoulRtd.citydata_ppltn"]?.[0];
    if (!item) return null;
    return `${item.AREA_CONGEST_LVL ?? "정보없음"}: ${item.AREA_CONGEST_MSG ?? ""}`;
  } catch {
    return null;
  }
}

// 위도·경도 기준 km 거리 (Haversine 간이 계산)
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const NEARBY_RADIUS_KM = 3;

function isEventPassed(endDateStr: string, proTimeStr?: string): boolean {
  if (!endDateStr) return false;

  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstTime = new Date(now.getTime() + kstOffset);

  const currentYear = kstTime.getUTCFullYear();
  const currentMonth = kstTime.getUTCMonth() + 1;
  const currentDate = kstTime.getUTCDate();
  const currentHour = kstTime.getUTCHours();
  const currentMin = kstTime.getUTCMinutes();

  const datePart = endDateStr.slice(0, 10);
  const [endYear, endMonth, endDay] = datePart.split("-").map(Number);

  if (!endYear || !endMonth || !endDay) return false;

  if (endYear < currentYear) return true;
  if (endYear > currentYear) return false;
  if (endMonth < currentMonth) return true;
  if (endMonth > currentMonth) return false;
  if (endDay < currentDate) return true;
  if (endDay > currentDate) return false;

  if (endDay === currentDate) {
    if (!proTimeStr) return false;

    const timeMatches = [...proTimeStr.matchAll(/(\d{1,2}):(\d{2})/g)];
    let endHour = 23;
    let endMin = 59;

    if (timeMatches.length > 0) {
      const lastMatch = timeMatches[timeMatches.length - 1];
      endHour = parseInt(lastMatch[1], 10);
      endMin = parseInt(lastMatch[2], 10);
    } else {
      const hourMatches = [...proTimeStr.matchAll(/(\d{1,2})\s*시/g)];
      if (hourMatches.length > 0) {
        const lastMatch = hourMatches[hourMatches.length - 1];
        endHour = parseInt(lastMatch[1], 10);
        endMin = 0;
      }
    }

    if (currentHour > endHour) return true;
    if (currentHour === endHour && currentMin > endMin) return true;
  }

  return false;
}

async function fetchRealEvents(
  lat: number | undefined,
  lng: number | undefined,
): Promise<AIEvent[]> {
  const apiKey = process.env.SEOUL_API_KEY;
  if (!apiKey) return [];

  try {
    const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/culturalEventInfo/1/500/`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    const rows: Record<string, string>[] = data?.culturalEventInfo?.row ?? [];

    const withDist = rows
      .filter((r) => {
        if (!r.LAT || !r.LOT || parseFloat(r.LAT) === 0) return false;
        if (isEventPassed(r.END_DATE, r.PRO_TIME)) return false;
        return true;
      })
      .map((r) => ({
        row: r,
        dist:
          lat && lng
            ? distanceKm(lat, lng, parseFloat(r.LAT), parseFloat(r.LOT))
            : Infinity,
      }))
      .filter(({ dist }) => dist <= NEARBY_RADIUS_KM)
      .sort((a, b) => a.dist - b.dist);

    return withDist.slice(0, 3).map(({ row: r, dist }) => ({
      title: r.TITLE ?? "",
      desc: r.PROGRAM || r.ETC_DESC || r.ORG_NAME || "",
      period:
        r.DATE ||
        (r.STRTDATE && r.END_DATE
          ? `${r.STRTDATE.slice(0, 10)} ~ ${r.END_DATE.slice(0, 10)}`
          : ""),
      time: r.PRO_TIME || undefined,
      link: r.HMPG_ADDR || undefined,
      fee: r.USE_FEE || "무료",
      _distKm: Math.round(dist * 10) / 10,
    }));
  } catch {
    return [];
  }
}

function findNearbyPlaces(lat: number, lng: number, excludeName: string): string[] {
  return SEOUL_PLACES.filter(
    (p) => p.displayName !== excludeName && p.areaName !== excludeName
  )
    .map((p) => ({ name: p.displayName, dist: (p.lat - lat) ** 2 + (p.lng - lng) ** 2 }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 4)
    .map((p) => p.name);
}

// ── 프롬프트 킷 (ko/en) ───────────────────────────────────────────────────────
// SYSTEM_MSG·buildPrompt·buildRightNow·buildEventPick·mock은 언어별 모듈로 분리됨.
// PLACE_INFO_SCHEMA는 언어 중립이라 이 파일에 유지한다.

type Lang = "ko" | "en";

function promptKit(lang: Lang) {
  return lang === "en" ? enKit : koKit;
}

// ── AI callers ──────────────────────────────────────────────────────────────

const PLACE_INFO_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    right_now: { type: "STRING" },
    highlights: { type: "ARRAY", items: { type: "STRING" } },
    tip: { type: "STRING" },
    best_time: { type: "STRING" },
    crowd_tip: { type: "STRING" },
    viewpoint_guide: { type: "STRING" },
    event_pick: { type: "STRING" },
    nearby: { type: "ARRAY", items: { type: "STRING" } },
    vibe: { type: "ARRAY", items: { type: "STRING" } },
    tags: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["summary", "right_now", "highlights", "tip", "best_time", "crowd_tip", "nearby", "vibe", "tags"],
};

function parseAIResponse(text: string): object | null {
  const jsonText = extractJsonObjectText(text);
  if (!jsonText) return null;
  return parseJsonWithEscapedControlChars<object>(jsonText);
}

async function callGemini(prompt: string, systemInstruction: string): Promise<object | null> {
  const text = await generateGeminiJsonText({
    prompt,
    systemInstruction,
    maxOutputTokens: 2500,
    responseSchema: PLACE_INFO_SCHEMA,
  });
  if (!text) return null;
  console.log("[Gemini] response:", text.slice(0, 100));
  return parseAIResponse(text);
}

// async function callAnthropic(prompt: string, apiKey: string): Promise<object | null> {
//   const response = await fetch(ANTHROPIC_ENDPOINT, {
//     method: "POST",
//     headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
//     body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1100, system: SYSTEM_MSG, messages: [{ role: "user", content: prompt }] }),
//   });
//   if (!response.ok) return null;
//   const data = await response.json();
//   return parseAIResponse(data.content?.[0]?.text ?? "");
// }

// ── Route handler ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const place = searchParams.get("place") ?? "";
  const operating_time = searchParams.get("operating_time") ?? "";
  const fee = searchParams.get("fee") ?? "";
  const subway = searchParams.get("subway") ?? "";
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const viewpointRaw = searchParams.get("viewpoint") ?? "";
  const viewpoints = viewpointRaw ? viewpointRaw.split("||").filter(Boolean) : [];
  const type = searchParams.get("type") ?? "";
  // 출력 언어 — 미전달 시 ko(하위 호환)
  const lang: Lang = searchParams.get("lang") === "en" ? "en" : "ko";
  const kit = promptKit(lang);

  // Server-side cache check — lang 포함해 언어별 응답 분리 저장
  const cacheKey = `${lang}||${place}||${operating_time}||${fee}||${subway}||${type}`;
  const cached = _serverCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SERVER_CACHE_TTL) {
    return NextResponse.json({ info: cached.data, cached: true });
  }

  // Fetch real data in parallel
  const [congestion, realEvents] = await Promise.allSettled([
    fetchCongestionMessage(place, isNaN(lat) ? undefined : lat, isNaN(lng) ? undefined : lng),
    fetchRealEvents(isNaN(lat) ? undefined : lat, isNaN(lng) ? undefined : lng),
  ]).then((results) => [
    results[0].status === "fulfilled" ? results[0].value : null,
    results[1].status === "fulfilled" ? results[1].value : [],
  ] as [string | null, AIEvent[]]);

  const nearbyPlaces =
    !isNaN(lat) && !isNaN(lng) ? findNearbyPlaces(lat, lng, place) : [];

  const prompt = kit.buildPrompt(place, operating_time, fee, subway, viewpoints, congestion, realEvents, type);

  const parsed = await callGemini(prompt, kit.SYSTEM_MSG).catch(() => null);

  const right_now = kit.buildRightNow(congestion);
  const event_pick = kit.buildEventPick(realEvents);

  if (parsed) {
    // 로컬 사용량 카운트 증가
    incrementAIUsage();

    const aiPart = parsed as Omit<AIPlaceInfo, "placeName" | "events" | "right_now" | "nearby" | "event_pick">;
    const info: AIPlaceInfo = {
      placeName: place,
      ...aiPart,
      right_now,
      nearby: nearbyPlaces.slice(0, 2),
      ...(event_pick && { event_pick }),
      events: realEvents.length > 0 ? realEvents : undefined,
    };
    _serverCache.set(cacheKey, { data: info, ts: Date.now() });
    return NextResponse.json({ info, _source: "ai" });
  }

  // Mock fallback (언어별 킷에서 생성)
  await new Promise((r) => setTimeout(r, 400));
  const info: AIPlaceInfo = kit.buildMockInfo({
    place,
    viewpoints,
    right_now,
    nearby: nearbyPlaces.slice(0, 2),
    event_pick,
    realEvents,
  });
  return NextResponse.json({ info, _source: "mock" });
}
