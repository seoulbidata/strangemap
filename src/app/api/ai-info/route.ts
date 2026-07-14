import { NextRequest, NextResponse } from "next/server";
import type { AIPlaceInfo, AIEvent } from "@/types/quest";
import { SEOUL_PLACES, type SeoulPlace } from "@/lib/seoulPlaces";
import { incrementAIUsage } from "@/lib/aiUsage";
import {
  extractJsonObjectText,
  generateGeminiJsonText,
  parseJsonWithEscapedControlChars,
} from "@/lib/gemini";
import type { AreaStatus, AreaWeather, PromptContext } from "./types";
import * as koKit from "./prompts.ko";
import * as enKit from "./prompts.en";

// Server-side cache: 30-min TTL
const _serverCache = new Map<string, { data: AIPlaceInfo; ts: number }>();
const SERVER_CACHE_TTL = 30 * 60 * 1000;

// ── Real data fetchers ──────────────────────────────────────────────────────

/** SEOUL_PLACES 매칭 — 이름 우선, 좌표 근접 폴백. 혼잡/날씨 조회와 큐레이션 설명 주입에 공용. */
function matchSeoulPlace(placeName: string, lat?: number, lng?: number): SeoulPlace | null {
  const byName = SEOUL_PLACES.find(
    (p) =>
      p.areaName.includes(placeName) ||
      placeName.includes(p.areaName) ||
      p.displayName.includes(placeName) ||
      placeName.includes(p.displayName)
  );
  if (byName) return byName;

  if (lat && lng) {
    let minDist = Infinity;
    let nearest: SeoulPlace | null = null;
    for (const p of SEOUL_PLACES) {
      const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
      if (d < minDist) {
        minDist = d;
        nearest = p;
      }
    }
    if (minDist <= 0.005) return nearest; // 근접 범위 밖이면 무관
  }
  return null;
}

