import { NextRequest, NextResponse } from "next/server";
import { SUBWAY_RAIL_GEOMETRY, SUBWAY_SEGMENT_GEOMETRY } from "@/data/subwayRailGeometry";

const SEOUL_OPENAPI_BASE = "http://openapi.seoul.go.kr:8088";
const ENABLE_OVERPASS_RAIL_SHAPES = process.env.ENABLE_OVERPASS_RAIL_SHAPES === "true";

type Point = { lat: number; lng: number };
type StationPoint = { id: string; name: string; lat: number; lng: number };
type RailWay = { points: Point[] };
type GraphEdge = { to: string; weight: number };
type RailGraph = { nodes: Map<string, Point>; edges: Map<string, GraphEdge[]> };
type StationRow = { id: string; order: number; name: string };

let stationMasterCoordsCache: Map<string, Point> | null = null;
const lineRowsCache = new Map<string, StationRow[]>();
const segmentShapeCache = new Map<string, { ts: number; body: { points: Point[]; source: string } }>();
const segmentShapeInflight = new Map<string, Promise<{ points: Point[]; source: string }>>();
const SEGMENT_SHAPE_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeStationName(v: string) {
  return v
    .replace(/<[^>]+>/g, "")
    .replace(/\(.+?\)/g, "")
    .replace(/\s+\d+호선$/, "")
    .replace(/\s+[가-힣]+선$/, "")
    .replace(/역$/, "")
    .trim();
}

function normalizeLineName(v: string) {
  return v
    .replace(/^(수도권|지하철)\s*/, "")
    .replace(/[\s·•・]/g, "")
    .replace(/\(.+?\)/g, "")
    .replace(/^0+(\d+호선)$/, "$1");
}

// 서울 API는 통합 노선을 구성 노선명으로 분리 저장
const SEOUL_LINE_COMPONENTS: Record<string, string[]> = {
  "1호선": ["1호선", "경부선", "경인선", "경원선", "장항선"],
  "2호선": ["2호선"],
  "3호선": ["3호선", "일산선"],
  "4호선": ["4호선", "과천선", "안산선", "진접선"],
  "5호선": ["5호선", "하남선"],
  "6호선": ["6호선"],
  "7호선": ["7호선", "7호선(인천)"],
  "8호선": ["8호선", "별내선"],
  "9호선": ["9호선", "9호선(연장)"],
  "경의중앙선": ["경의선", "중앙선", "경원선", "경부선", "용산선", "경의중앙선"],
  "수인분당선": ["수인선", "분당선", "수인분당선"],
  "공항철도": ["공항철도", "공항철도1호선"],
  "경춘선": ["경춘선", "중앙선"],
  "신분당선": ["신분당선", "신분당선(연장)", "신분당선(연장2)"],
  "우이신설선": ["우이신설선", "우이신설경전철"],
  "신림선": ["신림선"],
  "서해선": ["서해선"],
  "김포골드라인": ["김포골드라인", "김포도시철도"],
  "인천1호선": ["인천1호선", "인천 도시철도 1호선"],
  "인천2호선": ["인천2호선", "인천 도시철도 2호선"],
  "의정부경전철": ["의정부경전철", "의정부선"],
  "용인경전철": ["용인경전철", "에버라인선"],
  "경강선": ["경강선"],
};

// 서울 API 분리 노선명 → 통합 노선명 역매핑 (다대다 대응 지원)
const SEOUL_LINE_MERGED: Record<string, string[]> = {};
for (const [merged, parts] of Object.entries(SEOUL_LINE_COMPONENTS)) {
  for (const part of parts) {
    if (!SEOUL_LINE_MERGED[part]) {
      SEOUL_LINE_MERGED[part] = [];
    }
    SEOUL_LINE_MERGED[part].push(merged);
  }
}

