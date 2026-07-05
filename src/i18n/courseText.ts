import type { ThemeCourse } from "@/data/themeCourses";
import { THEME_COURSES_EN, type CourseEn } from "@/data/themeCoursesData.en";
import { placeNameEn } from "./placeNames";
import type { Locale } from "./enums";

/**
 * 정적 큐레이션 코스의 로케일별 텍스트 접근자.
 *
 * en: THEME_COURSES_EN[course.id]를 필드 단위로 병합하고, 없는 필드/스탑은
 * 한글 원문을 그대로 쓴다(기존 fallback 정책과 동일). AI 드래프트나 localStorage에
 * 저장된 코스는 번역 항목이 없으므로 원문 그대로 반환된다.
 *
 * 스탑은 index로 매칭하되 name 앵커가 어긋나면(route-editor에서 순서 변경 등)
 * dev 모드에서 경고를 남기고 해당 스탑은 한글 원문을 유지한다.
 */
export function getCourseText(course: ThemeCourse, locale: Locale): ThemeCourse {
  if (locale !== "en") return course;
  const en: CourseEn | undefined = THEME_COURSES_EN[course.id];
  if (!en) return course;

  return {
    ...course,
    title: en.title || course.title,
    subtitle: en.subtitle || course.subtitle,
    description: en.description || course.description,
    totalDuration: en.totalDuration || course.totalDuration,
    distance: en.distance || course.distance,
    estimatedCost: en.estimatedCost || course.estimatedCost,
    bestTime: en.bestTime || course.bestTime,
    tags: en.tags?.length ? en.tags : course.tags,
    stops: course.stops.map((stop, i) => {
      const enStop = en.stops[i];
      if (!enStop) return stop;
      if (enStop.name !== stop.name) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            `[i18n] course "${course.id}" stop[${i}] desync: ko="${stop.name}" en-anchor="${enStop.name}" — run scripts/generate-course-en.mts again`
          );
        }
        return stop;
      }
      return {
        ...stop,
        name: enStop.nameEn || placeNameEn(stop.name),
        preview: enStop.preview || stop.preview,
        description: enStop.description || stop.description,
        duration: enStop.duration || stop.duration,
        tip: enStop.tip ?? stop.tip,
      };
    }),
  };
}
