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
 * AI 코스 히어로용 파스텔 단색 — 위저드 목적 칩(MyCoursePanel PURPOSES) 하나당 하나.
 *
 * 채도 높은 2색 그라데이션은 "AI가 만든 것"의 시각 기호로 읽히고, 종이색(#FBFAF7) 기반인
 * 앱 팔레트 밖으로 튄다. 그래서 명도를 종이색에 맞춘 저채도 단색만 쓴다 —
 * 사진이 있는 정적 코스 카드 옆에 놓여도 "다른 종류"로 분리되지 않는다.
 *
 * 색을 랜덤이 아니라 목적에 묶었으므로 같은 목적으로 만든 코스는 늘 같은 색이 나온다
 * (= 색이 의미를 갖는다). 흰색·무채색에 가까운 값은 쓰지 않는다 — 카드 본문(흰색)과 붙어
 * 히어로 영역이 사라져 보이기 때문.
 *
 * 모두 #16243C 글자와 대비 12:1 이상이라 히어로 위 텍스트는 어두운 색으로 쓴다.
 */
const PURPOSE_HERO_COLOR: Record<string, string> = {
  "자연·힐링": "#D6E8DA",   // 세이지 그린
  "문화·예술": "#E2DDEF",   // 페일 라일락
  "관광 명소": "#DCE6F5",   // 페일 블루
  "체험·놀거리": "#FAE2CC", // 페일 애프리콧
  "데이트": "#F6DEE1",      // 페일 로즈
  "핫플레이스": "#F8E6C4",  // 페일 버터
  "쇼핑": "#D9E8E8",        // 페일 틸
};

/** 목적을 못 받은 코스(구 버전 저장분 등)의 폴백 — 흰색이 아닌 따뜻한 그레이지 */
const FALLBACK_HERO_COLOR = "#E5E0D6";

/**
 * AI 코스의 히어로 단색.
 * 가장 먼저 고른 목적이 색을 정한다 — 뱃지 첫 칸과 색이 같은 것을 가리키게 된다.
 */
export function aiHeroColor(course: Pick<ThemeCourse, "purposes">): string {
  for (const p of course.purposes ?? []) {
    const c = PURPOSE_HERO_COLOR[p];
    if (c) return c;
  }
  return FALLBACK_HERO_COLOR;
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
  course: Pick<ThemeCourse, "id" | "image" | "category" | "color" | "purposes">,
  variant: "card" | "detail"
): string {
  const overlay =
    variant === "detail"
      ? "linear-gradient(to top, rgba(8,12,20,0.68) 0%, rgba(8,12,20,0.18) 46%, rgba(8,12,20,0.04) 100%)"
      : "linear-gradient(to top, rgba(8,12,20,0.32) 0%, rgba(8,12,20,0) 55%)";

  // AI 코스는 사진 대신 목적에서 뽑은 파스텔 단색.
  // 가독성 오버레이(어두운 스크림)를 씌우지 않는다 — 밝은 배경이라 히어로 위 글자는
  // 어두운 색으로 얹어야 하고(CourseDetailPanel 참고), 스크림은 파스텔을 탁하게만 만든다.
  // backgroundImage 속성이라 단색도 두 스톱이 같은 linear-gradient로 표현한다(= 그라데이션 없음).
  if (isAIDraft(course)) {
    const c = aiHeroColor(course);
    return `linear-gradient(${c}, ${c})`;
  }

  const themeGradient =
    variant === "detail"
      ? `linear-gradient(155deg, ${course.color} 0%, ${course.color}E6 42%, rgba(10,14,22,0.66) 100%)`
      : `linear-gradient(150deg, ${course.color} 0%, ${course.color}E6 45%, rgba(10,14,22,0.62) 100%)`;

  const src = courseImageSrc(course);
  if (!src) return themeGradient;

  return `${overlay}, url('${src}'), ${themeGradient}`;
}
