/**
 * 코스 폴리라인 사전 계산 스크립트 (빌드 타임 1회 실행)
 *
 *   node --experimental-strip-types scripts/precompute-routes.mts
 *
 * 각 테마 코스의 인접 스톱 사이를 공개 OSRM driving 프로파일로 라우팅해
 * 도로에 스냅된 폴리라인을 public/courses/routes/<id>.json 으로 저장한다.
 * 런타임(MapView)은 이 JSON만 읽어 그리므로 라우팅 API 호출이 없다.
 *
 * 코스 좌표를 바꾸면 이 스크립트를 다시 실행할 것.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { THEME_COURSES, type CourseSegment } from "../src/data/themeCourses.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "courses", "routes");
const OSRM = "https://router.project-osrm.org/route/v1/driving";
const WALK_MAX_M = 1500; // 직선거리 이하이면 도보 구간으로 표시

function haversine(a: Pt, b: Pt): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

interface Pt {
  lat: number;
  lng: number;
}

async function routeGeometry(a: Pt, b: Pt): Promise<Pt[]> {
  const url = `${OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = (await res.json()) as {
    code: string;
    routes?: { geometry: { coordinates: [number, number][] } }[];
  };
  const coords = data.routes?.[0]?.geometry?.coordinates;
  if (data.code !== "Ok" || !coords) return [];
  return coords.map((c) => ({ lat: c[1], lng: c[0] }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const course of THEME_COURSES) {
    const segments: CourseSegment[] = [];
    for (let i = 0; i < course.stops.length - 1; i++) {
      const a = course.stops[i];
      const b = course.stops[i + 1];
      const straight = haversine(a, b);
      const mode: CourseSegment["mode"] = straight <= WALK_MAX_M ? "walk" : "transit";

      let points: Pt[] = [];
      try {
        points = await routeGeometry(a, b);
      } catch (e) {
        console.warn(`  ! ${course.id} seg ${i} OSRM 실패 (${(e as Error).message}) → 직선 폴백`);
      }
      // 라우팅 실패 시 직선 2점 폴백 (런타임이 보간)
      if (points.length < 2) points = [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }];

      segments.push({ mode, points });
      await sleep(250); // 공개 OSRM 레이트리밋 배려
    }

    const file = join(OUT_DIR, `${course.id}.json`);
    await writeFile(file, JSON.stringify({ id: course.id, segments }));
    const pts = segments.reduce((n, s) => n + s.points.length, 0);
    console.log(`✓ ${course.id}: ${segments.length}구간 / ${pts}점 → ${file}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
