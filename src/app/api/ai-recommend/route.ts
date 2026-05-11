import { NextRequest, NextResponse } from "next/server";
import { SEOUL_PLACES } from "@/lib/seoulPlaces";

const KANANA_ENDPOINT = "https://kanana-o.a2s-endpoint.kr-central-2.kakaocloud.com/v1/chat/completions";
const SYSTEM_MSG = "당신은 서울시의 가이드이자 서울시 내의 컨텐츠를 추천하는 전문가입니다. 제공된 장소와 정보 안에서만 사용자 상황에 맞는 활동을 추천하세요. JSON 배열로만 응답하고 다른 텍스트는 출력하지 마세요.";

export interface Suggestion {
  title: string;
  place: string;
  duration: string;
  description: string;
  reason: string;
  tags: string[];
}

// ── Cache ────────────────────────────────────────────────────────────────────

const _suggestCache = new Map<string, { data: Suggestion[]; ts: number }>();
const SUGGEST_TTL = 10 * 60 * 1000;

// 혼잡도 캐시: 5분 TTL (실시간성 유지)
const _congestionCache = new Map<string, { level: string; ts: number }>();
const CONGESTION_TTL = 5 * 60 * 1000;

// ── 혼잡도 실제 API ──────────────────────────────────────────────────────────

type CongestionLevel = "여유" | "보통" | "약간 붐빔" | "붐빔" | "매우 붐빔" | "알 수 없음";

