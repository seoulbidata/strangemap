/**
 * 코스 동선 최적화(TSP) 벤치마크
 *
 *   node --experimental-strip-types scripts/bench-tsp.mts
 *
 * 1) 후보 풀 크기 N을 늘려가며 전체 파이프라인(군집 선택 → 5곳 순서 최적화) 실행 시간 측정
 * 2) 스톱 수 n을 늘려가며 순서 최적화 단독 실행 시간 측정 (exact / held-karp / 2-opt)
 * 3) 품질 검증: 정확해 대비 휴리스틱 오차, 10km 상한·스톱 수 상한 준수 여부
 */
import {
  optimizeCourseOrder,
  planCourse,
  selectCluster,
  haversineKm,
  type TimedStop,
} from "../src/lib/courseRouting.ts";

// 서울 대략 bbox 안에 재현 가능한 의사난수 장소 생성
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATS = ["공원·자연", "한강", "관광·역사", "상권·역세권", "야경·전망"];
function makePool(n: number, seed = 42) {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => ({
    lat: 37.45 + rnd() * 0.16,   // 37.45 ~ 37.61
    lng: 126.85 + rnd() * 0.28,  // 126.85 ~ 127.13
    category: CATS[Math.floor(rnd() * CATS.length)],
    operatingHours: rnd() < 0.4 ? { start: 0, end: 24 } : { start: 9, end: 18 + Math.floor(rnd() * 6) },
    id: i,
  }));
}

function bench(label: string, iters: number, fn: () => void) {
  fn(); // 워밍업
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  const ms = (performance.now() - t0) / iters;
  console.log(`${label.padEnd(58)} ${ms >= 1 ? ms.toFixed(2) : ms.toFixed(4)} ms/call`);
  return ms;
}

console.log("=== 1) 전체 파이프라인: 풀 N → 군집(반경 3km, 상한 12) → 5곳 planCourse ===");
const WEIGHT = { "공원·자연": 3, "한강": 3, "야경·전망": 1 };
for (const N of [71, 200, 500, 1000, 2000, 5000]) {
  const pool = makePool(N);
  bench(`pool N=${N}`, N > 1000 ? 5 : 20, () => {
    const cluster = selectCluster(pool, WEIGHT, { radiusKm: 3.0, max: 12 });
    // AI가 12곳 중 5곳을 고른 상황을 시뮬레이션(앞 5곳)
    const picked = cluster.slice(0, 5) as TimedStop[];
    planCourse(picked, { maxStops: 5, minStops: 3, maxTotalKm: 10, startHour: 14 });
  });
}

console.log("\n=== 2) 순서 최적화 단독: 스톱 수 n 스케일링 ===");
for (const n of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 20, 30, 50]) {
  const stops = makePool(n, 7) as TimedStop[];
  const iters = n <= 8 ? 500 : n <= 12 ? 50 : n <= 13 ? 10 : 100;
  let method = "";
  bench(`n=${String(n).padEnd(2)} (시간창 포함)`, iters, () => {
    method = optimizeCourseOrder(stops, { startHour: 10 }).method;
  });
  console.log(`      └ method: ${method}`);
}

console.log("\n=== 3) 품질 검증 ===");
// 3-1. 휴리스틱 vs 정확해 (n=8에서 2-opt 강제 비교를 위해 내부 로직 대신 결과 거리 비교)
let worst = 0;
let sumRatio = 0;
const TRIALS = 200;
for (let t = 0; t < TRIALS; t++) {
  const stops = makePool(8, 1000 + t) as TimedStop[];
  const exact = optimizeCourseOrder(stops); // n=8 → exact
  // 최근접+2-opt 근사치를 얻기 위해 n=8 스톱을 복제 없이 직접 비교할 수 없으므로
  // 같은 인스턴스에서 무작위 순서(입력 순서 그대로) 경로와 비교해 개선율을 본다.
  let inputKm = 0;
  for (let i = 1; i < stops.length; i++)
    inputKm += haversineKm(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng);
  const ratio = inputKm / exact.totalKm;
  sumRatio += ratio;
  if (ratio > worst) worst = ratio;
}
console.log(
  `입력 순서(무작위) 대비 정확해 개선: 평균 ${ (sumRatio / TRIALS).toFixed(2) }배, 최악 ${worst.toFixed(2)}배 (n=8, ${TRIALS}회)`
);

// 3-2. 제약 준수: 10km 상한 + 스톱 상한
let capOk = 0;
let stopOk = 0;
for (let t = 0; t < TRIALS; t++) {
  const stops = makePool(7, 5000 + t) as TimedStop[]; // 7곳 → 5곳으로 줄여야 함
  const r = planCourse(stops, { maxStops: 5, minStops: 3, maxTotalKm: 10, startHour: 14 });
  if (r.ordered.length <= 5 && r.ordered.length >= 3) stopOk++;
  if (r.totalKm <= 10 || r.ordered.length === 3) capOk++; // minStops 도달 시 초과 허용(빈손 방지)
}
console.log(`스톱 수 3~5 준수: ${stopOk}/${TRIALS}, 10km 상한(또는 minStops 도달): ${capOk}/${TRIALS}`);

// 3-3. 시간창: 야간 시작(19시) 시 09-18시 장소가 뒤로 밀리지 않고 위반으로 집계되는지
const nightStops: TimedStop[] = [
  { lat: 37.55, lng: 126.98, operatingHours: { start: 9, end: 18 } },
  { lat: 37.56, lng: 126.99, operatingHours: { start: 0, end: 24 } },
  { lat: 37.57, lng: 127.0, operatingHours: { start: 9, end: 23 } },
  { lat: 37.58, lng: 127.01, operatingHours: { start: 0, end: 24 } },
];
const nightRes = optimizeCourseOrder(nightStops, { startHour: 19 });
console.log(
  `야간(19시 시작) 시간창: 위반 ${nightRes.violations}건 — 09-18시 장소가 첫 방문이 아니면 위반 최소화 실패`
);
const firstIsDaytime =
  nightRes.ordered[0].operatingHours?.start === 9 && nightRes.ordered[0].operatingHours?.end === 18;
console.log(`첫 방문이 09-18시 장소인가(19시엔 이미 닫혀 불가피 위반): ${firstIsDaytime ? "예" : "아니오"} → 위반 ${nightRes.violations}건이 최소인지 수동 확인용`);
