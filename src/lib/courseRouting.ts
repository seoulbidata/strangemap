/**
 * 코스 동선 최적화 모듈 — 오픈 패스 TSP + 운영시간(시간창) 제약 + 총거리 상한
 *
 * 역할 분리 원칙:
 *  - "어떤 장소를 고를까"(의미 매칭)는 AI(Gemini)가 담당하고,
 *  - "어떤 순서로 이을까"(기하 최적화)는 이 모듈이 결정적으로 푼다.
 *  AI가 돌려준 순서를 그대로 쓰지 않으므로 지그재그 동선이 구조적으로 사라진다.
 *
 * 알고리즘 선택(스톱 수 n 기준):
 *  - n ≤ 8   : 전수 순열 탐색 — 운영시간 제약까지 반영한 "제약 포함 정확해".
 *              (8! = 40,320 순열, 1ms 미만 — 서울로 코스는 3~5곳이라 항상 이 경로)
 *  - n ≤ 13  : Held-Karp DP — 거리 기준 정확해 + 시간창은 방향(정/역) 선택으로 보정.
 *  - n > 13  : 최근접 이웃 + 2-opt 휴리스틱 — 교차(cross) 제거 보장.
 *
 * 거리 모델: 직선(haversine) × detourFactor(기본 1.3)로 실보행 거리를 근사.
 * 실제 폴리라인 그리기는 MapView가 별도로 하므로(사전계산 JSON/OSRM),
 * 여기서는 "순서 결정"에 필요한 상대 비교만 하면 충분하다.
 */

// ── 공통 타입 ────────────────────────────────────────────────────────────────

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** 운영시간이 있으면 시간창 제약으로 반영된다. [start, end) 시각, 0~24 = 상시 */
export interface TimedStop extends GeoPoint {
  operatingHours?: { start: number; end: number };
}

export interface OptimizeOptions {
  /** 코스 시작 시각(0~23). 지정 시 운영시간 위반을 함께 최소화한다 */
  startHour?: number;
  /** 스톱당 평균 체류 시간(시간 단위, 기본 1h) */
  dwellHours?: number;
  /** 보행 속도 km/h (기본 4) */
  walkSpeedKmH?: number;
  /** 직선거리 → 실보행 거리 보정계수 (기본 1.3) */
  detourFactor?: number;
}

export interface OptimizeResult<T> {
  ordered: T[];
  /** 직선거리 합(km, 보정 전) — UI 표기·상한 판정 기준 */
  totalKm: number;
  /** 운영시간 위반 스톱 수 (startHour 미지정 시 0) */
  violations: number;
  method: "exact" | "held-karp" | "2-opt";
}

export interface PlanOptions extends OptimizeOptions {
  /** 코스에 담을 최대 스톱 수 (기본 5) */
  maxStops?: number;
  /** 거리 상한 적용 시에도 유지할 최소 스톱 수 (기본 3) */
  minStops?: number;
  /** 코스 총거리 상한 km (기본 10) — 초과 시 기여도 낮은 스톱부터 제거 */
  maxTotalKm?: number;
}

// ── 거리 ────────────────────────────────────────────────────────────────────

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** 대칭 거리 행렬 (n×n, km) */
export function buildDistanceMatrix(stops: GeoPoint[]): number[][] {
  const n = stops.length;
  const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineKm(stops[i].lat, stops[i].lng, stops[j].lat, stops[j].lng);
      m[i][j] = d;
      m[j][i] = d;
    }
  }
  return m;
}

function pathKm(order: number[], m: number[][]): number {
  let km = 0;
  for (let i = 1; i < order.length; i++) km += m[order[i - 1]][order[i]];
  return km;
}

// ── 시간창(운영시간) 평가 ────────────────────────────────────────────────────

/**
 * 순서대로 방문할 때 각 스톱 도착 시각을 추정해 운영시간 위반 수를 센다.
 * 도착 추정: startHour + Σ(구간 보행시간) + 방문한 스톱 수 × dwell.
 * 자정을 넘기는 도착은 상시(0~24) 장소가 아니면 위반으로 본다.
 */