function lineNameCandidates(v: string) {
  const normalized = normalizeLineName(v);
  const candidates = [v, normalized];
  const numberMatch = normalized.match(/^(\d+)호선$/);
  if (numberMatch) candidates.push(numberMatch[1].padStart(2, "0") + "호선");
  if (SEOUL_LINE_COMPONENTS[normalized]) candidates.push(...SEOUL_LINE_COMPONENTS[normalized]);
  if (SEOUL_LINE_MERGED[normalized]) candidates.push(...SEOUL_LINE_MERGED[normalized]);
  return [...new Set(candidates.filter(Boolean))];
}

function shortCode(v: string) {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 3 ? digits.slice(-3) : digits;
}

function stationOrderCode(lineName: string, frCode: string, stationCd: string) {
  const normalizedLine = normalizeLineName(lineName);
  
  if (normalizedLine === "경의중앙선") {
    const digits = frCode.replace(/\D/g, "");
    const codeVal = parseInt(digits || "0", 10);
    
    if (frCode.startsWith("K") && codeVal >= 312 && codeVal <= 337) {
      // 경의선 구간 (문산 K335 ~ 공덕 K312): 서쪽에서 동쪽으로 갈수록 숫자가 작아짐
      return 1000 - codeVal; // K337 (663) -> K312 (688)
    }
    if (frCode.startsWith("P") && (codeVal === 312 || codeVal === 313)) {
      // 경의선 서울역 지선 (가좌 K315 -> 신촌 P312 -> 서울 P313)
      return codeVal === 312 ? 686 : 687;
    }
    if (frCode === "K826" || frCode.replace(/\D/g, "") === "826") {
      // 효창공원앞 (K826): 공덕 K312와 용산 K110 사이
      return 689;
    }
    if (frCode.startsWith("K") && codeVal >= 110 && codeVal <= 138) {
      // 중앙선 구간 (용산 K110 ~ 지평 K138): 서쪽에서 동쪽으로 갈수록 숫자가 커짐
      return 690 + (codeVal - 110); // K110 (690) -> K138 (718)
    }
  }

  const digits = (frCode || stationCd || "").replace(/\D/g, "");
  return parseInt(digits || "0", 10);
}

function distance(a: Point, b: Point) {
  const dx = (a.lng - b.lng) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const dy = a.lat - b.lat;
  return Math.sqrt(dx * dx + dy * dy) * 111_320;
}

function catmullRom(a: number, b: number, c: number, d: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * b) +
    (-a + c) * t +
    (2 * a - 5 * b + 4 * c - d) * t2 +
    (-a + 3 * b - 3 * c + d) * t3
  );
}

function asPoint(point: Point): Point {
  return { lat: point.lat, lng: point.lng };
}

function buildDensifiedLine(from: Point, to: Point): Point[] {
  const segmentDistance = distance(from, to);
  const steps = Math.max(2, Math.min(18, Math.round(segmentDistance / 140)));
  const points: Point[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    points.push({
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
    });
  }
  return points;
}

function buildSmoothedStationPolyline(stations: StationPoint[]): Point[] {
  if (stations.length < 2) return stations.map(asPoint);
  if (stations.length < 3) return buildDensifiedLine(stations[0], stations[1]);

  const points: Point[] = [];
  for (let i = 0; i < stations.length - 1; i += 1) {
    const p0 = stations[Math.max(0, i - 1)];
    const p1 = stations[i];
    const p2 = stations[i + 1];
    const p3 = stations[Math.min(stations.length - 1, i + 2)];
    const segmentDistance = distance(p1, p2);
    const steps = Math.max(6, Math.min(22, Math.round(segmentDistance / 110)));

    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      appendPoints(points, [{
        lat: catmullRom(p0.lat, p1.lat, p2.lat, p3.lat, t),
        lng: catmullRom(p0.lng, p1.lng, p2.lng, p3.lng, t),
      }]);
    }
  }

  const lastStation = stations[stations.length - 1];
  appendPoints(points, [{ lat: lastStation.lat, lng: lastStation.lng }]);
  return points;
}

function pointKey(point: Point) {
  return `${point.lat.toFixed(7)},${point.lng.toFixed(7)}`;
}

