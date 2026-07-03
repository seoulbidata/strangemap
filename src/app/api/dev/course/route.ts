/**
 * dev 전용 — 경로 에디터의 통합 저장 API (코스 메타 + 스톱 + 세그먼트).
 *
 * 한 번의 POST로:
 *  1. src/data/themeCoursesData.ts 에 코스를 upsert (전체 재직렬화 — 신규 코스 추가 지원)
 *  2. public/courses/routes/<id>.json 사이드카에 source:"curated" 로 세그먼트 write
 *
 * production에서는 404를 반환한다.
 * 주의: 데이터 파일 write 후 Next dev가 재컴파일해야 THEME_COURSES에 반영된다
 * (에디터 화면은 자체 draft로 동작하므로 무관, 코스 목록·메인 페이지는 새로고침 필요).
 */
import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { THEME_COURSES, type CourseSegment, type ThemeCourse } from "@/data/themeCourses";
import { validateSidecar } from "@/lib/segmentLibrary";
import { normalizeCourse, validateCourseMeta } from "../courseValidation";

const DATA_HEADER = `/**
 * 테마 코스 데이터 — /dev/route-editor(로컬 전용 에디터)가 자동 생성·관리하는 파일.
 * 직접 편집해도 되지만, 에디터에서 코스를 저장하면 이 파일 전체가 재직렬화된다.
 * 타입·카테고리 메타는 ./themeCourses.ts 에 있다.
 */
import type { ThemeCourse } from "./themeCourses.ts";

export const THEME_COURSES_DATA: ThemeCourse[] = `;

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { course: ThemeCourse; segments: CourseSegment[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errors: ["JSON body 파싱 실패"] }, { status: 400 });
  }
  if (!body?.course || !Array.isArray(body?.segments)) {
    return NextResponse.json(
      { ok: false, errors: ["course 객체와 segments 배열이 필요합니다"] },
      { status: 400 },
    );
  }

  const course = normalizeCourse(body.course);
  const errors = [...validateCourseMeta(course), ...validateSidecar(course, body.segments)];
  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  // 끝점을 스톱 좌표로 강제 대입 — 검증 허용 오차 내 미세 어긋남도 저장본에선 제거
  const segments = body.segments.map((seg, i) => ({
    mode: seg.mode,
    points: seg.points.map((p, k) => {
      if (k === 0) return { lat: course.stops[i].lat, lng: course.stops[i].lng };
      if (k === seg.points.length - 1)
        return { lat: course.stops[i + 1].lat, lng: course.stops[i + 1].lng };
      return { lat: p.lat, lng: p.lng };
    }),
  }));

  // upsert: 같은 id가 있으면 교체, 없으면 맨 뒤에 추가
  // (THEME_COURSES는 서버 모듈 스냅샷 — dev에선 파일 변경 시 재컴파일되어 다음 요청에 최신)
  const courses: ThemeCourse[] = THEME_COURSES.map((c) => (c.id === course.id ? course : c));
  const isNew = !THEME_COURSES.some((c) => c.id === course.id);
  if (isNew) courses.push(course);

  const dataFile = join(process.cwd(), "src", "data", "themeCoursesData.ts");
  await writeFile(dataFile, DATA_HEADER + JSON.stringify(courses, null, 2) + ";\n");

  const sidecar = join(process.cwd(), "public", "courses", "routes", `${course.id}.json`);
  await writeFile(
    sidecar,
    JSON.stringify({
      id: course.id,
      source: "curated",
      editedAt: new Date().toISOString().slice(0, 10),
      segments,
    }),
  );

  return NextResponse.json({
    ok: true,
    isNew,
    paths: [`src/data/themeCoursesData.ts`, `public/courses/routes/${course.id}.json`],
  });
}