function countTimeViolations(
  order: number[],
  stops: TimedStop[],
  m: number[][],
  opts: Required<Pick<OptimizeOptions, "dwellHours" | "walkSpeedKmH" | "detourFactor">> & {
    startHour: number;
  }
): number {
  let violations = 0;
  let clock = opts.startHour;
  for (let i = 0; i < order.length; i++) {
    if (i > 0) clock += (m[order[i - 1]][order[i]] * opts.detourFactor) / opts.walkSpeedKmH;
    const hours = stops[order[i]].operatingHours;
    if (hours && !(hours.start === 0 && hours.end === 24)) {
      if (clock >= 24 || clock < hours.start || clock >= hours.end) violations++;
    }
    clock += opts.dwellHours;
  }
  return violations;
}

// ── 정확해 1: 전수 순열 (n ≤ 8) — 시간창 제약 포함 ──────────────────────────

function permutations(indices: number[]): number[][] {
  if (indices.length <= 1) return [indices];
  const out: number[][] = [];
  for (let i = 0; i < indices.length; i++) {
    const rest = [...indices.slice(0, i), ...indices.slice(i + 1)];
    for (const p of permutations(rest)) out.push([indices[i], ...p]);
  }
  return out;
}

function exactOpenPath(
  stops: TimedStop[],
  m: number[][],
  opts: OptimizeOptions
): { order: number[]; km: number; violations: number } {
  const n = stops.length;
  const timeOpts =
    opts.startHour !== undefined
      ? {
          startHour: opts.startHour,
          dwellHours: opts.dwellHours ?? 1,
          walkSpeedKmH: opts.walkSpeedKmH ?? 4,
          detourFactor: opts.detourFactor ?? 1.3,
        }
      : null;

  let best: { order: number[]; km: number; violations: number } | null = null;
  for (const order of permutations(Array.from({ length: n }, (_, i) => i))) {
    // 시간창이 없으면 정/역방향 거리가 같으므로 절반만 평가
    if (!timeOpts && order[0] > order[n - 1]) continue;
    const km = pathKm(order, m);
    const violations = timeOpts ? countTimeViolations(order, stops, m, timeOpts) : 0;
    if (
      !best ||
      violations < best.violations ||
      (violations === best.violations && km < best.km)
    ) {
      best = { order, km, violations };
    }
  }
  return best!;
}

// ── 정확해 2: Held-Karp 오픈 패스 (n ≤ 13) — 거리 기준 ──────────────────────

function heldKarpOpenPath(m: number[][]): { order: number[]; km: number } {
  const n = m.length;
  const FULL = 1 << n;
  // dp[mask][last] = mask 집합을 방문하고 last에서 끝나는 최단 경로 길이
  const dp: Float64Array[] = Array.from({ length: FULL }, () => new Float64Array(n).fill(Infinity));
  const parent: Int8Array[] = Array.from({ length: FULL }, () => new Int8Array(n).fill(-1));
  for (let i = 0; i < n; i++) dp[1 << i][i] = 0; // 시작점 자유

  for (let mask = 1; mask < FULL; mask++) {
    for (let last = 0; last < n; last++) {
      if (!(mask & (1 << last)) || dp[mask][last] === Infinity) continue;
      for (let next = 0; next < n; next++) {
        if (mask & (1 << next)) continue;
        const nm = mask | (1 << next);
        const nd = dp[mask][last] + m[last][next];
        if (nd < dp[nm][next]) {
          dp[nm][next] = nd;
          parent[nm][next] = last;
        }
      }
    }
  }

  let bestEnd = 0;
  let bestKm = Infinity;
  for (let last = 0; last < n; last++) {
    if (dp[FULL - 1][last] < bestKm) {
      bestKm = dp[FULL - 1][last];
      bestEnd = last;
    }
  }
  // 경로 복원
  const order: number[] = [];
  let mask = FULL - 1;
  let cur = bestEnd;
  while (cur !== -1) {
    order.unshift(cur);
    const p = parent[mask][cur];
    mask &= ~(1 << cur);
    cur = p;
  }
  return { order, km: bestKm };
}