function coordKey(lineName: string, stationName: string) {
  return `${normalizeLineName(lineName)}:${normalizeStationName(stationName)}`;
}

async function fetchStationMasterCoords(masterKey: string) {
  if (stationMasterCoordsCache) return stationMasterCoordsCache;

  const res = await fetch(`${SEOUL_OPENAPI_BASE}/${masterKey}/json/subwayStationMaster/1/1000/`);
  const data = await res.json();
  const rows = data.subwayStationMaster?.row ?? [];
  const coords = new Map<string, { lat: number; lng: number }>();

  for (const row of rows as Record<string, string>[]) {
    const line = normalizeLineName(row.ROUTE ?? "");
    const name = normalizeStationName(row.BLDN_NM ?? "");
    const lat = parseFloat(row.LAT ?? "");
    const lng = parseFloat(row.LOT ?? "");
    if (!line || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    coords.set(coordKey(line, name), { lat, lng });
    // 분리 저장된 노선을 통합 노선명으로도 색인
    const mergedLines = SEOUL_LINE_MERGED[line] ?? [];
    for (const mergedLine of mergedLines) {
      coords.set(coordKey(mergedLine, name), { lat, lng });
    }
  }

  stationMasterCoordsCache = coords;
  return coords;
}

function nearestPolylineIndex(points: Point[], target: Point) {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const d = distance(points[i], target);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }
  return { index: bestIndex, distance: bestDistance };
}

function findSegmentGeometry(lineName: string, fromName: string, toName: string): Point[] {
  const segments = SUBWAY_SEGMENT_GEOMETRY[normalizeLineName(lineName)] ?? [];
  const from = normalizeStationName(fromName);
  const to = normalizeStationName(toName);
  for (const segment of segments) {
    const segmentFrom = normalizeStationName(segment.from);
    const segmentTo = normalizeStationName(segment.to);
    if (segmentFrom === from && segmentTo === to) return segment.points;
    if (segmentFrom === to && segmentTo === from) return [...segment.points].reverse();
  }
  return [];
}

function sliceCachedPolyline(lineName: string, stations: StationPoint[]): Point[] {
  if (stations.length < 2) return stations;
  const geometry = SUBWAY_RAIL_GEOMETRY[normalizeLineName(lineName)];
  if (!geometry || geometry.points.length < 2) return [];

  const from = stations[0];
  const to = stations[stations.length - 1];
  const fromAnchor = geometry.stations?.[normalizeStationName(from.name)] ?? from;
  const toAnchor = geometry.stations?.[normalizeStationName(to.name)] ?? to;
  const fromIdx = nearestPolylineIndex(geometry.points, fromAnchor);
  const toIdx = nearestPolylineIndex(geometry.points, toAnchor);

  if (fromIdx.index === -1 || toIdx.index === -1) return [];
  if (fromIdx.distance > 1200 || toIdx.distance > 1200) return [];

  const sliced = fromIdx.index <= toIdx.index
    ? geometry.points.slice(fromIdx.index, toIdx.index + 1)
    : geometry.points.slice(toIdx.index, fromIdx.index + 1).reverse();

  return [
    { lat: from.lat, lng: from.lng },
    ...sliced,
    { lat: to.lat, lng: to.lng },
  ];
}

function sliceBestLocalPolyline(lineName: string, stations: StationPoint[]): { points: Point[]; source: string } | null {
  if (stations.length < 2) return { points: stations, source: "station-sequence" };

  const segmentPoints: Point[] = [];
  let segmentHitCount = 0;
  for (let i = 1; i < stations.length; i += 1) {
    const from = stations[i - 1];
    const to = stations[i];
    const segment = findSegmentGeometry(lineName, from.name, to.name);
    if (segment.length >= 2) {
      segmentHitCount += 1;
      appendPoints(segmentPoints, segment);
    } else {
      const localLineSegment = sliceCachedPolyline(lineName, [from, to]);
      appendPoints(segmentPoints, localLineSegment.length >= 2 ? localLineSegment : buildSmoothedStationPolyline([from, to] as StationPoint[]));
    }
  }
  if (segmentHitCount > 0 && segmentPoints.length >= 2) return { points: segmentPoints, source: "local-segment-cache" };

  const cachedPolyline = sliceCachedPolyline(lineName, stations);
  if (cachedPolyline.length >= 2) return { points: cachedPolyline, source: "local-rail-cache" };
  return null;
}

