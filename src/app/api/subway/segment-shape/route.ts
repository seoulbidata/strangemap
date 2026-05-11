import { NextRequest, NextResponse } from "next/server";

const SEOUL_OPENAPI_BASE = "http://openapi.seoul.go.kr:8088";
const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

type Point = { lat: number; lng: number };
type StationPoint = { id: string; name: string; lat: number; lng: number };
type RailWay = { points: Point[] };
type GraphEdge = { to: string; weight: number };
type RailGraph = { nodes: Map<string, Point>; edges: Map<string, GraphEdge[]> };

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
  return v.replace(/[\s·•・]/g, "").replace(/\(.+?\)/g, "").replace(/^0+(\d+호선)$/, "$1");
}

// 서울 API는 통합 노선을 구성 노선명으로 분리 저장 (예: 경의중앙선 → 경의선+중앙선)
const SEOUL_LINE_COMPONENTS: Record<string, string[]> = {
  "경의중앙선": ["경의선", "중앙선"],
  "수인분당선": ["수인선", "분당선"],
};

// 서울 API 분리 노선명 → 통합 노선명 역매핑
const SEOUL_LINE_MERGED: Record<string, string> = Object.fromEntries(
  Object.entries(SEOUL_LINE_COMPONENTS).flatMap(([merged, parts]) =>
    parts.map((part) => [part, merged])
  )
);

function lineNameCandidates(v: string) {
  const normalized = normalizeLineName(v);
  const candidates = [v, normalized];
  const numberMatch = normalized.match(/^(\d+)호선$/);
  if (numberMatch) candidates.push(numberMatch[1].padStart(2, "0") + "호선");
  if (SEOUL_LINE_COMPONENTS[normalized]) candidates.push(...SEOUL_LINE_COMPONENTS[normalized]);
  return [...new Set(candidates.filter(Boolean))];
}

function shortCode(v: string) {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 3 ? digits.slice(-3) : digits;
}

function stationOrderCode(v: string) {
  const digits = v.replace(/\D/g, "");
  return parseInt(digits || "0", 10);
}

function distance(a: Point, b: Point) {
  const dx = (a.lng - b.lng) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const dy = a.lat - b.lat;
  return Math.sqrt(dx * dx + dy * dy) * 111_320;
}

function pointKey(point: Point) {
  return `${point.lat.toFixed(7)},${point.lng.toFixed(7)}`;
}

function coordKey(lineName: string, stationName: string) {
  return `${normalizeLineName(lineName)}:${normalizeStationName(stationName)}`;
}

async function fetchStationMasterCoords(masterKey: string) {
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
    // 분리 저장된 노선(경의선, 중앙선 등)을 통합 노선명(경의중앙선)으로도 색인
    const mergedLine = SEOUL_LINE_MERGED[line];
    if (mergedLine) coords.set(coordKey(mergedLine, name), { lat, lng });
  }

  return coords;
}

function railNameMatches(tags: Record<string, string> | undefined, normalizedLine: string) {
  if (!tags) return false;
  const names = [tags.name, tags["name:ko"], tags.alt_name, tags["alt_name:ko"], tags.ref].filter(Boolean);
  return names.some((name) => normalizeLineName(name) === normalizedLine);
}

function escapeOverpassRegex(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeRailQuery(lineName: string, points: Point[]) {
  const margin = 0.015;
  const minLat = Math.min(...points.map((p) => p.lat)) - margin;
  const maxLat = Math.max(...points.map((p) => p.lat)) + margin;
  const minLng = Math.min(...points.map((p) => p.lng)) - margin;
  const maxLng = Math.max(...points.map((p) => p.lng)) + margin;
  const bbox = `(${minLat},${minLng},${maxLat},${maxLng})`;
  const normalized = normalizeLineName(lineName);
  const OVERPASS_DOT_ALIASES: Record<string, string> = {
    "경의중앙선": "경의.중앙선",
    "수인분당선": "수인.분당선",
  };
  const lineRegex = OVERPASS_DOT_ALIASES[normalized] ?? escapeOverpassRegex(normalized);
  return `[out:json][timeout:25];(` +
    `way["railway"~"subway|light_rail|rail"]["name"~"${lineRegex}",i]${bbox};` +
    `way["railway"~"subway|light_rail|rail"]["name:ko"~"${lineRegex}",i]${bbox};` +
    `way["railway"~"subway|light_rail|rail"]["alt_name"~"${lineRegex}",i]${bbox};` +
    `way["railway"~"subway|light_rail|rail"]["alt_name:ko"~"${lineRegex}",i]${bbox};` +
    `);out tags geom;`;
}

async function fetchRailWays(lineName: string, points: Point[]): Promise<RailWay[]> {
  if (points.length < 2) return [];
  const normalizedLine = normalizeLineName(lineName);
  const body = `data=${encodeURIComponent(makeRailQuery(lineName, points))}`;
  const res = await fetch(OVERPASS_API_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "strangemap-local/1.0",
    },
    body,
  });
  if (!res.ok) return [];

  const data = await res.json();
  const elements = Array.isArray(data.elements) ? data.elements : [];
  return elements
    .filter((element: { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }) => (
      Array.isArray(element.geometry) && element.geometry.length >= 2 && railNameMatches(element.tags, normalizedLine)
    ))
    .map((element: { geometry: { lat: number; lon: number }[] }) => ({
      points: element.geometry.map((p) => ({ lat: p.lat, lng: p.lon })),
    }));
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

async function buildRailPolyline(lineName: string, stations: StationPoint[]) {
  if (stations.length < 2) return stations;
  const ways = await fetchRailWays(lineName, stations);
  const graph = buildRailGraph(ways);
  if (graph.nodes.size < 2) return stations;

  const points: Point[] = [];
  for (let i = 1; i < stations.length; i += 1) {
    const from = stations[i - 1];
    const to = stations[i];
    const railPath = shortestRailPath(graph, from, to);
    appendPoints(points, railPath.length >= 2 ? railPath : [from, to]);
  }
  return points;
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
    let rows: Record<string, string>[] = [];
    for (const candidate of lineNameCandidates(lineName)) {
      const res = await fetch(`${SEOUL_OPENAPI_BASE}/${searchKey}/json/SearchSTNBySubwayLineInfo/1/1000//${encodeURIComponent(candidate)}`);
      const data = await res.json();
      rows = data.SearchSTNBySubwayLineInfo?.row ?? [];
      if (rows.length) break;
    }

    const stationRows = rows
      .filter((row) => {
        const rowLine = normalizeLineName(row.LINE_NUM ?? "");
        // 분리 저장 노선(경의선, 중앙선)도 통합 노선명으로 변환 후 비교
        const resolvedLine = SEOUL_LINE_MERGED[rowLine] ?? rowLine;
        if (resolvedLine !== normalizedLine) return false;
        const code = parseInt(row.STATION_CD ?? "0", 10);
        if (normalizedLine === "2호선" && code > 243) return false;
        return true;
      })
      .map((row) => ({
        id: (row.STATION_CD ?? "").padStart(4, "0"),
        order: stationOrderCode(row.FR_CODE ?? row.STATION_CD ?? ""),
        name: normalizeStationName(row.STATION_NM ?? ""),
      }))
      .sort((a, b) => a.order - b.order);

    const fromShort = shortCode(fromId);
    const toShort = shortCode(toId);
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

    const points = await buildRailPolyline(lineName, stations);
    return NextResponse.json({ status: "OK", lineName, points, stations });
  } catch (e) {
    return NextResponse.json({ error: "SUBWAY_SEGMENT_SHAPE_ERROR", message: String(e) }, { status: 502 });
  }
}
