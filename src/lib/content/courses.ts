/**
 * 테마 코스(src/data/themeCoursesData.ts)를 SEO 콘텐츠 페이지에서 쓰기 위한 접근자.
 *
 * 코스 id 는 이미 kebab-case 영문이라 그대로 URL 슬러그로 쓴다(/courses/palace-trail).
 * 히어로 이미지는 public/courses/heroes/<id>.jpg 규약을 따르며, 없으면 og 기본 이미지로 폴백한다.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import {
  THEME_COURSES,
  isMealStop,
  placeStopCount,
  type CourseCategory,
  type ThemeCourse,
} from "@/data/themeCourses";

export interface CourseEntry {
  course: ThemeCourse;
  slug: string;
  /** public 기준 절대경로. 파일이 없으면 기본 OG 이미지 */
  hero: string;
  /** 식사 슬롯을 뺀 방문 장소 수 */
  placeCount: number;
}

const DEFAULT_HERO = "/og/default.jpg";

let cached: CourseEntry[] | null = null;

export function getCourses(): CourseEntry[] {
  if (cached) return cached;

  cached = THEME_COURSES.map((course) => {
    const heroPath = course.image ?? `/courses/heroes/${course.id}.jpg`;
    const exists = existsSync(path.join(process.cwd(), "public", heroPath.replace(/^\//, "")));
    return {
      course,
      slug: course.id,
      hero: exists ? heroPath : DEFAULT_HERO,
      placeCount: placeStopCount(course),
    };
  });

  return cached;
}

export function getCourseBySlug(slug: string): CourseEntry | undefined {
  return getCourses().find((c) => c.slug === slug);
}

/** 카테고리별 묶음 — 목록 페이지 섹션과 상세 페이지의 "비슷한 코스"가 함께 쓴다. */
export function getCoursesByCategory(): { category: CourseCategory; courses: CourseEntry[] }[] {
  const groups = new Map<CourseCategory, CourseEntry[]>();
  for (const entry of getCourses()) {
    const list = groups.get(entry.course.category) ?? [];
    list.push(entry);
    groups.set(entry.course.category, list);
  }
  return [...groups.entries()].map(([category, courses]) => ({ category, courses }));
}

export function getRelatedCourses(entry: CourseEntry, limit = 3): CourseEntry[] {
  const same = getCourses().filter(
    (c) => c.slug !== entry.slug && c.course.category === entry.course.category
  );
  if (same.length >= limit) return same.slice(0, limit);
  const others = getCourses().filter(
    (c) => c.slug !== entry.slug && c.course.category !== entry.course.category
  );
  return [...same, ...others].slice(0, limit);
}

/** 이 명소를 경유하는 코스 — 명소 상세에서 코스 상세로 내부 링크를 잇는다. */
export function getCoursesContainingPlace(placeName: string): CourseEntry[] {
  return getCourses().filter((entry) =>
    entry.course.stops.some((stop) => !isMealStop(stop) && stop.name.includes(placeName))
  );
}