const OSM_LINE_COMPONENTS: Record<string, string[]> = {
  "1호선": ["1호선", "경부선", "경원선", "경인선", "장항선", "용산선"],
  "2호선": ["2호선"],
  "3호선": ["3호선", "일산선"],
  "4호선": ["4호선", "과천선", "안산선", "진접선"],
  "5호선": ["5호선", "하남선"],
  "6호선": ["6호선"],
  "7호선": ["7호선", "서울지하철7호선", "인천도시철도7호선"],
  "8호선": ["8호선", "별내선"],
  "9호선": ["9호선", "9호선연장"],
  "경의중앙선": ["경의중앙선", "경의선", "중앙선", "경원선", "경부선", "용산선"],
  "수인분당선": ["수인분당선", "수인선", "분당선"],
  "공항철도": ["공항철도", "공항철도1호선", "인천국제공항철도"],
  "경춘선": ["경춘선", "중앙선"],
  "신분당선": ["신분당선"],
  "우이신설선": ["우이신설선", "우이신설경전철"],
  "신림선": ["신림선", "신림경전철"],
  "서해선": ["서해선", "대곡소사선"],
  "김포골드라인": ["김포골드라인", "김포도시철도"],
  "인천1호선": ["인천1호선", "인천도시철도1호선", "인천지하철1호선"],
  "인천2호선": ["인천2호선", "인천도시철도2호선", "인천지하철2호선"],
  "의정부경전철": ["의정부경전철", "의정부선"],
  "용인경전철": ["용인경전철", "에버라인", "에버라인선"],
  "경강선": ["경강선"],
};

const OSM_LINE_ENGLISH_ALIASES: Record<string, string[]> = {
  "1호선": ["line 1", "seoul subway line 1", "seoul metro line 1"],
  "2호선": ["line 2", "seoul subway line 2", "seoul metro line 2"],
  "3호선": ["line 3", "seoul subway line 3", "seoul metro line 3"],
  "4호선": ["line 4", "seoul subway line 4", "seoul metro line 4"],
  "5호선": ["line 5", "seoul subway line 5", "seoul metro line 5"],
  "6호선": ["line 6", "seoul subway line 6", "seoul metro line 6"],
  "7호선": ["line 7", "seoul subway line 7", "seoul metro line 7"],
  "8호선": ["line 8", "seoul subway line 8", "seoul metro line 8"],
  "9호선": ["line 9", "seoul subway line 9", "seoul metro line 9"],
  "경의중앙선": ["gyeongui jungang line", "gyeongui-jungang line", "gyeongui line", "jungang line"],
  "수인분당선": ["suin bundang line", "suin-bundang line", "bundang line", "suin line"],
  "공항철도": ["arex", "airport railroad", "airport railway", "incheon airport railroad"],
  "경춘선": ["gyeongchun line"],
  "신분당선": ["shinbundang line", "sinbundang line"],
  "우이신설선": ["ui sinseol line", "ui-sinseol line"],
  "신림선": ["sillim line", "sinlim line"],
  "서해선": ["seohae line"],
  "김포골드라인": ["gimpo goldline", "gimpo gold line"],
  "인천1호선": ["incheon line 1", "incheon subway line 1"],
  "인천2호선": ["incheon line 2", "incheon subway line 2"],
  "의정부경전철": ["u line", "uijeongbu lrt", "uijeongbu light rail"],
  "용인경전철": ["everline", "ever line", "yongin everline"],
  "경강선": ["gyeonggang line"],
};

