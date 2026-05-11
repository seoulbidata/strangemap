import { NextRequest, NextResponse } from "next/server";
import type { AIPlaceInfo, AIEvent } from "@/types/quest";
import { SEOUL_PLACES } from "@/lib/seoulPlaces";
import { callKananaWithFallback } from "@/lib/kanana";

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

function getKSTContext(): { now: string; weekday: string; period: string; h: number; isWeekend: boolean } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC+9
  const h = now.getUTCHours();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const dow = now.getUTCDay();
  const period =
    h < 6 ? "새벽" : h < 11 ? "오전" : h < 14 ? "점심" : h < 18 ? "오후" : h < 21 ? "저녁" : "밤";
  return {
    now: `${now.getUTCMonth() + 1}월 ${now.getUTCDate()}일 ${h}시`,
    weekday: weekdays[dow],
    period,
    h,
    isWeekend: dow === 0 || dow === 6,
  };
}

function buildRightNow(congestion: string | null, period: string, weekday: string, isWeekend: boolean): string {
  const level = congestion?.split(":")?.[0]?.trim() ?? null;
  const timeCtx = `${weekday}요일 ${period}`;

  if (!level || level === "정보없음") {
    return `${timeCtx}이에요. 방문 전 운영 시간을 확인해보세요.`;
  }
  if (level === "여유") {
    return `지금 (${timeCtx}) 한산해요. 여유롭게 즐기기 딱 좋은 타이밍입니다.`;
  }
  if (level === "보통") {
    return `지금 (${timeCtx}) 적당한 혼잡도예요. 편하게 둘러볼 수 있어요.`;
  }
  if (level === "약간 붐빔") {
    const avoidTip = isWeekend ? "평일 오전이 훨씬 여유로워요." : "이른 오전이나 저녁 시간대를 노려보세요.";
    return `지금 (${timeCtx}) 약간 붐비는 편이에요. ${avoidTip}`;
  }
  if (level === "붐빔") {
    return `지금 (${timeCtx}) 꽤 붐빕니다. 1~2시간 후나 이른 오전 방문을 추천해요.`;
  }
  if (level === "매우 붐빔") {
    return `지금 (${timeCtx}) 매우 붐비는 상태예요. 가능하면 다른 시간대에 방문하는 걸 추천합니다.`;
  }
  return `${timeCtx} 기준으로 방문 가능한 시간대입니다.`;
}

function buildEventPick(events: AIEvent[]): string | undefined {
  if (events.length === 0) return undefined;
  const e = events[0];
  const distStr = e._distKm ? `${e._distKm}km 거리의 ` : "";
  const periodStr = e.period ? ` (${e.period})` : "";
  return `${distStr}${e.title}${periodStr}와 함께 들러보면 더 알찬 하루가 될 거예요.`;
}
 
function buildPrompt(
  place: string,
  operating_time: string,
  fee: string,
  subway: string,
  viewpoints: string[],
  congestion: string | null,
  realEvents: AIEvent[],
  type?: string
): string {
  const { now, weekday, period } = getKSTContext();

  const ctx: string[] = [`현재: ${now} (${weekday}요일 ${period})`];
  if (operating_time) ctx.push(`운영: ${operating_time}`);
  if (fee) ctx.push(`요금: ${fee}`);
  if (subway) ctx.push(`교통: ${subway}`);
  if (congestion) ctx.push(`실시간 혼잡: ${congestion}`);

  const viewpointBlock =
    viewpoints.length > 0
      ? `\n[공식 뷰포인트] ${viewpoints.slice(0, 3).join(" / ")}`
      : "";

  const eventBlock =
    realEvents.length > 0
      ? `\n[현재 진행 중인 인근 행사]\n${realEvents
          .slice(0, 3)
          .map(
            (e, i) =>
              `${i + 1}. ${e.title}${e._distKm ? ` (${e._distKm}km)` : ""}${
                e.period ? ` · ${e.period}` : ""
              }${e.desc ? ` · ${e.desc}` : ""}`
          )
          .join("\n")}`
      : "";

  const hasViewpoint = viewpoints.length > 0;

  const isCulture = type === "culture";

  const summaryRule = isCulture
    ? "- summary: 이 행사가 무엇인지 3~4문장으로 설명. 행사 성격, 주요 프로그램, 관람 대상을 포함. 감상·감정 표현 금지, 사실 중심으로."
    : "- summary: 이 장소에 대한 정보, 분위기, 감상을 담아 3~4문장. \"여기 가면 ○○를 할 수 있다\"가 아니라 \"실제로 와보면 이런 느낌이다\"를 전달. 어떤 사람에게 특히 맞는지 포함.";

  const highlightsRule = isCulture
    ? "- highlights: 이 행사의 주요 프로그램·콘텐츠·볼거리 3~4개. 구체적으로 나열. 추상적 키워드 금지."
    : "- highlights: 이 장소에서만 할 수 있는 구체적인 행동/경험. 추상적 키워드 금지.";

  return `서울 "${place}"를 처음 방문하는 사람에게 소개해줘. 아래 컨텍스트만 사용하고 추측 금지. JSON만 응답.

[컨텍스트]
${ctx.join("\n")}${viewpointBlock}${eventBlock}

[rule]
- 컨텍스트에 없는 구체적 사실(연도·수치·고유명사) 절대 추측 금지. 모르면 해당 필드 생략.
- 톤: 서울시에 오래 산 현지인이 친구에게 말하듯. 팸플릿·홍보 문체 금지.
${summaryRule}
${highlightsRule}
- crowd_tip: 실시간 혼잡 데이터가 있으면 반드시 반영.

[출력 형식 — 이 키만, 정확히]
{
  "summary": "분위기·감성·핵심 경험 3~4문장",
  "highlights": ["구체적 경험 3~4개"],
  "tip": "현지인만 아는 실용 꿀팁 1문장",
  "best_time": "최적 방문 타이밍은 언제인지 이유 1문장",
  "crowd_tip": "혼잡 회피 전략 1문장"${hasViewpoint ? ',\n  "viewpoint_guide": "뷰포인트 감상법 1문장"' : ""},
  "vibe": ["분위기 키워드 2~3개"],
  "tags": ["성격 태그 4~6개"]
}

[예시 응답]
{"summary": "지상 17미터 위로 올라가면 꽉 막힌 차도 대신 예쁜 공중 정원이 쫙 펼쳐져. 발밑으로는 차들이 쌩쌩 달리는데, 내 주변은 식물들로 가득해서 기분이 엄청 묘하고 신기해. 해 질 녘에 파란색 조명이 켜질 때쯤 걸으면 분위기가 확 달라져서, 복잡한 도심 한복판에서 조용히 밤산책하고 싶은 사람한테 완전 딱이야.",
  "highlights": [
    "투명 유리 바닥 위에서 발밑으로 지나가는 차들 구경하기",
    "문화역서울 284 옛날 지붕을 배경으로 레트로한 인증샷 남기기",
    "내 이름 초성이랑 똑같은 이름표를 단 식물 찾아보기"
  ],
  "tip": "중간중간 있는 원형 화분 벤치에 앉아서 커피 한잔하면서 야경 보는 게 진짜 힐링이야.",
  "best_time": "야간 조명이 파랗게 켜지고 주변 빌딩 불빛이 들어오는 저녁 7시 이후가 제일 예뻐.",
  "crowd_tip": "주말 오후엔 사람이 은근히 많아서, 사진 제대로 찍으려면 평일 저녁이나 아예 늦은 밤에 가는 걸 추천해.",
  "viewpoint_guide": "서울역 광장 쪽을 정면으로 내려다보는 난간 쪽이 차 궤적 사진 찍기 좋은 명당이야.",
  "vibe": ["묘한", "도심속여유", "은하수같은"],
  "tags": ["도심탐험", "야경명소", "산책로", "재생건축", "데이트"]}`;
}
 
