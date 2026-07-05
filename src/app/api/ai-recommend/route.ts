import { NextRequest, NextResponse } from "next/server";
import { SEOUL_PLACES } from "@/lib/seoulPlaces";
import { incrementAIUsage } from "@/lib/aiUsage";
import { haversineKm, selectCluster } from "@/lib/courseRouting";
import {
  extractJsonArrayText,
  generateGeminiJsonText,
  parseJsonWithEscapedControlChars,
} from "@/lib/gemini";
import * as koKit from "./prompts.ko";
import * as enKit from "./prompts.en";

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

// ── 프롬프트 킷 (ko/en) ───────────────────────────────────────────────────────
// SYSTEM_MSG·buildPrompt·MOCK_FALLBACK은 언어별 프롬프트 모듈로 분리됨.
// SUGGESTION_SCHEMA는 언어 중립이라 이 파일에 유지한다.

type Lang = "ko" | "en";

function promptKit(lang: Lang) {
  return lang === "en" ? enKit : koKit;
}

// ── AI 호출 ──────────────────────────────────────────────────────────────────

function parseAIResponse(text: string, placeCount: number): Suggestion[] | null {
  const arrText = extractJsonArrayText(text);
  if (!arrText) return null;
  const parsed = parseJsonWithEscapedControlChars<unknown>(arrText);
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  return parsed.slice(0, placeCount) as Suggestion[];
}

async function callGemini(prompt: string, systemInstruction: string, placeCount: number): Promise<Suggestion[] | null> {
  const text = await generateGeminiJsonText({
    prompt,
    systemInstruction,
    maxOutputTokens: 2500 + (placeCount - 3) * 700, // 스톱 수에 비례해 출력 여유 확보
    responseSchema: SUGGESTION_SCHEMA,
  });
  if (!text) return null;
  console.log("[Gemini:recommend] raw:", text.slice(0, 200));
  return parseAIResponse(text, placeCount);
}

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
  // 출력 언어 — 미전달 시 ko(하위 호환)
  const lang: Lang = body.lang === "en" ? "en" : "ko";
  const kit = promptKit(lang);

  // lang을 캐시 키에 포함해 언어별 응답을 분리 저장
  const cacheKey = `${lang}|${companion}|${ageGroup}|${time}|${purpose}|${region}|${congestion}|${placeCount}`;
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

  const prompt = kit.buildPrompt(companion, ageGroup, time, purpose, region, congestion, placeCount, candidates, events);

  const suggestions = await callGemini(prompt, kit.SYSTEM_MSG, placeCount).catch(() => null);

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

  return NextResponse.json({ suggestions: kit.MOCK_FALLBACK, _source: "mock" });
}