function lineNumberAliases(normalizedLine: string) {
  const numberMatch = normalizedLine.match(/^(\d+)호선$/);
  if (!numberMatch) return [];
  const n = numberMatch[1];
  return [
    `${n}호선`,
    `서울지하철${n}호선`,
    `수도권전철${n}호선`,
    `Line${n}`,
    `SeoulSubwayLine${n}`,
    `SeoulMetroLine${n}`,
  ];
}

function allowedOsmLineNames(normalizedLine: string) {
  return [
    normalizedLine,
    ...(OSM_LINE_COMPONENTS[normalizedLine] ?? []),
    ...(OSM_LINE_ENGLISH_ALIASES[normalizedLine] ?? []),
    ...lineNumberAliases(normalizedLine),
  ].map((name) => normalizeLineName(name).toLowerCase());
}

function railNameMatches(tags: Record<string, string> | undefined, normalizedLine: string) {
  if (!tags) return false;
  const names = [tags.name, tags["name:ko"], tags.alt_name, tags["alt_name:ko"], tags.ref].filter(Boolean);
  const normalizedAllowed = allowedOsmLineNames(normalizedLine);
  return names.some((name) => {
    const normalizedName = normalizeLineName(name).toLowerCase();
    return normalizedAllowed.some((allowed) => (
      normalizedName === allowed ||
      normalizedName.includes(allowed) ||
      allowed.includes(normalizedName)
    ));
  });
}

function escapeOverpassRegex(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeRailQuery(lineName: string, points: Point[]) {
  const margin = 0.008;
  const minLat = Math.min(...points.map((p) => p.lat)) - margin;
  const maxLat = Math.max(...points.map((p) => p.lat)) + margin;
  const minLng = Math.min(...points.map((p) => p.lng)) - margin;
  const maxLng = Math.max(...points.map((p) => p.lng)) + margin;
  const bbox = `(${minLat},${minLng},${maxLat},${maxLng})`;
  const normalized = normalizeLineName(lineName);
  
  const components = [normalized];
  if (OSM_LINE_COMPONENTS[normalized]) {
    components.push(...OSM_LINE_COMPONENTS[normalized]);
  }
  if (OSM_LINE_ENGLISH_ALIASES[normalized]) {
    components.push(...OSM_LINE_ENGLISH_ALIASES[normalized]);
  }
  components.push(...lineNumberAliases(normalized));
  
  const OVERPASS_DOT_ALIASES: Record<string, string> = {
    "경의중앙선": "경의.중앙선",
    "수인분당선": "수인.분당선",
  };
  const escapedComponents = components.map(c => OVERPASS_DOT_ALIASES[c] ?? escapeOverpassRegex(c));
  const lineRegex = `(${escapedComponents.join("|")})`;
  
  return `[out:json][timeout:25];(` +
    `way["railway"~"subway|light_rail|rail"]["name"~"${lineRegex}",i]${bbox};` +
    `way["railway"~"subway|light_rail|rail"]["name:ko"~"${lineRegex}",i]${bbox};` +
    `way["railway"~"subway|light_rail|rail"]["alt_name"~"${lineRegex}",i]${bbox};` +
    `way["railway"~"subway|light_rail|rail"]["alt_name:ko"~"${lineRegex}",i]${bbox};` +
    `);out tags geom;`;
}

const OVERPASS_MIRRORS = [
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter"
];

async function fetchRailWays(lineName: string, points: Point[]): Promise<RailWay[]> {
  if (points.length < 2) return [];
  const normalizedLine = normalizeLineName(lineName);
  const body = `data=${encodeURIComponent(makeRailQuery(lineName, points))}`;

  const requests = OVERPASS_MIRRORS.map(async (url) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "strangemap-local/1.0",
        },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const elements = Array.isArray(data.elements) ? data.elements : [];
      const ways = elements
        .filter((element: { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }) => (
          Array.isArray(element.geometry) && element.geometry.length >= 2 && railNameMatches(element.tags, normalizedLine)
        ))
        .map((element: { geometry: { lat: number; lon: number }[] }) => ({
          points: element.geometry.map((p) => ({ lat: p.lat, lng: p.lon })),
        }));
      if (!ways.length) throw new Error("No matching rail geometry");
      return ways;
    } catch (e) {
      console.warn(`[Overpass Mirror Fallback] Mirror ${url} failed or timed out:`, e);
      throw e;
    }
  });

  try {
    return await Promise.any(requests);
  } catch {
    return [];
  }
}

