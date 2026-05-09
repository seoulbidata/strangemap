import { NextRequest, NextResponse } from "next/server";
import type { AIPlaceInfo, AIEvent } from "@/types/quest";
import { SEOUL_PLACES } from "@/lib/seoulPlaces";

const LMSTUDIO_ENDPOINT = "http://127.0.0.1:1234/v1/chat/completions";

// const KANANA_ENDPOINT =
//   "https://kanana-o.a2s-endpoint.kr-central-2.kakaocloud.com/v1/chat/completions";
// const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
// const GEMINI_MODELS = ["gemini-flash-latest", "gemini-2.0-flash"];
// const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const withDist = rows
      .filter((r) => {
        if (!r.LAT || !r.LOT || parseFloat(r.LAT) === 0) return false;
        if (r.END_DATE) {
          const end = new Date(r.END_DATE.slice(0, 10));
          if (end < today) return false;
        }
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

// ── Prompt builder ──────────────────────────────────────────────────────────

function getKSTContext(): { now: string; weekday: string; period: string } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC+9
  const h = now.getUTCHours();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const period =
    h < 6 ? "새벽" : h < 11 ? "오전" : h < 14 ? "점심" : h < 18 ? "오후" : h < 21 ? "저녁" : "밤";
  return {
    now: `${now.getUTCMonth() + 1}월 ${now.getUTCDate()}일 ${h}시`,
    weekday: weekdays[now.getUTCDay()],
    period,
  };
}
 
function buildPrompt(
  place: string,
  operating_time: string,
  fee: string,
  subway: string,
  viewpoints: string[],
  congestion: string | null,
  nearbyPlaces: string[],
  realEvents: AIEvent[]
): string {
  const { now, weekday, period } = getKSTContext();
 
  // 컨텍스트 라인을 짧게 압축
  const ctx: string[] = [`현재: ${now} (${weekday}요일 ${period})`];
  if (operating_time) ctx.push(`운영: ${operating_time}`);
  if (fee) ctx.push(`요금: ${fee}`);
  if (subway) ctx.push(`교통: ${subway}`);
  if (congestion) ctx.push(`실시간 혼잡: ${congestion}`);
 
  const viewpointBlock =
    viewpoints.length > 0
      ? `\n[공식 뷰포인트] ${viewpoints.slice(0, 3).join(" / ")}`
      : "";
 
  const nearbyBlock =
    nearbyPlaces.length > 0
      ? `\n[도보권 후보] ${nearbyPlaces.join(", ")}`
      : "";
 
  const eventBlock =
    realEvents.length > 0
      ? `\n[현재 진행 중인 인근 행사]\n${realEvents
          .slice(0, 3)
          .map(
            (e, i) =>
              `${i + 1}. ${e.title}${e._distKm ? ` (${e._distKm}km)` : ""}${
                e.period ? ` · ${e.period}` : ""
              }`
          )
          .join("\n")}`
      : "";
 
  const hasViewpoint = viewpoints.length > 0;
  const hasEvents = realEvents.length > 0;
 
  return `서울 "${place}" 소개. 아래 컨텍스트만 사용하고 추측 금지. JSON만 응답.
 
[컨텍스트]
${ctx.join("\n")}${viewpointBlock}${nearbyBlock}${eventBlock}
 
[규칙]
- 컨텍스트에 없는 사실(연도·역사·이름) 절대 추측 금지. 모르면 해당 필드 생략.
- 톤: 서울 로컬이 친구에게 말하듯, 팸플릿 문체 금지.
- right_now는 "현재" 시각·요일·혼잡도를 종합해 "지금 가도 되는지" 한 줄.
- crowd_tip은 실시간 혼잡 데이터가 있으면 반드시 반영.
 
[출력 형식 — 이 키만, 정확히]
{
  "summary": "여기에 가면 좋은 이유 3문장",
  "right_now": "현재 시각 기준 지금 가기 좋은지 1문장",
  "highlights": ["구체적 경험 2~4개"],
  "tip": "실용 꿀팁 1문장",
  "best_time": "최적 방문 타이밍 1문장",
  "crowd_tip": "혼잡 회피 전략 1문장"${hasViewpoint ? ',\n  "viewpoint_guide": "뷰포인트 감상법 1문장"' : ""}${hasEvents ? ',\n  "event_pick": "위 행사 중 함께 가면 좋은 1개와 그 이유 1문장 (없으면 생략)"' : ""},
  "nearby": ["도보 후보 중 1~2개만"],
  "vibe": ["분위기 키워드 2~3개"],
  "tags": ["성격 태그 4~6개"]
}
 
[예시 응답]
{"summary":"한강 야경 명소로 다리 위에서 강바람 맞으며 걷기 좋은 곳. 노을부터 야경까지 풍경이 계속 바뀐다.","right_now":"평일 오후라 한산할 때, 산책하기 좋다.","highlights":["다리 위 보행로 산책","한강 일몰 감상","야간 조명 포토스팟"],"tip":"중간 전망대 벤치에서 쉬면서 보는 게 제일 좋다.","best_time":"일몰 30분 전부터 1시간이 베스트.","crowd_tip":"주말 저녁은 붐비니 평일이나 일몰 직전이 여유롭다.","nearby":["여의도공원"],"vibe":["탁 트인","로맨틱"],"tags":["야경","한강","산책","포토스팟","무료"]}`;
}
 
// ── AI callers ──────────────────────────────────────────────────────────────

const SYSTEM_MSG =
  "당신은 서울시의 로컬 가이드입니다. 확실히 아는 사실만 담아, 처음 방문하는 사람에게 솔직하고 생생하게 장소를 소개해주세요. 반드시 JSON 형식으로만 응답하세요.";

function parseAIResponse(text: string): object | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

async function callLMStudio(prompt: string): Promise<object | null> {
  const response = await fetch(LMSTUDIO_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: SYSTEM_MSG },
        { role: "user", content: prompt },
      ],
      max_tokens: 1100,
    }),
  });

  if (!response.ok) {
    console.error("[LMStudio] HTTP", response.status);
    return null;
  }
  const data = await response.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  console.log("[LMStudio] response:", text.slice(0, 100));
  return parseAIResponse(text);
}

