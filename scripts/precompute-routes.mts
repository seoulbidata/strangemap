/**
 * 코스 폴리라인 사전 계산 스크립트 (빌드 타임 1회 실행)
 *
 *   node --experimental-strip-types scripts/precompute-routes.mts
 *
 * 각 테마 코스의 인접 스톱 사이를 OSRM으로 라우팅해 도로 스냅 폴리라인을
 * public/courses/routes/<id>.json 으로 저장한다. 런타임(MapView)은 이 JSON만
 * 읽어 그리므로 라우팅 API 호출이 없다. 코스 좌표를 바꾸면 재실행할 것.
 *
 * 우회 가드(런타임 /api/transit/walk 와 동일 정책):
 *   공개 OSRM 데모 서버는 URL 프로파일과 무관하게 자동차 그래프로 라우팅하므로
 *   (실측: 잠원→반포한강공원 직선 0.28km에 경로 5.69km), 한강공원·궁궐 담장처럼
 *   보행 진입로가 차량 도로망에 없는 구간은 램프를 도는 괴물 루프가 나온다.
 *   경로 길이 > 직선 × 2.5 + 0.6km 이면 폐기하고 직선 보간(25점)으로 저장한다.
 *   이런 구간은 라우터로는 답이 없으므로 에디터로 손수 그리는 것이 최종 해법이며,
 *   손수 그린 파일(source: "curated")은 이 스크립트가 덮어쓰지 않는다.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { THEME_COURSES, type CourseSegment } from "../src/data/themeCourses.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "courses", "routes");
// foot 프로파일 표기는 공개 서버에선 무시되지만, 자체 호스팅 OSRM으로 옮길 때를 대비해 유지
const OSRM = "https://router.project-osrm.org/route/v1/foot";
const WALK_MAX_M = 1500; // 직선거리 이하이면 도보 구간으로 표시

interface Pt {
  lat: number;
  lng: number;
}

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

/** 비정상 우회 한도(m) — src/app/api/transit/walk/route.ts 의 detourLimitKm 과 동일 정책 */
const detourLimitM = (straightM: number) => straightM * 2.5 + 600;

/** 직선 보간 25점 — 런타임 애니메이션이 부드럽게 그려지도록 */
function straightPoints(a: Pt, b: Pt): Pt[] {
  const N = 24;
  return Array.from({ length: N + 1 }, (_, k) => ({
    lat: a.lat + (b.lat - a.lat) * (k / N),
    lng: a.lng + (b.lng - a.lng) * (k / N),
  }));
}

function polylineMeters(points: Pt[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += haversine(points[i - 1], points[i]);
  return m;
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
  let discarded = 0;

  for (const course of THEME_COURSES) {
    const file = join(OUT_DIR, `${course.id}.json`);

    // 에디터로 손수 그린 코스는 보호 — 자동 재생성으로 덮어쓰지 않는다
    try {
      const existing = JSON.parse(await readFile(file, "utf8"));
      if (existing.source === "curated") {
        console.log(`↷ ${course.id}: curated — 건너뜀`);
        continue;
      }
    } catch {
      /* 파일 없으면 신규 생성 */
    }

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

      // 우회 가드: 차량 램프 루프는 그리지 않고 직선 보간으로 대체
      if (points.length >= 2) {
        const routeM = polylineMeters(points);
        if (routeM > detourLimitM(straight)) {
          console.warn(
            `  ⚠ ${course.id} seg ${i} ${a.name}→${b.name}: 직선 ${(straight / 1000).toFixed(2)}km vs 경로 ${(routeM / 1000).toFixed(2)}km → 우회 폐기, 직선 보간`
          );
          points = [];
          discarded++;
        }
      }
      if (points.length < 2) points = straightPoints(a, b);

      segments.push({ mode, points });
      await sleep(250); // 공개 OSRM 레이트리밋 배려
    }

    await writeFile(
      file,
      JSON.stringify({
        id: course.id,
        source: "auto",
        generatedAt: new Date().toISOString().slice(0, 10),
        segments,
      })
    );
    const pts = segments.reduce((n, s) => n + s.points.length, 0);
    console.log(`✓ ${course.id}: ${segments.length}구간 / ${pts}점 → ${file}`);
  }
  console.log(`\n완료 — 우회 폐기 후 직선 대체 ${discarded}구간 (에디터로 손수 그리면 품질 개선 가능)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