// ── 휴리스틱: 최근접 이웃 + 2-opt (n > 13) ───────────────────────────────────

function nearestNeighborOrder(m: number[][], start: number): number[] {
  const n = m.length;
  const visited = new Array<boolean>(n).fill(false);
  const order = [start];
  visited[start] = true;
  while (order.length < n) {
    const last = order[order.length - 1];
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && m[last][i] < bestD) {
        bestD = m[last][i];
        best = i;
      }
    }
    order.push(best);
    visited[best] = true;
  }
  return order;
}

/** 2-opt: 경로 교차를 제거할 때까지 구간 반전을 반복 (오픈 패스 버전) */
function twoOptImprove(order: number[], m: number[][]): number[] {
  const n = order.length;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < n - 2; i++) {
      for (let j = i + 1; j < n - 1; j++) {
        // (i-1→i)+(j→j+1) 를 (i-1→j)+(i→j+1) 로 교체했을 때의 이득
        const a = i === 0 ? 0 : m[order[i - 1]][order[i]];
        const b = m[order[j]][order[j + 1]];
        const c = i === 0 ? 0 : m[order[i - 1]][order[j]];
        const d = m[order[i]][order[j + 1]];
        if (c + d < a + b - 1e-9) {
          // order[i..j] 반전
          let lo = i;
          let hi = j;
          while (lo < hi) {
            [order[lo], order[hi]] = [order[hi], order[lo]];
            lo++;
            hi--;
          }
          improved = true;
        }
      }
    }
  }
  return order;
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

const EXACT_MAX = 8;
const HELD_KARP_MAX = 13;

/**
 * 오픈 패스(출발지 복귀 없음) 방문 순서 최적화.
 * 스톱 수에 따라 정확해/휴리스틱을 자동 선택하고,
 * startHour가 있으면 운영시간 위반 최소화를 거리보다 우선한다.
 */
export function optimizeCourseOrder<T extends TimedStop>(
  stops: T[],
  opts: OptimizeOptions = {}
): OptimizeResult<T> {
  if (stops.length <= 2) {
    const km = stops.length === 2 ? haversineKm(stops[0].lat, stops[0].lng, stops[1].lat, stops[1].lng) : 0;
    return { ordered: [...stops], totalKm: km, violations: 0, method: "exact" };
  }

  const m = buildDistanceMatrix(stops);
  const timeOpts =
    opts.startHour !== undefined
      ? {
          startHour: opts.startHour,
          dwellHours: opts.dwellHours ?? 1,
          walkSpeedKmH: opts.walkSpeedKmH ?? 4,
          detourFactor: opts.detourFactor ?? 1.3,
        }
      : null;

  if (stops.length <= EXACT_MAX) {
    const { order, km, violations } = exactOpenPath(stops, m, opts);
    return { ordered: order.map((i) => stops[i]), totalKm: km, violations, method: "exact" };
  }

  let order: number[];
  let method: OptimizeResult<T>["method"];
  if (stops.length <= HELD_KARP_MAX) {
    order = heldKarpOpenPath(m).order;
    method = "held-karp";
  } else {
    order = twoOptImprove(nearestNeighborOrder(m, 0), m);
    method = "2-opt";
  }

  // 시간창이 있으면 정방향/역방향 중 위반이 적은 쪽 선택 (거리는 동일)
  let violations = 0;
  if (timeOpts) {
    const fwd = countTimeViolations(order, stops, m, timeOpts);
    const rev = countTimeViolations([...order].reverse(), stops, m, timeOpts);
    if (rev < fwd) order = [...order].reverse();
    violations = Math.min(fwd, rev);
  }
  return { ordered: order.map((i) => stops[i]), totalKm: pathKm(order, m), violations, method };
}

/**
 * 코스 계획: 순서 최적화 → 총거리 상한 초과 시 "빼면 가장 절약되는" 스톱부터
 * 제거하고 재최적화. minStops까지 줄여도 초과하면 그 상태로 반환한다(빈손 방지).
 */