function buildRailGraph(ways: RailWay[]): RailGraph {
  const nodes = new Map<string, Point>();
  const edges = new Map<string, GraphEdge[]>();
  const addEdge = (from: string, to: string, weight: number) => {
    const list = edges.get(from) ?? [];
    list.push({ to, weight });
    edges.set(from, list);
  };

  for (const way of ways) {
    for (let i = 0; i < way.points.length; i += 1) {
      const point = way.points[i];
      const key = pointKey(point);
      nodes.set(key, point);
      if (i === 0) continue;
      const prev = way.points[i - 1];
      const prevKey = pointKey(prev);
      const weight = distance(prev, point);
      addEdge(prevKey, key, weight);
      addEdge(key, prevKey, weight);
    }
  }

  const entries = [...nodes.entries()];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [aKey, aPoint] = entries[i];
      const [bKey, bPoint] = entries[j];
      const weight = distance(aPoint, bPoint);
      if (weight > 55) continue;
      addEdge(aKey, bKey, weight);
      addEdge(bKey, aKey, weight);
    }
  }

  return { nodes, edges };
}

function nearestNode(graph: RailGraph, point: Point) {
  let bestKey = "";
  let bestDistance = Infinity;
  for (const [key, node] of graph.nodes) {
    const d = distance(point, node);
    if (d < bestDistance) {
      bestDistance = d;
      bestKey = key;
    }
  }
  return { key: bestKey, distance: bestDistance };
}

function shortestRailPath(graph: RailGraph, from: Point, to: Point): Point[] {
  const start = nearestNode(graph, from);
  const end = nearestNode(graph, to);
  if (!start.key || !end.key || start.distance > 900 || end.distance > 900) return [];

  const distances = new Map<string, number>([[start.key, 0]]);
  const previous = new Map<string, string>();
  const queue = new Set<string>([start.key]);

  while (queue.size) {
    let current = "";
    let currentDistance = Infinity;
    for (const key of queue) {
      const d = distances.get(key) ?? Infinity;
      if (d < currentDistance) {
        current = key;
        currentDistance = d;
      }
    }
    if (!current || current === end.key) break;
    queue.delete(current);

    for (const edge of graph.edges.get(current) ?? []) {
      const nextDistance = currentDistance + edge.weight;
      if (nextDistance >= (distances.get(edge.to) ?? Infinity)) continue;
      distances.set(edge.to, nextDistance);
      previous.set(edge.to, current);
      queue.add(edge.to);
    }
  }

  if (start.key !== end.key && !previous.has(end.key)) return [];

  const keys = [end.key];
  while (keys[0] !== start.key) {
    const prev = previous.get(keys[0]);
    if (!prev) return [];
    keys.unshift(prev);
  }

  const railPoints = keys.map((key) => graph.nodes.get(key)).filter(Boolean) as Point[];
  const railDistance = railPoints.reduce((sum, point, i) => i === 0 ? 0 : sum + distance(railPoints[i - 1], point), 0);
  const directDistance = distance(from, to);
  if (directDistance > 0 && railDistance > directDistance * 5) return [];
  return [from, ...railPoints, to];
}

function appendPoints(target: Point[], points: Point[]) {
  for (const point of points) {
    const last = target[target.length - 1];
    if (last && distance(last, point) < 3) continue;
    target.push(point);
  }
}