// async function callKanana(prompt: string, apiKey: string): Promise<object | null> {
//   const response = await fetch(KANANA_ENDPOINT, {
//     method: "POST",
//     headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
//     body: JSON.stringify({ model: "kanana-o", messages: [{ role: "system", content: SYSTEM_MSG }, { role: "user", content: prompt }], max_tokens: 1100 }),
//   });
//   if (!response.ok) return null;
//   const data = await response.json();
//   return parseAIResponse(data.choices?.[0]?.message?.content ?? "");
// }

// async function callGemini(prompt: string, apiKey: string): Promise<object | null> {
//   for (const model of GEMINI_MODELS) {
//     const endpoint = `${GEMINI_BASE}/${model}:generateContent`;
//     const response = await fetch(endpoint, {
//       method: "POST",
//       headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
//       body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_MSG }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1100, responseMimeType: "application/json" } }),
//     });
//     if (!response.ok) { console.error(`[Gemini:${model}] HTTP`, response.status); continue; }
//     const data = await response.json();
//     const parsed = parseAIResponse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
//     if (parsed) return parsed;
//   }
//   return null;
// }

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

  // Server-side cache check
  const cacheKey = `${place}||${operating_time}||${fee}||${subway}`;
  const cached = _serverCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SERVER_CACHE_TTL) {
    return NextResponse.json({ info: cached.data, cached: true });
  }

  // const kananaKey = process.env.KANANA_API_KEY;
  // const geminiKey = process.env.GEMINI_API_KEY;
  // const anthropicKey = process.env.ANTHROPIC_API_KEY;

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

  const prompt = buildPrompt(place, operating_time, fee, subway, viewpoints, congestion, nearbyPlaces, realEvents);

  let parsed: object | null = null;
  parsed = await callLMStudio(prompt).catch(() => null);
  console.log("[AI] final parsed:", parsed ? "OK" : "null (mock fallback)");
  // if (kananaKey) {
  //   parsed = await callKanana(prompt, kananaKey).catch((e) => { console.error("[Kanana] error:", e); return null; });
  //   console.log("[Kanana] result:", parsed ? "OK" : "null");
  // }
  // if (!parsed && geminiKey) parsed = await callGemini(prompt, geminiKey).catch(() => null);
  // if (!parsed && anthropicKey) parsed = await callAnthropic(prompt, anthropicKey).catch(() => null);

  if (parsed) {
    const aiPart = parsed as Omit<AIPlaceInfo, "placeName" | "events">;
    const info: AIPlaceInfo = {
      placeName: place,
      ...aiPart,
      events: realEvents.length > 0 ? realEvents : (aiPart as AIPlaceInfo).events,
    };
    _serverCache.set(cacheKey, { data: info, ts: Date.now() });
    return NextResponse.json({ info, _source: "ai" });
  }

  // Mock fallback
  await new Promise((r) => setTimeout(r, 400));
  const info: AIPlaceInfo = {
    placeName: place || "알 수 없는 장소",
    summary: `${place}는 서울의 대표적인 명소입니다. 야간에 특히 아름다운 경관을 자랑하며 많은 이들이 찾는 곳입니다.`,
    highlights: ["서울의 빛나는 야경을 한눈에", "사진 명소로 인기", "야간 산책 코스로 최적"],
    tip: "일몰 직후 30분이 가장 아름다운 황금시간대입니다.",
    best_time: "늦가을~초겨울(10~12월) 맑은 날 저녁이 가장 좋습니다.",
    crowd_tip: "평일 저녁이 주말보다 훨씬 여유롭습니다.",
    ...(viewpoints.length > 0 && { viewpoint_guide: viewpoints[0] }),
    ...(realEvents.length > 0 && { events: realEvents }),
    nearby: nearbyPlaces.slice(0, 2),
    tags: ["야경", "서울", "포토스팟"],
  };
  return NextResponse.json({ info, _source: "mock" });
}
