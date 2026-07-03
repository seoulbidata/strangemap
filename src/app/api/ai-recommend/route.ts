import { NextRequest, NextResponse } from "next/server";
import { SEOUL_PLACES } from "@/lib/seoulPlaces";
import { incrementAIUsage } from "@/lib/aiUsage";
import { haversineKm, selectCluster } from "@/lib/courseRouting";
import {
  extractJsonArrayText,
  generateGeminiJsonText,
  parseJsonWithEscapedControlChars,
} from "@/lib/gemini";

const SYSTEM_MSG = "당신은 서울시의 가이드이자 서울시 내의 컨텐츠를 추천하는 전문가입니다. 제공된 장소와 정보 안에서만 사용자 상황에 맞는 활동을 추천하세요. JSON 배열로만 응답하고 다른 텍스트는 출력하지 마세요.";

const SUGGESTION_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      place: { type: "STRING" },
      duration: { type: "STRING" },
      description: { type: "STRING" },
      reason: { type: "STRING" },
      tags: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["title", "place", "duration", "description", "reason", "tags"],
  },
};

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

// 시간대 → 영업시간(operatingHours) 적합성
function isOpenForTime(hours: { start: number; end: number }, time: string): boolean {
  const { start, end } = hours;
  if (start === 0 && end === 24) return true; // 24시간 운영
  if (time === "오전") return start <= 11;
  if (time === "오후") return start <= 16 && end >= 17;
  if (time === "밤") return end >= 20 || end === 24;
  return true;
}

// 목적 → 선호 장소 카테고리 가중치 (SeoulPlace.category 기준)
const PURPOSE_CATEGORY_WEIGHT: Record<string, Partial<Record<string, number>>> = {
  "힐링":     { "공원·자연": 3, "한강": 3, "야경·전망": 1 },
  "데이트":   { "야경·전망": 3, "한강": 3, "공원·자연": 2, "상권·역세권": 1 },
  "관광":     { "관광·역사": 3, "야경·전망": 2, "공원·자연": 1 },
  "놀거리":   { "상권·역세권": 3, "한강": 1 },
  "문화생활": { "관광·역사": 3, "상권·역세권": 1 },
};

const CLUSTER_RADIUS_KM = 3.0; // 군집 반경 — 도보·짧은 이동 가능 범위
const CLUSTER_MAX = 12;        // 프롬프트로 넘길 후보 상한

export interface Candidate {
  areaName: string;
  displayName: string;
  description: string;
  category: string;
  lat: number;
  lng: number;
  congestion?: string;
}