async function buildRailPolyline(
  lineName: string,
  stations: StationPoint[],
  precision: "fast" | "rail"
): Promise<{ points: Point[]; source: string }> {
  if (stations.length < 2) return { points: stations, source: "station-sequence" };
  const smoothedStations = buildSmoothedStationPolyline(stations);
  const localPolyline = sliceBestLocalPolyline(lineName, stations);
  if (localPolyline) return localPolyline;
  if (precision !== "rail" && !ENABLE_OVERPASS_RAIL_SHAPES) {
    return { points: smoothedStations, source: "smoothed-station-sequence" };
  }

  const cacheKey = `${normalizeLineName(lineName)}|${stations[0].id}|${stations.at(-1)?.id ?? ""}|rail`;
  const cached = segmentShapeCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SEGMENT_SHAPE_TTL_MS) return cached.body;
  const inflight = segmentShapeInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    const ways = await fetchRailWays(lineName, stations);
    const graph = buildRailGraph(ways);
    if (graph.nodes.size < 2) return { points: smoothedStations, source: "smoothed-station-sequence" };

    const points: Point[] = [];
    for (let i = 1; i < stations.length; i += 1) {
      const from = stations[i - 1];
      const to = stations[i];
      const railPath = shortestRailPath(graph, from, to);
      appendPoints(points, railPath.length >= 2 ? railPath : buildSmoothedStationPolyline([from, to] as StationPoint[]));
    }
    const body = { points, source: "overpass" };
    segmentShapeCache.set(cacheKey, { ts: Date.now(), body });
    return body;
  })().finally(() => {
    segmentShapeInflight.delete(cacheKey);
  });

  segmentShapeInflight.set(cacheKey, request);
  return request;
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const fromId = p.get("fromId")?.trim() ?? "";
  const toId = p.get("toId")?.trim() ?? "";
  const fromName = normalizeStationName(p.get("fromName")?.trim() ?? "");
  const toName = normalizeStationName(p.get("toName")?.trim() ?? "");
  const lineName = p.get("lineName")?.trim() ?? "";
  const expectedCount = parseInt(p.get("railLinkCount") ?? "0", 10);
  const fromLat = parseFloat(p.get("fromLat") ?? "");
  const fromLng = parseFloat(p.get("fromLng") ?? "");
  const toLat = parseFloat(p.get("toLat") ?? "");
  const toLng = parseFloat(p.get("toLng") ?? "");
  const precision = p.get("precision") === "rail" ? "rail" : "fast";

  if (!fromId || !toId || !lineName) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const searchKey = process.env.SEOUL_SUBWAY_SEARCH_KEY ?? "";
  const masterKey = process.env.SEOUL_SUBWAY_MASTER_KEY ?? "";
  if (!searchKey) return NextResponse.json({ status: "NO_KEY", points: [] });
  if (!masterKey) return NextResponse.json({ status: "NO_MASTER_KEY", points: [] });

  try {
    const normalizedLine = normalizeLineName(lineName);
    const masterCoords = await fetchStationMasterCoords(masterKey);
    let stationRows = lineRowsCache.get(normalizedLine);
    if (!stationRows) {
      let rows: Record<string, string>[] = [];
      for (const candidate of lineNameCandidates(lineName)) {
        const res = await fetch(`${SEOUL_OPENAPI_BASE}/${searchKey}/json/SearchSTNBySubwayLineInfo/1/1000/%20/%20/${encodeURIComponent(candidate)}`);
        const data = await res.json();
        rows = data.SearchSTNBySubwayLineInfo?.row ?? [];
        if (rows.length) break;
      }

      stationRows = rows
        .filter((row) => {
          const rowLine = normalizeLineName(row.LINE_NUM ?? "");
          const resolvedLines = [
            rowLine,
            ...(SEOUL_LINE_MERGED[rowLine] ?? []),
            ...(SEOUL_LINE_COMPONENTS[rowLine] ?? [])
          ];
          if (!resolvedLines.includes(normalizedLine)) return false;
          const code = parseInt(row.STATION_CD ?? "0", 10);
          if (normalizedLine === "2호선" && code > 243) return false;
          return true;
        })
        .map((row) => ({
          id: (row.STATION_CD ?? "").padStart(4, "0"),
          order: stationOrderCode(lineName, row.FR_CODE ?? "", row.STATION_CD ?? ""),
          name: normalizeStationName(row.STATION_NM ?? ""),
        }))
        .sort((a, b) => a.order - b.order);
      lineRowsCache.set(normalizedLine, stationRows);
    }

    const fromShort = shortCode(fromId);
    const toShort = shortCode(toId);

    // 경의중앙선 서울역 지선과 본선 평행 구간 혼입 방지 필터링
    if (normalizedLine === "경의중앙선") {
      const isFromBranch = fromName === "서울" || fromName === "신촌" || fromShort === "0251" || fromShort === "0252" || fromShort === "251" || fromShort === "252";
      const isToBranch = toName === "서울" || toName === "신촌" || toShort === "0251" || toShort === "0252" || toShort === "251" || toShort === "252";
      if (!isFromBranch && !isToBranch) {
        stationRows = stationRows.filter((s) => s.name !== "서울" && s.name !== "신촌");
      } else {
        stationRows = stationRows.filter((s) => s.name !== "서강대" && s.name !== "홍대입구");
      }
    }

    let fromIdx = stationRows.findIndex((s) => s.name === fromName);
    let toIdx = stationRows.findIndex((s) => s.name === toName);
    if (fromIdx === -1) fromIdx = stationRows.findIndex((s) => shortCode(s.id) === fromShort);
    if (toIdx === -1) toIdx = stationRows.findIndex((s) => shortCode(s.id) === toShort);

    if (fromIdx === -1 || toIdx === -1) return NextResponse.json({ status: "OK", lineName, points: [] });

    const forwardRows = fromIdx <= toIdx ? stationRows.slice(fromIdx, toIdx + 1) : [...stationRows.slice(fromIdx), ...stationRows.slice(0, toIdx + 1)];
    const backwardRows = toIdx <= fromIdx ? stationRows.slice(toIdx, fromIdx + 1).reverse() : [...stationRows.slice(toIdx), ...stationRows.slice(0, fromIdx + 1)].reverse();

    // 2호선처럼 순환하는 노선만 railLinkCount 기반으로 방향 선택
    // 직선 노선(경의중앙선 등)은 fromIdx/toIdx 대소 비교로 직접 방향 결정
    // (railLinkCount는 역 개수가 아닌 선로 구간 수라 역 개수와 단위가 달라 혼동 유발)
    const CIRCULAR_LINES = new Set(["2호선"]);
    const selectedRows = CIRCULAR_LINES.has(normalizedLine)
      ? (expectedCount > 0
          ? [forwardRows, backwardRows].sort((a, b) => Math.abs(a.length - 1 - expectedCount) - Math.abs(b.length - 1 - expectedCount))[0]
          : [forwardRows, backwardRows].sort((a, b) => a.length - b.length)[0])
      : (fromIdx <= toIdx ? forwardRows : backwardRows);

    const stations: StationPoint[] = [];
    for (const row of selectedRows) {
      const name = normalizeStationName(row.name);
      const coord = masterCoords.get(coordKey(normalizedLine, name));
      if (coord) {
        stations.push({ id: row.id, name, lat: coord.lat, lng: coord.lng });
        continue;
      }
      if (name === fromName && Number.isFinite(fromLat) && Number.isFinite(fromLng)) {
        stations.push({ id: row.id, name, lat: fromLat, lng: fromLng });
        continue;
      }
      if (name === toName && Number.isFinite(toLat) && Number.isFinite(toLng)) {
        stations.push({ id: row.id, name, lat: toLat, lng: toLng });
      }
    }
    stations.sort((a, b) => selectedRows.findIndex((row) => row.id === a.id) - selectedRows.findIndex((row) => row.id === b.id));

    const { points, source } = await buildRailPolyline(lineName, stations, precision);
    return NextResponse.json({
      status: "OK",
      lineName,
      points,
      stations,
      geometrySource: source,
    });
  } catch (e) {
    return NextResponse.json({ error: "SUBWAY_SEGMENT_SHAPE_ERROR", message: String(e) }, { status: 502 });
  }
}
