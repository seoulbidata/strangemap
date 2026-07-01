import { SEOUL_PLACES } from "@/lib/seoulPlaces";
import { CATEGORY_META, type CourseCategory, type ThemeCourse } from "@/data/themeCourses";

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

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * 첫 stop을 출발점으로 두고 가장 가까운 곳을 차례로 잇는 최근접 탐욕 정렬.
 * AI가 돌려준 순서가 지그재그여도 지도 동선이 한 방향으로 흐르게 만든다.
 */
function orderByProximity<T extends { lat: number; lng: number }>(stops: T[]): T[] {
  if (stops.length <= 2) return stops;
  const remaining = stops.slice(1);
  const ordered: T[] = [stops[0]];
  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((s, i) => {
      const d = haversineKm(last.lat, last.lng, s.lat, s.lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

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
        preview: s.reason,
        description: s.description,
        duration: s.duration || "약 1시간",
        tip: undefined as string | undefined,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (stops.length < 2) return null;

  // 동선이 한 방향으로 흐르도록 최근접 순서로 재정렬
  const ordered = orderByProximity(stops);

  // 직선거리 합으로 대략 거리 추정
  let km = 0;
  for (let i = 1; i < ordered.length; i++) {
    km += haversineKm(ordered[i - 1].lat, ordered[i - 1].lng, ordered[i].lat, ordered[i].lng);
  }

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
