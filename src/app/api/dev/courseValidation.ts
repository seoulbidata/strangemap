/**
 * dev 전용 — 코스 메타데이터 검증 (에디터 UI와 /api/dev/course 저장 API 공용).
 */
import { CATEGORY_META, type CourseCategory, type ThemeCourse } from "@/data/themeCourses";

export const COURSE_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DIFFICULTIES = ["쉬움", "보통", "어려움"] as const;
const CATEGORIES = Object.keys(CATEGORY_META).filter((k) => k !== "전체") as CourseCategory[];

export { DIFFICULTIES, CATEGORIES };

/** 저장 가능 조건 위반 목록 반환 (빈 배열 = 통과). 세그먼트 검증은 validateSidecar가 담당. */
export function validateCourseMeta(course: ThemeCourse): string[] {
  const errors: string[] = [];
  if (!COURSE_ID_RE.test(course.id)) {
    errors.push(`id "${course.id}"는 영소문자·숫자·하이픈(kebab-case)만 가능`);
  }
  const requiredText: [keyof ThemeCourse, string][] = [
    ["title", "제목"],
    ["subtitle", "부제"],
    ["description", "설명"],
    ["totalDuration", "총 소요시간"],
    ["distance", "거리"],
    ["estimatedCost", "예상 비용"],
    ["bestTime", "추천 시간대"],
    ["color", "색상"],
  ];
  for (const [key, label] of requiredText) {
    const v = course[key];
    if (typeof v !== "string" || v.trim().length === 0) errors.push(`${label}(${key}) 비어 있음`);
  }
  if (!DIFFICULTIES.includes(course.difficulty)) {
    errors.push(`난이도 "${course.difficulty}" 무효 (${DIFFICULTIES.join("/")})`);
  }
  if (!CATEGORIES.includes(course.category)) {
    errors.push(`카테고리 "${course.category}" 무효 (${CATEGORIES.join("/")})`);
  }
  if (!Array.isArray(course.tags)) {
    errors.push("tags 배열 필요");
  }
  if (!Array.isArray(course.stops) || course.stops.length < 2) {
    errors.push(`스톱이 ${course.stops?.length ?? 0}개 — 최소 2개 필요`);
  } else {
    course.stops.forEach((s, i) => {
      if (typeof s.name !== "string" || s.name.trim().length === 0)
        errors.push(`스톱 ${i + 1}: 이름 비어 있음`);
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng))
        errors.push(`스톱 ${i + 1}: 좌표 무효`);
      if (typeof s.duration !== "string" || s.duration.trim().length === 0)
        errors.push(`스톱 ${i + 1} (${s.name}): 체류시간 비어 있음`);
      if (typeof s.preview !== "string" || s.preview.trim().length === 0)
        errors.push(`스톱 ${i + 1} (${s.name}): 미리보기 한 줄 비어 있음`);
      if (typeof s.description !== "string" || s.description.trim().length === 0)
        errors.push(`스톱 ${i + 1} (${s.name}): 상세 설명 비어 있음`);
    });
  }
  return errors;
}

/** 저장 전 정규화 — 문자열 trim, 빈 tip 제거, tags 빈 항목 제거 */
export function normalizeCourse(course: ThemeCourse): ThemeCourse {
  return {
    ...course,
    id: course.id.trim(),
    title: course.title.trim(),
    subtitle: course.subtitle.trim(),
    description: course.description.trim(),
    totalDuration: course.totalDuration.trim(),
    distance: course.distance.trim(),
    estimatedCost: course.estimatedCost.trim(),
    bestTime: course.bestTime.trim(),
    color: course.color.trim(),
    tags: (course.tags ?? []).map((t) => t.trim()).filter(Boolean),
    image: course.image?.trim() || undefined,
    mediaTitle: course.mediaTitle?.trim() || undefined,
    stops: course.stops.map((s) => ({
      ...s,
      name: s.name.trim(),
      preview: s.preview.trim(),
      description: s.description.trim(),
      duration: s.duration.trim(),
      tip: s.tip?.trim() || undefined,
    })),
  };
}
