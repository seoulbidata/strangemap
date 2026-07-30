import type { CourseCategory, ThemeCourse } from "@/data/themeCourses";
import { isAIDraft } from "@/lib/aiCourseDraft";

/**
 * 테마(카테고리)별 기본 히어로 이미지 경로.
 * public/courses/ 아래에 아래 파일명으로 이미지를 넣으면 자동 반영된다.
 */
export const CATEGORY_IMAGE: Record<CourseCategory, string> = {
  "역사": "/courses/history.jpg",
  "야경/자연": "/courses/nightview.jpg",
  "서울배경 컨텐츠": "/courses/drama.jpg",
  "Hot플레이스": "/courses/hotplace.jpg",
  "문화": "/courses/culture.jpg",
  "로컬": "/courses/local.jpg",
  "운동": "/courses/workout.jpg",
};

/**
 * AI 코스 히어로용 그라데이션 팔레트.
 * 사진이 없는 코스라 색만으로 성립해야 하므로 채도 있는 두 색 + 어두운 바닥색으로 구성한다.
 */
const AI_HERO_PALETTES: [string, string][] = [
  ["#4F46E5", "#0EA5E9"], // 인디고 → 스카이
  ["#7C3AED", "#DB2777"], // 바이올렛 → 핑크
  ["#0891B2", "#10B981"], // 시안 → 에메랄드
  ["#F97316", "#DB2777"], // 오렌지 → 로즈
  ["#2563EB", "#7C3AED"], // 블루 → 퍼플
  ["#059669", "#65A30D"], // 그린 → 라임
  ["#E11D48", "#F59E0B"], // 로즈 → 앰버
  ["#1D4ED8", "#0F766E"], // 딥블루 → 틸
];

/** 문자열 → 안정적인 해시. 같은 코스는 항상 같은 색이 나와야 리렌더마다 색이 튀지 않는다. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * AI 코스의 히어로 그라데이션.
 * id가 `ai-<생성시각>`이라 코스마다 사실상 랜덤한 색이 뽑히면서도,
 * 같은 코스를 다시 열면 같은 색이 유지된다.
 */
export function aiHeroGradient(id: string, variant: "card" | "detail"): string {
  const [a, b] = AI_HERO_PALETTES[hashString(id) % AI_HERO_PALETTES.length];
  const angle = variant === "detail" ? 155 : 150;
  return `linear-gradient(${angle}deg, ${a} 0%, ${b} 58%, rgba(10,14,22,0.82) 100%)`;
}

/**
 * 코스의 히어로 이미지 경로를 결정한다.
 * 우선순위:
 *   1. AI 생성 코스 → null (전용 이미지가 있을 리 없으므로 아예 요청하지 않는다 = 404 방지)
 *   2. course.image (개별 지정 — 외부 URL 포함)
 *   3. /courses/heroes/<course.id>.jpg (id 이름 기반 자동 매핑)
 *   4. null → 렌더 측 테마 그라데이션 폴백
 *
 * public/courses/heroes/ 폴더에 코스 id와 동일한 파일명으로 이미지를 넣으면
 * course.image 없이도 자동으로 적용된다.
 */
export function courseImageSrc(course: Pick<ThemeCourse, "id" | "image" | "category">): string | null {
  if (course.image) return course.image;
  if (isAIDraft(course)) return null;
  return `/courses/heroes/${course.id}.jpg`;
}

/**
 * 카테고리 기본 이미지 경로만 반환한다 (heroes 이미지가 없을 때의 폴백용).
 */
export function categoryImageSrc(category: CourseCategory): string | null {
  return CATEGORY_IMAGE[category] ?? null;
}

/**
 * 히어로 배경 CSS(background-image) 문자열을 만든다.
 * 이미지 레이어 + 가독성 오버레이 + 테마 그라데이션(폴백)을 한 번에 쌓는다.
 * 이미지 파일이 없으면(404) 맨 아래 테마 그라데이션이 보인다.
 */
export function courseHeroBackground(
  course: Pick<ThemeCourse, "id" | "image" | "category" | "color">,
  variant: "card" | "detail"
): string {
  const overlay =
    variant === "detail"
      ? "linear-gradient(to top, rgba(8,12,20,0.68) 0%, rgba(8,12,20,0.18) 46%, rgba(8,12,20,0.04) 100%)"
      : "linear-gradient(to top, rgba(8,12,20,0.32) 0%, rgba(8,12,20,0) 55%)";

  // AI 코스는 사진 대신 id에서 뽑은 색 그라데이션 (이미지 요청 자체가 없어 404가 나지 않는다)
  if (isAIDraft(course)) return `${overlay}, ${aiHeroGradient(course.id, variant)}`;

  const themeGradient =
    variant === "detail"
      ? `linear-gradient(155deg, ${course.color} 0%, ${course.color}E6 42%, rgba(10,14,22,0.66) 100%)`
      : `linear-gradient(150deg, ${course.color} 0%, ${course.color}E6 45%, rgba(10,14,22,0.62) 100%)`;

  const src = courseImageSrc(course);
  if (!src) return themeGradient;

  return `${overlay}, url('${src}'), ${themeGradient}`;
}
