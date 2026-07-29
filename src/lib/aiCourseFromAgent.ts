/**
 * lewisai(AI 서버) /agent/chat 응답 → strangemap ThemeCourse 변환.
 *
 * 역할 분리: lewisai가 "어떤 장소를·왜·거기서 뭘" + 좌표 + 방문 순서 + 시각 + 식당 후보까지 준다.
 * **stops[] 는 이미 방문 순서다 — 프론트는 재정렬하지 않는다.** (TSP 금지)
 * 프론트가 만드는 것은 서버가 안 주는 것뿐: 폴리라인·실거리·표시 텍스트.
 * (기존 aiCourseDraft.ts는 Gemini AISuggestion(좌표 없음→SEOUL_PLACES 조회)용이라 별개.)
 *
 * 규칙 (docs/prompt-for-strangemap.md §3):
 *  - stops[] 안에 place / meal / flex 슬롯이 **섞여 순서대로** 온다. 그대로 유지한다.
 *  - meal 슬롯에는 식당 후보가 여러 곳 오지만 코스에는 **한 곳만** 담는다(무작위 선택).
 *    반경 안에 식당이 하나도 없으면 좌표 없는 슬롯으로 남겨 두고(hasCoords=false)
 *    지도·경로에서 건너뛴다(타임라인엔 자리만 표시).
 *  - flex 슬롯은 start/end_time 이 없다. 타임라인 하단 "시간표 밖 추천"으로 분리해 보여준다.
 *  - duration 문자열은 표시용. 계산에는 duration_min(정수 분)을 쓴다.
 *  - 거리는 순서 확정본이라 haversine 합산(일차 경계·좌표 없는 슬롯 제외).
 */
import {
  CATEGORY_META,
  hasCoords,
  isMealStop,
  type CourseCategory,
  type CourseOverlayPoi,
  type CourseSlotType,
  type CourseStop,
  type MealPlace,
  type ThemeCourse,
} from "@/data/themeCourses";
import { AI_DRAFT_PREFIX } from "@/lib/aiCourseDraft";
import { haversineKm } from "@/lib/courseRouting";

// ── lewisai 응답 타입 (docs/prompt-for-strangemap.md §3) ──────────────────────
interface AgentNearbyCard {
  title: string;
  lat?: number | null;
  lng?: number | null;
  kind?: string;
  summary?: string;
  address?: string;
  dist_km?: number | null;
  use_time?: string;
}
interface AgentStop {
  name: string;
  lat?: number | null;
  lng?: number | null;
  preview?: string;
  description?: string;
  duration?: string;
  duration_min?: number | null;
  tip?: string | null;
  reason?: string;
  activities?: string[];
  day?: number | null;
  slot_type?: CourseSlotType;
  congestion?: string | null;   // 방문 시각 예상 혼잡도(예보) — 서울시 FCST_PPLTN
  start_time?: string | null;   // "HH:MM"
  end_time?: string | null;     // "HH:MM"
  travel_min?: number | null;   // 직전 스톱에서의 이동 추정(직선거리)
  travel_mode?: "walk" | "transit" | null;
  nearby?: { restaurants?: AgentNearbyCard[]; attractions?: AgentNearbyCard[] };
  meal_options?: AgentNearbyCard[];
}
interface AgentCourse {
  title?: string;
  subtitle?: string;
  description?: string;
  tags?: string[];
  scheduled?: boolean;
  days?: number;
  day_areas?: Record<string, string>;
  day_descriptions?: Record<string, string>;
  stops?: AgentStop[];
}
export interface AgentChatResponse {
  kind?: string;
  source?: string;
  course?: AgentCourse | null;
  /** 생성 과정 트레이스. 사용자에게 노출하지 않으므로 코스로 옮기지 않는다 */
  steps?: unknown[];
}

// AI 코스의 색/뱃지 카테고리 — 응답엔 목적이 없어 중립 기본값(야경/자연)을 쓴다.
const DEFAULT_CATEGORY: CourseCategory = "야경/자연";