// ── AI callers ──────────────────────────────────────────────────────────────

const SYSTEM_MSG =
  "당신은 서울시 장소를 모두 알고 있는 로컬 가이드입니다. 확실히 아는 사실만 담아, 처음 방문하는 사람에게 솔직하고 생생하게 이 장소를 소개해주세요. 반드시 JSON 형식으로만 응답하세요.";

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
  const response = await fetch("http://127.0.0.1:1234/v1/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "kanana-1.5-8b-instruct-2505",
      prompt: `${SYSTEM_MSG}\n\n${prompt}\n\n답:\n`,
      max_tokens: 1100,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    console.error("[LMStudio] HTTP", response.status);
    return null;
  }
  const data = await response.json();
  const text: string = data.choices?.[0]?.text ?? "";
  console.log("[LMStudio] response:", text.slice(0, 100));
  return parseAIResponse(text);
}

async function callKanana(prompt: string): Promise<object | null> {
  const text = await callKananaWithFallback(
    [{ role: "system", content: SYSTEM_MSG }, { role: "user", content: prompt }],
    1100
  );
  if (!text) return null;
  return parseAIResponse(text);
}

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
  const type = searchParams.get("type") ?? "";

  // Server-side cache check
  const cacheKey = `${place}||${operating_time}||${fee}||${subway}||${type}`;
  const cached = _serverCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SERVER_CACHE_TTL) {
    return NextResponse.json({ info: cached.data, cached: true });
  }

  const kananaKey = process.env.KANANA_API_KEY;

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

  const prompt = buildPrompt(place, operating_time, fee, subway, viewpoints, congestion, realEvents, type);

  let parsed: object | null = null;
  if (kananaKey) {
    parsed = await callKanana(prompt).catch(() => null);
    console.log("[Kanana] result:", parsed ? "OK" : "null");
  }
  if (!parsed) {
    parsed = await callLMStudio(prompt).catch(() => null);
    console.log("[LMStudio] result:", parsed ? "OK" : "null (mock fallback)");
  }

  const { period, weekday, isWeekend } = getKSTContext();
  const right_now = buildRightNow(congestion, period, weekday, isWeekend);
  const event_pick = buildEventPick(realEvents);

  if (parsed) {
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

  // Mock fallback
  await new Promise((r) => setTimeout(r, 400));
  const info: AIPlaceInfo = {
    placeName: place || "알 수 없는 장소",
    summary: `${place}는 서울의 대표적인 명소입니다. 야간에 특히 아름다운 경관을 자랑하며 많은 이들이 찾는 곳입니다.`,
    highlights: ["서울의 빛나는 야경을 한눈에", "사진 명소로 인기", "야간 산책 코스로 최적"],
    tip: "일몰 직후 30분이 가장 아름다운 황금시간대입니다.",
    best_time: "늦가을~초겨울(10~12월) 맑은 날 저녁이 가장 좋습니다.",
    crowd_tip: "평일 저녁이 주말보다 훨씬 여유롭습니다.",
    right_now,
    nearby: nearbyPlaces.slice(0, 2),
    ...(event_pick && { event_pick }),
    ...(viewpoints.length > 0 && { viewpoint_guide: viewpoints[0] }),
    ...(realEvents.length > 0 && { events: realEvents }),
    tags: ["야경", "서울", "포토스팟"],
  };
  return NextResponse.json({ info, _source: "mock" });
}
