import type { CourseCategory, ThemeCourse } from "@/data/themeCourses";

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
 * 코스의 히어로 이미지 경로를 결정한다.
 * 우선순위:
 *   1. course.image (개별 지정 — 외부 URL 포함)
 *   2. /courses/heroes/<course.id>.jpg (id 이름 기반 자동 매핑)
 *   3. 카테고리 기본 이미지
 *   4. null → 렌더 측 테마 그라데이션 폴백
 *
 * public/courses/heroes/ 폴더에 코스 id와 동일한 파일명으로 이미지를 넣으면
 * course.image 없이도 자동으로 적용된다.
 */
export function courseImageSrc(course: Pick<ThemeCourse, "id" | "image" | "category">): string | null {
  if (course.image) return course.image;
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
  const themeGradient =
    variant === "detail"
      ? `linear-gradient(155deg, ${course.color} 0%, ${course.color}E6 42%, rgba(10,14,22,0.66) 100%)`
      : `linear-gradient(150deg, ${course.color} 0%, ${course.color}E6 45%, rgba(10,14,22,0.62) 100%)`;

  const src = courseImageSrc(course);
  if (!src) return themeGradient;

  const overlay =
    variant === "detail"
      ? "linear-gradient(to top, rgba(8,12,20,0.68) 0%, rgba(8,12,20,0.18) 46%, rgba(8,12,20,0.04) 100%)"
      : "linear-gradient(to top, rgba(8,12,20,0.32) 0%, rgba(8,12,20,0) 55%)";

  return `${overlay}, url('${src}'), ${themeGradient}`;
}
