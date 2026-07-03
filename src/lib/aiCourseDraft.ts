import { SEOUL_PLACES } from "@/lib/seoulPlaces";
import { CATEGORY_META, type CourseCategory, type ThemeCourse } from "@/data/themeCourses";
import { planCourse } from "@/lib/courseRouting";

/** /api/ai-recommend 응답 1건의 형태 */
export interface AISuggestion {
  title: string;
  place: string;
  duration: string;
  description: string;
  reason: string;
  tags: string[];
}

export interface DraftMeta {
  companion: string;
  time: string;
  purpose: string;
  region: string;
}

/** 목적 → 코스 카테고리 매핑 (색상/뱃지 공유용) */
const PURPOSE_TO_CATEGORY: Record<string, CourseCategory> = {
  힐링: "야경/자연",
  놀거리: "Hot플레이스",
  데이트: "야경/자연",
  관광: "역사",
  문화생활: "문화",
};

/** AI 임시 코스 id 접두사 — 카드에서 'AI 생성' 뱃지 판별에 사용 */
export const AI_DRAFT_PREFIX = "ai-";

export function isAIDraft(course: { id: string }): boolean {
  return course.id.startsWith(AI_DRAFT_PREFIX);
}

function findPlace(name: string) {
  return (
    SEOUL_PLACES.find((p) => p.displayName === name || p.areaName === name) ??
    SEOUL_PLACES.find((p) => name.includes(p.displayName) || p.displayName.includes(name))
  );
}

/** 코스 생성 제약 — "나만의 코스 만들기" 기본 정책 */
export const COURSE_MAX_STOPS = 5;
export const COURSE_MIN_STOPS = 3;
export const COURSE_MAX_TOTAL_KM = 10;

/** 사용자가 고른 시간대 칩 → 코스 시작 시각(운영시간 시간창 평가용) */
const TIME_TO_START_HOUR: Record<string, number> = {
  오전: 10,
  오후: 14,
  밤: 19,
};

/**
 * AI 추천 결과를 지도·타임라인이 그대로 렌더할 수 있는 ThemeCourse(draft)로 변환한다.
 * 좌표를 찾지 못한 장소는 제외하며, 좌표 있는 stop이 2곳 미만이면 null을 반환한다.
 */
export function buildDraftFromSuggestions(
  suggestions: AISuggestion[],
  meta: DraftMeta
): ThemeCourse | null {
  const stops = suggestions
    .map((s) => {
      const place = findPlace(s.place);
      if (!place) return null;
      return {
        name: place.displayName,
        lat: place.lat,
        lng: place.lng,
        operatingHours: place.operatingHours, // 시간창(운영시간) 평가용 — ThemeCourse 렌더엔 영향 없음
        preview: s.reason,
        description: s.description,
        duration: s.duration || "약 1시간",
        tip: undefined as string | undefined,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (stops.length < 2) return null;

  // 동선 최적화: 오픈 패스 TSP(운영시간 시간창 포함) + 최대 5곳·총 10km 상한.
  // AI는 "어떤 장소"만 고르고, "어떤 순서"는 여기서 결정적으로 푼다.
  const { ordered, totalKm } = planCourse(stops, {
    maxStops: COURSE_MAX_STOPS,
    minStops: Math.min(COURSE_MIN_STOPS, stops.length),
    maxTotalKm: COURSE_MAX_TOTAL_KM,
    startHour: TIME_TO_START_HOUR[meta.time],
  });
  const km = totalKm;

  const category = PURPOSE_TO_CATEGORY[meta.purpose] ?? "역사";
  const color = CATEGORY_META[category].color;
  const tags = Array.from(new Set(suggestions.flatMap((s) => s.tags))).slice(0, 4);
  const regionLabel = meta.region !== "상관없음" ? `${meta.region} ` : "";

  return {
    id: `${AI_DRAFT_PREFIX}${Date.now()}`,
    title: `${ordered[0].name}에서 시작하는 ${regionLabel}${meta.purpose} 코스`,
    subtitle: `AI가 ${meta.companion}·${meta.time} 기준으로 구성했어요`,
    description: suggestions[0]?.description ?? "오늘의 서울을 잇는 AI 맞춤 코스예요.",
    totalDuration: `약 ${Math.max(2, ordered.length)}시간`,
    distance: `${km.toFixed(1)}km`,
    difficulty: "쉬움",
    tags: tags.length > 0 ? tags : ["AI추천", "맞춤코스"],
    color,
    category,
    estimatedCost: "AI 추정",
    bestTime: meta.time,
    stops: ordered,
  };
}