/** "14:00" → 840(분). 형식이 어긋나면 null. */
function toMinutes(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/**
 * 하루 코스의 총 소요시간 — 시간표의 첫 슬롯 시작 ~ 마지막 슬롯 종료.
 *
 * 식사 슬롯도 실제로 그 시간을 쓰므로 place만이 아니라 전체 슬롯을 대상으로 잰다.
 * 서버 hhmm()이 24로 나머지 연산을 하므로 자정을 넘긴 종료("01:00")는 start보다 작게 오는데,
 * 그때는 하루를 더해 되돌린다. 시간표가 없는 코스(시간 범위 미선택)는 null → 장소 수 폴백.
 */
function scheduleSpanLabel(stops: AgentStop[]): string | null {
  // 슬롯은 이미 시간표 순서다. 앞의 시각보다 뒤로 간 값이 나오면 자정을 넘긴 것이므로
  // 하루를 더해 펴면서 읽는다 (min/max로 재면 "23:30 → 02:00" 같은 심야 코스가 거꾸로 잡힌다).
  let first: number | null = null;
  let last: number | null = null;
  let prev = -1;
  let dayOffset = 0;

  for (const s of stops) {
    for (const raw of [s.start_time, s.end_time]) {
      const m = toMinutes(raw);
      if (m == null) continue;
      if (m + dayOffset < prev) dayOffset += 24 * 60;
      prev = m + dayOffset;
      if (first == null) first = prev;
      last = prev;
    }
  }
  if (first == null || last == null || last <= first) return null;

  const total = last - first;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `약 ${m}분`;
  return m ? `약 ${h}시간 ${m}분` : `약 ${h}시간`;
}

/**
 * 코스 총 거리(km) — 서버가 확정한 순서 그대로 연속 스톱 haversine 합산.
 * 일차를 넘어가는 이동과 좌표 없는 슬롯(식당 못 찾은 식사)은 건너뛴다.
 */
export function courseDistanceKm(stops: CourseStop[]): number {
  const drawable = stops.filter(hasCoords);
  let km = 0;
  for (let i = 1; i < drawable.length; i++) {
    if ((drawable[i].day ?? 1) !== (drawable[i - 1].day ?? 1)) continue;
    km += haversineKm(drawable[i - 1].lat, drawable[i - 1].lng, drawable[i].lat, drawable[i].lng);
  }
  return km;
}

export const distanceLabel = (km: number): string => `${km.toFixed(1)}km`;

/** 후보 중 하나를 무작위로. 비어 있으면 undefined (반경 안에 식당이 없던 끼니). */
function pickOne<T>(list: T[]): T | undefined {
  return list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
}

function toMealPlace(card: AgentNearbyCard): MealPlace {
  return {
    title: card.title,
    summary: card.summary || undefined,
    address: card.address || undefined,
    lat: card.lat ?? undefined,
    lng: card.lng ?? undefined,
    distKm: card.dist_km ?? undefined,
    useTime: card.use_time || undefined,
    kind: card.kind || "restaurant",
  };
}

/**
 * lewisai 응답을 지도·상세가 그대로 렌더하는 ThemeCourse(draft)로 변환.
 * 좌표 있는 장소(place/flex) 스톱이 2곳 미만이면 null.
 */
export function buildCourseFromAgent(res: AgentChatResponse): ThemeCourse | null {
  const c = res.course;
  if (!c || !Array.isArray(c.stops)) return null;

  // 순서는 서버가 단일 소유 — 클라는 렌더 + 폴리라인만. 재정렬·재배치 금지.
  // 좌표 없는 place/flex 스톱만 떨어뜨린다(그릴 수도, 안내할 수도 없다).
  // 식사 슬롯은 좌표가 없어도 남긴다 — 타임라인에 "이때 밥 먹는 자리"가 있어야 한다.
  const kept = c.stops.filter((s) => {
    const slot = s.slot_type ?? "place";
    return slot === "meal" || (s.lat != null && s.lng != null);
  });
  if (kept.filter((s) => (s.slot_type ?? "place") !== "meal").length < 2) return null;

  const stops: CourseStop[] = kept.map((s) => {
    const slotType: CourseSlotType = s.slot_type ?? "place";
    // 끼니마다 식당은 한 곳만 쓴다 — 서버가 준 후보 중 하나를 무작위로 뽑고 나머지는 버린다.
    // (서버 meals 노드가 이미 반경 안에서 랜덤으로 3곳을 뽑아 주므로 어느 것을 골라도 결과는 실데이터다.)
    // 슬롯 좌표는 meal_options[0] 기준으로 와 있으니, 다른 후보를 뽑았으면 좌표도 그 집으로 바꾼다.
    const mealPlace =
      slotType === "meal"
        ? pickOne((s.meal_options ?? []).filter((o) => o.title).map(toMealPlace))
        : undefined;
    return {
      name: s.name,
      // 식사 슬롯은 좌표가 null 일 수 있다. NaN 으로 두면 hasCoords()가 걸러 주고,
      // localStorage 왕복(JSON.stringify → null) 후에도 같은 판정이 나온다.
      lat: mealPlace?.lat ?? s.lat ?? NaN,
      lng: mealPlace?.lng ?? s.lng ?? NaN,
      // 식사 슬롯의 서버 preview 는 meal_options[0] 의 소개문이라, 다른 집을 뽑았으면 함께 바꾼다
      preview: mealPlace?.summary ?? (s.preview || s.reason || ""),
      description: s.description || "",
      duration: s.duration || "약 1시간",
      durationMin: s.duration_min ?? undefined,
      tip: s.tip ?? undefined,
      reason: s.reason || undefined,
      activities: (s.activities ?? []).filter(Boolean),
      day: s.day ?? undefined,
      slotType,
      // 방문 시각 예상 혼잡도(예보) — 프론트가 실시간 재조회하지 않고 이 값을 그대로 표시
      congestion: s.congestion || undefined,
      startTime: s.start_time || undefined,
      endTime: s.end_time || undefined,
      travelMin: s.travel_min ?? undefined,
      travelMode: s.travel_mode ?? undefined,
      // 이 장소 주변의 실데이터 맛집 (스톱 카드용) — 스톱별 nearby.restaurants 그대로
      nearbyRestaurants: (s.nearby?.restaurants ?? [])
        .filter((r) => r.title)
        .slice(0, 4)
        .map((r) => ({
          title: r.title,
          distKm: r.dist_km ?? undefined,
          address: r.address || undefined,
        })),
      mealPlace,
    };
  });

  // 주변 식당 오버레이 — 스톱별 nearby.restaurants 중 좌표 있는 것 (title 중복 제거).
  // 식사 슬롯의 식당은 여기 넣지 않는다 — 그 자리는 식사 마커가 직접 그린다.
  const seen = new Set<string>();
  const overlayPois: CourseOverlayPoi[] = [];
  c.stops.forEach((s) => {
    (s.nearby?.restaurants ?? []).forEach((card) => {
      if (card.lat == null || card.lng == null || seen.has(card.title)) return;
      seen.add(card.title);
      overlayPois.push({
        name: card.title,
        lat: card.lat,
        lng: card.lng,
        kind: card.kind || "restaurant",
        day: s.day ?? undefined,
      });
    });
  });

  const days = c.days && c.days > 1 ? c.days : undefined;
  const dayAreas = c.day_areas
    ? Object.fromEntries(Object.entries(c.day_areas).map(([k, v]) => [Number(k), v]))
    : undefined;
  // 일차별 설명 — 멀티데이만 (일차 탭에 맞춰 표시). 키를 숫자로 정규화.
  const dayDescriptions =
    days && c.day_descriptions
      ? Object.fromEntries(
          Object.entries(c.day_descriptions)
            .filter(([, v]) => v)
            .map(([k, v]) => [Number(k), v]),
        )
      : undefined;

  const category = DEFAULT_CATEGORY;
  const tags = (c.tags ?? []).slice(0, 4);
  const placeCount = stops.filter((s) => !isMealStop(s)).length;

  return {
    id: `${AI_DRAFT_PREFIX}${Date.now()}`,
    title: c.title || "나만의 서울 코스",
    subtitle: c.subtitle || "AI가 오늘의 서울에 맞춰 구성했어요",
    description: c.description || "",
    // 하루 코스는 시간표의 실제 창(예: 09:00~14:00 → "약 5시간")을 쓴다.
    // 시간표가 없을 때만 장소 수로 어림잡는다.
    totalDuration: days ? `${days}일` : scheduleSpanLabel(c.stops) ?? `약 ${Math.max(2, placeCount)}시간`,
    distance: distanceLabel(courseDistanceKm(stops)),
    difficulty: "쉬움",
    tags: tags.length ? tags : ["AI추천", "맞춤코스"],
    color: CATEGORY_META[category].color,
    category,
    estimatedCost: "AI 추정",
    bestTime: "",
    stops,
    days,
    dayAreas,
    dayDescriptions,
    overlayPois: overlayPois.length ? overlayPois : undefined,
  };
}