async function fetchAreaStatus(areaName: string): Promise<AreaStatus | null> {
  const apiKey = process.env.SEOUL_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/citydata_ppltn/1/5/${encodeURIComponent(areaName)}`;
    const res = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const item = json["SeoulRtd.citydata_ppltn"]?.[0];
    if (!item) return null;

    // FCST_PPLTN — 예측 불가 시 배열이 아닌 문자열("예측값 없음")이 올 수 있음
    const rawFcst = item.FCST_PPLTN;
    const forecast = Array.isArray(rawFcst)
      ? rawFcst
          .slice(0, 4)
          .map((f: Record<string, string>) => ({
            time: f.FCST_TIME ?? "",
            level: f.FCST_CONGEST_LVL ?? "",
          }))
          .filter((f) => f.level && f.time)
      : [];

    return {
      level: item.AREA_CONGEST_LVL ?? "정보없음",
      msg: item.AREA_CONGEST_MSG ?? "",
      forecast,
    };
  } catch {
    return null;
  }
}

/** 날씨 — 전체 citydata 엔드포인트(응답이 무거움). 2초 타임아웃, 실패 시 조용히 무시. */
async function fetchAreaWeather(areaName: string): Promise<AreaWeather | null> {
  const apiKey = process.env.SEOUL_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/citydata/1/5/${encodeURIComponent(areaName)}`;
    const res = await fetch(url, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const w = json?.CITYDATA?.WEATHER_STTS?.[0];
    if (!w) return null;
    const weather: AreaWeather = {
      temp: w.TEMP || undefined,
      sky: w.SKY_STTS || undefined,
      pcpMsg: w.PCP_MSG || undefined,
      pm10Level: w.PM10_INDEX || undefined,
    };
    return weather.temp || weather.sky || weather.pcpMsg || weather.pm10Level ? weather : null;
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
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(2500),
    });
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
  const addr = searchParams.get("addr") ?? "";
  const bus = searchParams.get("bus") ?? "";
  const tel = searchParams.get("tel") ?? "";
  const parking = searchParams.get("parking") ?? "";
  const category = searchParams.get("category") ?? "";
  const spotCategory = searchParams.get("spot_category") ?? "";
  const bestTime = searchParams.get("best_time") ?? "";
  const date = searchParams.get("date") ?? "";
  const endDate = searchParams.get("end_date") ?? "";
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const viewpointRaw = searchParams.get("viewpoint") ?? "";
  const viewpoints = viewpointRaw ? viewpointRaw.split("||").filter(Boolean) : [];
  const type = searchParams.get("type") ?? "";
  // 테마코스 큐레이션 컨텍스트 (source === "theme_course"일 때만 전달됨)
  const courseTitle = searchParams.get("course_title") ?? "";
  const courseDesc = (searchParams.get("course_desc") ?? "").slice(0, 300);
  const courseTip = searchParams.get("course_tip") ?? "";
  const courseBestTime = searchParams.get("course_best_time") ?? "";
  const courseDuration = searchParams.get("course_duration") ?? "";
  // 출력 언어 — 미전달 시 ko(하위 호환)
  const lang: Lang = searchParams.get("lang") === "en" ? "en" : "ko";
  const kit = promptKit(lang);

  // Server-side cache check — 프롬프트에 들어가는 파라미터 전체를 키에 포함
  // (addr/lat/lng/viewpoint 제외: place와 중복이거나 고카디널리티)
  const cacheKey = [
    lang, place, type, operating_time, fee, subway,
    bus, tel, parking, category, spotCategory, bestTime, date,
    courseTitle, courseDesc,
  ].join("||");
  const cached = _serverCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SERVER_CACHE_TTL) {
    return NextResponse.json({ info: cached.data, cached: true });
  }

  // SEOUL_PLACES 매칭 → 혼잡/날씨 조회 + 큐레이션 설명 주입에 공용
  const matched = matchSeoulPlace(
    place,
    isNaN(lat) ? undefined : lat,
    isNaN(lng) ? undefined : lng
  );

  // Fetch real data in parallel (각 fetch에 개별 타임아웃 — 전체 레이턴시 방어)
  const [status, weather, realEvents] = await Promise.allSettled([
    matched ? fetchAreaStatus(matched.areaName) : Promise.resolve(null),
    matched ? fetchAreaWeather(matched.areaName) : Promise.resolve(null),
    fetchRealEvents(isNaN(lat) ? undefined : lat, isNaN(lng) ? undefined : lng),
  ]).then((results) => [
    results[0].status === "fulfilled" ? results[0].value : null,
    results[1].status === "fulfilled" ? results[1].value : null,
    results[2].status === "fulfilled" ? results[2].value : [],
  ] as [AreaStatus | null, AreaWeather | null, AIEvent[]]);

  if (status && weather) status.weather = weather;

  const nearbyPlaces =
    !isNaN(lat) && !isNaN(lng) ? findNearbyPlaces(lat, lng, place) : [];

  const promptCtx: PromptContext = {
    place,
    type: type || undefined,
    operating_time: operating_time || undefined,
    fee: fee || undefined,
    subway: subway || undefined,
    addr: addr || undefined,
    bus: bus || undefined,
    tel: tel || undefined,
    parking: parking || undefined,
    category: spotCategory || category || undefined,
    bestTime: bestTime || undefined,
    eventPeriod:
      type === "culture" && (date || endDate)
        ? [date, endDate].filter(Boolean).join(" ~ ")
        : undefined,
    viewpoints,
    status,
    realEvents,
    curated: matched
      ? { description: matched.description, category: matched.category }
      : undefined,
    course:
      courseTitle || courseDesc
        ? {
            title: courseTitle || undefined,
            description: courseDesc || undefined,
            tip: courseTip || undefined,
            bestTime: courseBestTime || undefined,
            duration: courseDuration || undefined,
          }
        : undefined,
  };

  const prompt = kit.buildPrompt(promptCtx);

  const parsed = await callGemini(prompt, kit.SYSTEM_MSG).catch(() => null);

  const right_now = kit.buildRightNow(status);
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
    bestTime: bestTime || undefined,
  });
  return NextResponse.json({ info, _source: "mock" });
}