async function fetchOneCongestion(areaName: string, apiKey: string): Promise<CongestionLevel> {
  const cached = _congestionCache.get(areaName);
  if (cached && Date.now() - cached.ts < CONGESTION_TTL) {
    return cached.level as CongestionLevel;
  }
  try {
    const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/citydata_ppltn/1/1/${encodeURIComponent(areaName)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return "알 수 없음";
    const json = await res.json();
    const item = json["SeoulRtd.citydata_ppltn"]?.[0];
    const level: CongestionLevel = (item?.AREA_CONGEST_LVL as CongestionLevel) ?? "알 수 없음";
    _congestionCache.set(areaName, { level, ts: Date.now() });
    return level;
  } catch {
    return "알 수 없음";
  }
}

// 사용자 혼잡도 선호에 따른 허용 레벨
function isAcceptableCongestion(level: CongestionLevel, pref: string): boolean {
  if (pref === "상관없음") return true;
  if (level === "알 수 없음") return true; // 정보 없으면 허용
  if (pref === "여유") return level === "여유";
  if (pref === "보통") return level === "여유" || level === "보통";
  return true;
}

// 좌표 기반 서울 권역 분류
// 강동: lng >= 127.05 (성수, 건대, 잠실 등)
// 강서: lng < 126.94  (홍대, 마포, 여의도 등)
// 강남: lat < 37.52, 나머지 (강남역, 선릉, 서초 등)
// 강북: lat >= 37.52, 나머지 (경복궁, 광화문, 인사동, 명동 등)
function getRegion(lat: number, lng: number): string {
  if (lng >= 127.05) return "강동";
  if (lng < 126.94)  return "강서";
  if (lat < 37.52)   return "강남";
  return "강북";
}

function matchesRegion(lat: number, lng: number, regionPref: string): boolean {
  if (regionPref === "상관없음") return true;
  return getRegion(lat, lng) === regionPref;
}

// 후보 장소 필터링 + 혼잡도 실데이터 적용
async function buildCandidatePlaces(
  regionPref: string,
  congestionPref: string
): Promise<{ displayName: string; description: string; category: string; congestion?: string }[]> {
  const apiKey = process.env.SEOUL_API_KEY;

  // 1) 권역 필터
  const typeFiltered = SEOUL_PLACES.filter((p) => matchesRegion(p.lat, p.lng, regionPref));

  // 2) 혼잡도 필터가 "상관없음"이면 바로 반환 (API 호출 불필요)
  if (congestionPref === "상관없음" || !apiKey) {
    return typeFiltered.map((p) => ({
      displayName: p.displayName,
      description: p.description,
      category: p.category,
    }));
  }

  // 3) 실시간 혼잡도 병렬 조회 (최대 30곳, timeout 3s per call)
  const targets = typeFiltered.slice(0, 30);
  const congestionResults = await Promise.allSettled(
    targets.map((p) => fetchOneCongestion(p.areaName, apiKey))
  );

  const withCongestion = targets.map((p, i) => {
    const level: CongestionLevel =
      congestionResults[i].status === "fulfilled"
        ? (congestionResults[i] as PromiseFulfilledResult<CongestionLevel>).value
        : "알 수 없음";
    return { ...p, congestion: level };
  });

  // 4) 혼잡도 기준 필터
  const filtered = withCongestion.filter((p) => isAcceptableCongestion(p.congestion as CongestionLevel, congestionPref));

  // 5) 필터 결과가 너무 적으면 "알 수 없음" 포함 허용 (최소 5개 보장)
  const fallback = filtered.length < 5
    ? withCongestion.filter((p) => p.congestion === "알 수 없음" || filtered.includes(p))
    : filtered;

  return fallback.map((p) => ({
    displayName: p.displayName,
    description: p.description,
    category: p.category,
    congestion: p.congestion !== "알 수 없음" ? p.congestion : undefined,
  }));
}

// ── 문화생활 전용: 서울 행사 API ─────────────────────────────────────────────

async function fetchSeoulEvents(): Promise<string[]> {
  const apiKey = process.env.SEOUL_API_KEY;
  if (!apiKey) return [];
  try {
    const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/culturalEventInfo/1/20/`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    const rows: Record<string, string>[] = data?.culturalEventInfo?.row ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return rows
      .filter((r) => {
        if (!r.END_DATE) return true;
        return new Date(r.END_DATE.slice(0, 10)) >= today;
      })
      .slice(0, 10)
      .map((r) => {
        const desc = r.PROGRAM || r.ETC_DESC || "";
        return `${r.TITLE} (${r.PLACE ?? "서울"}, ${r.USE_FEE ?? "무료"})${desc ? ` - ${desc}` : ""}`;
      });
  } catch {
    return [];
  }
}

// ── KST 시각 ─────────────────────────────────────────────────────────────────

function getKSTContext(): { date: string; weekday: string; period: string } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const h = now.getUTCHours();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const period =
    h < 6 ? "새벽" : h < 11 ? "오전" : h < 14 ? "점심" : h < 18 ? "오후" : h < 21 ? "저녁" : "밤";
  return {
    date: `${now.getUTCMonth() + 1}월 ${now.getUTCDate()}일 ${h}시`,
    weekday: weekdays[now.getUTCDay()],
    period,
  };
}

// 나이대별 성향 힌트
function ageHint(ageGroup: string): string {
  if (ageGroup === "10-20대") return "트렌디하고 SNS 감성적인 장소, 저렴한 비용, 에너지 넘치는 활동 선호.";
  if (ageGroup === "20-30대") return "힙한 동네, 카페, 전시, 브런치, 야경 등 감성적인 공간 선호.";
  if (ageGroup === "30-40대") return "편안하고 여유로운 공간, 맛있는 음식, 문화적 경험을 중시함.";
  if (ageGroup === "40-50대") return "안전하고 품격 있는 장소 선호. 역사·자연 관련 관심 높음.";
  if (ageGroup === "60대 이상") return "접근성 좋고 걷기 편한 장소, 전통문화·자연 선호. 복잡한 번화가는 피해.";
  return "";
}

// ── 프롬프트 빌더 ─────────────────────────────────────────────────────────────

function buildPrompt(
  companion: string,
  ageGroup: string,
  time: string,
  purpose: string,
  region: string,
  congestionPref: string,
  candidates: { displayName: string; description: string; category: string; congestion?: string }[],
  events: string[],
  kstCtx: { date: string; weekday: string; period: string }
): string {
  // 후보 장소 목록 (혼잡도 정보 포함)
  const candidateLines = candidates
    .map((c) => {
      const congestionLabel = c.congestion ? ` [현재 혼잡도: ${c.congestion}]` : "";
      return `- ${c.displayName} (${c.category}, ${c.description})${congestionLabel}`;
    })
    .join("\n");

  // 혼잡도 지침
  const congestionRule =
    congestionPref === "여유"
      ? "혼잡도가 '여유'인 장소를 우선 선택해. 붐비는 곳은 배제해."
      : congestionPref === "보통"
      ? "혼잡도가 '여유' 또는 '보통'인 장소를 선택해."
      : "혼잡도는 상관없어.";

  // 문화생활: 행사 정보 블록
  const eventBlock =
    purpose === "문화생활" && events.length > 0
      ? `\n[현재 서울 진행 중인 문화행사 — 아래 목록에서 적합한 것을 추천에 포함해도 좋아]\n${events.join("\n")}`
      : "";

  return `서울에서 오늘 할 수 있는 활동 3가지를 추천해줘. JSON 배열만 응답.

[사용자 상황]
- 현재: ${kstCtx.date} (${kstCtx.weekday}요일 ${kstCtx.period})
- 누구랑: ${companion}
- 나이대: ${ageGroup} → ${ageHint(ageGroup)}
- 원하는 시간대: ${time}
- 목적: ${purpose}
- 원하는 위치: ${region !== "상관없음" ? `서울 ${region} 지역` : "서울 전역 상관없음"}
- 혼잡도 선호: ${congestionRule}${eventBlock}

[추천 가능한 장소 목록 — 반드시 이 목록에 있는 장소만 추천해. 목록 밖 장소는 절대 불가]
${candidateLines}

[규칙]
- 위 장소 목록에서만 골라서 추천. 목록에 없는 장소명은 사용 금지.
- place 필드에는 목록의 장소명을 그대로 사용해.
- 사용자 상황(누구랑·나이대·시간대·목적)에 딱 맞는 장소 위주로 선택.
- 팸플릿 문체 금지, 친구가 말하듯 자연스럽게.
- description은 2~3문장, reason은 이 조합에 특히 맞는 이유 1문장.
- tags는 핵심 키워드 3~4개.

[출력 형식 — 다른 텍스트 없이 JSON 배열만]
[
  {
    "title": "활동 제목",
    "place": "장소명 (목록 그대로)",
    "duration": "약 X시간",
    "description": "활동 설명 2~3문장",
    "reason": "이 상황에 특히 좋은 이유 1문장",
    "tags": ["태그1", "태그2", "태그3"]
  },
  { ... },
  { ... }
]`;
}

// ── AI 호출 ──────────────────────────────────────────────────────────────────

function parseAIResponse(text: string): Suggestion[] | null {
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (!arrMatch) return null;
  try {
    const parsed = JSON.parse(arrMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.slice(0, 3) as Suggestion[];
  } catch {
    return null;
  }
}

async function callKanana(prompt: string, apiKey: string): Promise<Suggestion[] | null> {
  const response = await fetch(KANANA_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "kanana-o",
      messages: [{ role: "system", content: SYSTEM_MSG }, { role: "user", content: prompt }],
      max_tokens: 1500,
    }),
  });
  if (!response.ok) { console.error("[Kanana:recommend] HTTP", response.status); return null; }
  const data = await response.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  console.log("[Kanana:recommend] raw:", text.slice(0, 200));
  return parseAIResponse(text);
}

async function callLMStudio(prompt: string): Promise<Suggestion[] | null> {
  const response = await fetch("http://127.0.0.1:1234/v1/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "kanana-1.5-8b-instruct-2505",
      prompt: `${SYSTEM_MSG}\n\n${prompt}\n\n답:\n`,
      max_tokens: 1500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    console.error("[LMStudio] HTTP", response.status);
    return null;
  }
  const data = await response.json();
  const text: string = data.choices?.[0]?.text ?? "";
  console.log("[LMStudio:recommend] raw:", text.slice(0, 200));
  return parseAIResponse(text);
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

const MOCK_FALLBACK: Suggestion[] = [
  {
    title: "청계천 산책 후 광장시장",
    place: "광화문·덕수궁",
    duration: "약 2시간",
    description: "조명 켜진 청계천을 따라 걷다 광장시장으로 연결돼. 빈대떡이랑 마약김밥은 필수 코스야.",
    reason: "부담 없이 걷고 먹기 좋은 실패 없는 서울 정석 코스.",
    tags: ["산책", "맛집", "무료"],
  },
  {
    title: "경복궁 관람",
    place: "경복궁",
    duration: "약 1시간 30분",
    description: "서울의 대표 궁궐로 조선시대 건축을 한눈에 볼 수 있어. 역사적 분위기가 깊은 곳이야.",
    reason: "서울에서 역사·문화를 제대로 느낄 수 있는 필수 코스.",
    tags: ["역사", "문화", "관광"],
  },
  {
    title: "성수 카페 투어",
    place: "성수카페거리",
    duration: "약 3시간",
    description: "공장을 개조한 독특한 카페들이 즐비해. 골목마다 숨겨진 감성 공간이 있어서 탐험하는 재미가 있어.",
    reason: "서울에서 가장 트렌디한 동네로 감성적인 시간을 보내기에 딱 맞아.",
    tags: ["카페", "감성", "힙한"],
  },
];

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const companion: string  = body.companion  ?? "친구";
  const ageGroup: string   = body.ageGroup   ?? "20-30대";
  const time: string       = body.time       ?? "오후";
  const purpose: string    = body.purpose    ?? "관광";
  const region: string     = body.region     ?? "상관없음";
  const congestion: string = body.congestion ?? "상관없음";

  const cacheKey = `${companion}|${ageGroup}|${time}|${purpose}|${region}|${congestion}`;
  const cached = _suggestCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SUGGEST_TTL) {
    return NextResponse.json({ suggestions: cached.data, cached: true });
  }

  // 병렬 실행: 후보 장소(혼잡도 포함) + 문화생활일 때만 행사 API
  const [candidates, events] = await Promise.all([
    buildCandidatePlaces(region, congestion),
    purpose === "문화생활" ? fetchSeoulEvents().catch(() => []) : Promise.resolve([]),
  ]);

  console.log(`[recommend] candidates: ${candidates.length}개, events: ${events.length}개, purpose: ${purpose}`);

  const kstCtx = getKSTContext();
  const prompt = buildPrompt(companion, ageGroup, time, purpose, region, congestion, candidates, events, kstCtx);

  const kananaKey = process.env.KANANA_API_KEY;
  let suggestions: Suggestion[] | null = null;
  if (kananaKey) {
    suggestions = await callKanana(prompt, kananaKey).catch(() => null);
    console.log("[Kanana:recommend] result:", suggestions ? `${suggestions.length}개` : "null");
  }
  if (!suggestions) {
    suggestions = await callLMStudio(prompt).catch(() => null);
    console.log("[LMStudio:recommend] result:", suggestions ? `${suggestions.length}개` : "null → mock fallback");
  }

  if (suggestions) {
    // 화이트리스트 검증: 응답 장소가 실제 후보 목록에 있는지 확인
    const validNames = new Set(candidates.map((c) => c.displayName));
    const validated = suggestions.filter((s) =>
      validNames.has(s.place) || candidates.some((c) => s.place.includes(c.displayName))
    );

    const final = validated.length > 0 ? validated : suggestions; // 검증 실패해도 AI 결과 사용
    _suggestCache.set(cacheKey, { data: final, ts: Date.now() });
    return NextResponse.json({
      suggestions: final,
      _source: "ai",
      _candidateCount: candidates.length,
      _eventsUsed: events.length > 0,
    });
  }

  return NextResponse.json({ suggestions: MOCK_FALLBACK, _source: "mock" });
}