export function planCourse<T extends TimedStop>(
  stops: T[],
  opts: PlanOptions = {}
): OptimizeResult<T> {
  const maxStops = opts.maxStops ?? 5;
  const minStops = opts.minStops ?? 3;
  const maxTotalKm = opts.maxTotalKm ?? 10;

  let current = [...stops];
  let result = optimizeCourseOrder(current, opts);

  // 스톱 수 상한: 초과분은 제거 시 경로 절약이 가장 큰 것부터 뺀다
  while (result.ordered.length > maxStops) {
    current = removeCheapestStop(result.ordered);
    result = optimizeCourseOrder(current, opts);
  }

  // 총거리 상한
  while (result.totalKm > maxTotalKm && result.ordered.length > minStops) {
    current = removeCheapestStop(result.ordered);
    result = optimizeCourseOrder(current, opts);
  }
  return result;
}

/** 최적화된 순서에서 "빼면 경로가 가장 짧아지는" 스톱 하나를 제거 */
function removeCheapestStop<T extends GeoPoint>(ordered: T[]): T[] {
  const n = ordered.length;
  let bestIdx = 0;
  let bestSaving = -Infinity;
  for (let i = 0; i < n; i++) {
    const prev = ordered[i - 1];
    const next = ordered[i + 1];
    const inCost =
      (prev ? haversineKm(prev.lat, prev.lng, ordered[i].lat, ordered[i].lng) : 0) +
      (next ? haversineKm(ordered[i].lat, ordered[i].lng, next.lat, next.lng) : 0);
    const bridge = prev && next ? haversineKm(prev.lat, prev.lng, next.lat, next.lng) : 0;
    const saving = inCost - bridge;
    if (saving > bestSaving) {
      bestSaving = saving;
      bestIdx = i;
    }
  }
  return ordered.filter((_, i) => i !== bestIdx);
}

// ── 후보 군집 선택 (ai-recommend에서 이동) ──────────────────────────────────

export interface ClusterOptions {
  /** 군집 반경 km (기본 3.0 — 도보·짧은 이동 가능 범위) */
  radiusKm?: number;
  /** 반환 상한 (기본 12 — 프롬프트로 넘길 후보 수) */
  max?: number;
  /** 이 개수 이하면 군집 생략 (기본 5) */
  skipBelow?: number;
}

/**
 * 가까운 장소끼리 군집을 만들어, 목적 적합도가 가장 높은 한 군집만 후보로 선택한다.
 * → AI가 고른 스톱들이 흩어지지 않고 자연스러운 한 동선으로 이어지도록 "거리"를 사전 반영.
 */
export function selectCluster<T extends { category: string; lat: number; lng: number }>(
  cands: T[],
  categoryWeight: Partial<Record<string, number>>,
  opts: ClusterOptions = {}
): T[] {
  const radiusKm = opts.radiusKm ?? 3.0;
  const max = opts.max ?? 12;
  const skipBelow = opts.skipBelow ?? 5;

  if (cands.length <= skipBelow) return cands;
  const wScore = (c: T) => categoryWeight[c.category] ?? 0;

  // 각 후보를 앵커로 삼아 반경 내 이웃을 모으고, 군집 크기 + 목적 적합도로 점수화
  let best: { members: T[]; anchor: T; score: number } | null = null;
  for (const anchor of cands) {
    const members = cands.filter(
      (c) => haversineKm(anchor.lat, anchor.lng, c.lat, c.lng) <= radiusKm
    );
    const score = members.length + members.reduce((s, c) => s + wScore(c), 0) + wScore(anchor) * 2;
    if (!best || score > best.score) best = { members, anchor, score };
  }
  const { members, anchor } = best!;
  // 목적 적합 우선 → 앵커 근접 우선으로 정렬 후 상한 적용
  return [...members]
    .sort(
      (a, b) =>
        wScore(b) - wScore(a) ||
        haversineKm(anchor.lat, anchor.lng, a.lat, a.lng) -
          haversineKm(anchor.lat, anchor.lng, b.lat, b.lng)
    )
    .slice(0, max);
}