// 후보 장소 필터링: 권역 → 시간대(영업시간) → 거리·목적 군집 → 실시간 혼잡도
async function buildCandidatePlaces(
  regionPref: string,
  congestionPref: string,
  time: string,
  purpose: string
): Promise<Candidate[]> {
  const apiKey = process.env.SEOUL_API_KEY;

  // 1) 권역 필터
  const inRegion = SEOUL_PLACES.filter((p) => matchesRegion(p.lat, p.lng, regionPref));

  // 2) 시간대 필터(영업시간) — 너무 적게 남으면(6곳 미만) 완화해 빈손 방지
  const timeFiltered = inRegion.filter((p) => isOpenForTime(p.operatingHours, time));
  const afterTime = timeFiltered.length >= 6 ? timeFiltered : inRegion;

  // 3) 거리·목적 기반 군집 선택 (가중치·반경은 목적 파라미터에서 유도)
  const clustered = selectCluster(afterTime, PURPOSE_CATEGORY_WEIGHT[purpose] ?? {}, {
    radiusKm: CLUSTER_RADIUS_KM,
    max: CLUSTER_MAX,
  });

  const toCand = (p: (typeof clustered)[number], congestion?: string): Candidate => ({
    areaName: p.areaName,
    displayName: p.displayName,
    description: p.description,
    category: p.category,
    lat: p.lat,
    lng: p.lng,
    congestion,
  });

  // 4) 혼잡도 "상관없음" 또는 키 없으면 군집 그대로
  if (congestionPref === "상관없음" || !apiKey) {
    return clustered.map((p) => toCand(p));
  }

  // 5) 군집 장소만 실시간 혼잡도 조회 (≤12곳)
  const results = await Promise.allSettled(
    clustered.map((p) => fetchOneCongestion(p.areaName, apiKey))
  );
  const withCongestion = clustered.map((p, i) => ({
    p,
    level: (results[i].status === "fulfilled"
      ? (results[i] as PromiseFulfilledResult<CongestionLevel>).value
      : "알 수 없음") as CongestionLevel,
  }));

  // 6) 혼잡도 허용 필터 — 4곳 미만이면 '알 수 없음' 포함해 완화
  const ok = withCongestion.filter((x) => isAcceptableCongestion(x.level, congestionPref));
  const finalSet =
    ok.length >= 4 ? ok : withCongestion.filter((x) => x.level === "알 수 없음" || ok.includes(x));

  return finalSet.map((x) => toCand(x.p, x.level !== "알 수 없음" ? x.level : undefined));
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
  placeCount: number,
  candidates: Candidate[],
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

  return `서울에서 오늘 할 수 있는 활동 ${placeCount}가지를 추천해줘. JSON 배열만 응답.

[
  사용자 상황]
- 현재: ${kstCtx.date} (${kstCtx.weekday}요일 ${kstCtx.period})
- 누구랑: ${companion}
- 나이대: ${ageGroup} → ${ageHint(ageGroup)}
- 원하는 시간대: ${time}
- 목적: ${purpose}
- 원하는 위치: ${region !== "상관없음" ? `서울 ${region} 지역` : "서울 전역 상관없음"}
- 혼잡도 선호: ${congestionRule}${eventBlock}

[추천 가능한 장소 목록 — 모두 서로 가까운 한 지역에 모여 있음. 반드시 이 목록에 있는 장소만 추천]
${candidateLines}

[규칙]
- 위 장소 목록에서만 골라서 추천. 목록에 없는 장소명은 사용 금지.
- place 필드에는 목록의 장소명을 그대로 사용해.
- 위 장소들은 서로 가까우니, 도보나 한두 정거장 이동으로 자연스럽게 이어지는 ${placeCount}곳을 골라줘. 반드시 서로 다른 ${placeCount}곳이어야 해.
- 동선이 왔다 갔다 하지 않고 한 방향으로 흐르도록, 첫 곳 → 마지막 곳 순서를 정해서 배열에 담아줘.
- 선택한 곳은 모두 '${time}' 시간대에 실제로 문을 여는 곳이어야 해.
- 사용자 상황(누구랑·나이대·시간대·목적)에 딱 맞는 장소 위주로 선택.
- 팸플릿이나 기계적인 문체는 엄격히 금지하며, 그 동네를 잘 아는 친근한 서울 토박이 친구가 조근조근 말해주는 듯 다정한 어조로 작성해줘.
- title: 단순한 장소명 나열이 아닌, 사용자가 클릭하고 싶게 만드는 호기심 자극형 감성 제목(예: "해 질 녘 골목길을 따라 걷는 힐링 산책")으로 참신하게 지어줘.
- description: 친근하고 다정한 친구 말투로 장소의 매력과 현장 분위기를 딱 2~3문장으로 생생하게 작성해줘. 단순히 사실만 나열하지 말고 핵심 감성 묘사를 가미해 충분히 매력적이면서도 너무 장황하지 않도록 명료하고 알차게 채워줘.
- reason: 현재 상황(시간대·동행인·목적)에 이 장소가 왜 찰떡궁합인지 다정하고 설득력 있게 딱 1문장으로 적어줘.
- tags: 핵심 키워드 3~4개.

[출력 형식 — 다른 텍스트 없이 원소 ${placeCount}개짜리 JSON 배열만]
[
  {
    "title": "활동 제목",
    "place": "장소명 (목록 그대로)",
    "duration": "약 X시간",
    "description": "활동 설명 딱 2~3문장 (너무 장황하지 않고 생생하게)",
    "reason": "이 상황에 특히 좋은 이유 딱 1문장",
    "tags": ["태그1", "태그2", "태그3"]
  },
  ...(총 ${placeCount}개)
]`;
}

// ── AI 호출 ──────────────────────────────────────────────────────────────────

function parseAIResponse(text: string, placeCount: number): Suggestion[] | null {
  const arrText = extractJsonArrayText(text);
  if (!arrText) return null;
  const parsed = parseJsonWithEscapedControlChars<unknown>(arrText);
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  return parsed.slice(0, placeCount) as Suggestion[];
}

async function callGemini(prompt: string, placeCount: number): Promise<Suggestion[] | null> {
  const text = await generateGeminiJsonText({
    prompt,
    systemInstruction: SYSTEM_MSG,
    maxOutputTokens: 2500 + (placeCount - 3) * 700, // 스톱 수에 비례해 출력 여유 확보
    responseSchema: SUGGESTION_SCHEMA,
  });
  if (!text) return null;
  console.log("[Gemini:recommend] raw:", text.slice(0, 200));
  return parseAIResponse(text, placeCount);
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
  // 코스에 담을 장소 수(3~5, 기본 3) — 미전달 시 기존 동작과 동일(하위 호환)
  const placeCount: number = Math.min(5, Math.max(3, Number(body.placeCount) || 3));

  const cacheKey = `${companion}|${ageGroup}|${time}|${purpose}|${region}|${congestion}|${placeCount}`;
  const cached = _suggestCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SUGGEST_TTL) {
    return NextResponse.json({ suggestions: cached.data, cached: true });
  }

  // 병렬 실행: 후보 장소(혼잡도 포함) + 문화생활일 때만 행사 API
  const [candidates, events] = await Promise.all([
    buildCandidatePlaces(region, congestion, time, purpose),
    purpose === "문화생활" ? fetchSeoulEvents().catch(() => []) : Promise.resolve([]),
  ]);

  console.log(`[recommend] candidates: ${candidates.length}개, events: ${events.length}개, purpose: ${purpose}`);

  const kstCtx = getKSTContext();
  const prompt = buildPrompt(companion, ageGroup, time, purpose, region, congestion, placeCount, candidates, events, kstCtx);

  const suggestions = await callGemini(prompt, placeCount).catch(() => null);

  if (suggestions) {
    // 로컬 사용량 카운트 증가
    incrementAIUsage();

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
