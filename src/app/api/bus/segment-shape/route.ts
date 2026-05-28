import { NextRequest, NextResponse } from "next/server";

const TRANSIT_KEY = process.env.SEOUL_TRANSIT_ROUTE_KEY ?? "";

interface StationPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  seq: number;
}

async function fetchBusRouteStations(routeId: string): Promise<StationPoint[]> {
  const url = `http://ws.bus.go.kr/api/rest/busRouteInfo/getStaionByRoute?ServiceKey=${TRANSIT_KEY}&busRouteId=${routeId}`;
  const res = await fetch(url, { headers: { Accept: "application/xml" } });
  const text = await res.text();
  const matches = [...text.matchAll(/<itemList>([\s\S]*?)<\/itemList>/g)];
  const stations: StationPoint[] = [];
  for (const m of matches) {
    const get = (tag: string) => m[1].match(new RegExp(`<${tag}>(.*?)<\\/${tag}>`))?.[1] ?? "";
    const lat = parseFloat(get("gpsY"));
    const lng = parseFloat(get("gpsX"));
    if (!isFinite(lat) || !isFinite(lng)) continue;
    stations.push({ id: get("station"), name: get("stationNm"), seq: parseInt(get("seq"), 10), lat, lng });
  }
  return stations.sort((a, b) => a.seq - b.seq);
}

async function fetchBusRoutePath(routeId: string): Promise<{ lat: number; lng: number; seq: number }[]> {
  const url = `http://ws.bus.go.kr/api/rest/busRouteInfo/getRoutePath?ServiceKey=${TRANSIT_KEY}&busRouteId=${routeId}`;
  const res = await fetch(url, { headers: { Accept: "application/xml" } });
  const text = await res.text();
  const matches = [...text.matchAll(/<itemList>([\s\S]*?)<\/itemList>/g)];
  const points: { lat: number; lng: number; seq: number }[] = [];
  for (const m of matches) {
    const get = (tag: string) => m[1].match(new RegExp(`<${tag}>(.*?)<\\/${tag}>`))?.[1] ?? "";
    const lat = parseFloat(get("gpsY"));
    const lng = parseFloat(get("gpsX"));
    if (!isFinite(lat) || !isFinite(lng)) continue;
    points.push({ lat, lng, seq: parseInt(get("no"), 10) });
  }
  return points.sort((a, b) => a.seq - b.seq);
}

function nearestIndex(points: { lat: number; lng: number }[], target: { lat: number; lng: number }): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = (points[i].lat - target.lat) ** 2 + (points[i].lng - target.lng) ** 2;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

function nearestDistance(points: { lat: number; lng: number }[], target: { lat: number; lng: number }): number {
  if (!points.length) return Infinity;
  return distance(points[nearestIndex(points, target)], target);
}

function distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dx = (a.lng - b.lng) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const dy = a.lat - b.lat;
  return Math.sqrt(dx * dx + dy * dy) * 111_320;
}

function pathDistance(points: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

function interpolate(a: { lat: number; lng: number }, b: { lat: number; lng: number }, t: number) {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

function nearestProjectionOnPolyline(points: { lat: number; lng: number }[], target: { lat: number; lng: number }) {
  let best = { segmentIdx: 0, t: 0, point: points[0], distance: Infinity };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const vx = b.lng - a.lng;
    const vy = b.lat - a.lat;
    const wx = target.lng - a.lng;
    const wy = target.lat - a.lat;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
    const point = interpolate(a, b, t);
    const d = distance(point, target);
    if (d < best.distance) best = { segmentIdx: i, t, point, distance: d };
  }
  return best;
}

function clipPolylineToEndpoints(
  points: { lat: number; lng: number }[],
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  if (points.length < 2) return points;
  const start = nearestProjectionOnPolyline(points, from);
  const end = nearestProjectionOnPolyline(points, to);
  const startPos = start.segmentIdx + start.t;
  const endPos = end.segmentIdx + end.t;
  if (startPos >= endPos || start.distance > 500 || end.distance > 500) {
    return buildEndpointFallback(from, to);
  }

  const clipped: { lat: number; lng: number }[] = [from];
  for (let i = start.segmentIdx + 1; i <= end.segmentIdx; i++) {
    clipped.push(points[i]);
  }
  clipped.push(to);
  return clipped;
}

function buildClippedSlice(
  points: { lat: number; lng: number }[],
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  wrapped: boolean,
) {
  const start = nearestProjectionOnPolyline(points, from);
  const end = nearestProjectionOnPolyline(points, to);
  const startPos = start.segmentIdx + start.t;
  const endPos = end.segmentIdx + end.t;
  if ((!wrapped && startPos >= endPos) || start.distance > 600 || end.distance > 600) return null;

  const clipped: { lat: number; lng: number }[] = [from];
  if (wrapped) {
    for (let i = start.segmentIdx + 1; i < points.length; i++) clipped.push(points[i]);
    for (let i = 0; i <= end.segmentIdx; i++) clipped.push(points[i]);
  } else {
    for (let i = start.segmentIdx + 1; i <= end.segmentIdx; i++) clipped.push(points[i]);
  }
  clipped.push(to);

  return {
    points: dedupePoints(clipped),
    startDistance: start.distance,
    endDistance: end.distance,
    distance: pathDistance(clipped),
  };
}

function clipRoutePathToEndpoints(
  points: { lat: number; lng: number }[],
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  if (points.length < 2) return null;
  const directDistance = distance(from, to);
  const candidates = [
    buildClippedSlice(points, from, to, false),
    buildClippedSlice(points, from, to, true),
  ].filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate && candidate.points.length >= 2);

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.distance - b.distance);
  const best = candidates[0];
  const distanceRatio = directDistance > 0 ? best.distance / directDistance : 1;
  if (directDistance > 300 && distanceRatio > 12) return null;

  return {
    points: best.points,
    debug: {
      startDeviation: Math.round(best.startDistance),
      endDeviation: Math.round(best.endDistance),
      directRatio: Math.round(distanceRatio * 100) / 100,
      pathDistance: Math.round(best.distance),
    },
  };
}

function sliceForward<T>(items: T[], startIdx: number, endIdx: number): T[] {
  return startIdx <= endIdx
    ? items.slice(startIdx, endIdx + 1)
    : [...items.slice(startIdx), ...items.slice(0, endIdx + 1)];
}

function normalizePathIndex(idx: number, startIdx: number, total: number) {
  return idx < startIdx ? idx + total : idx;
}

function dedupePoints<T extends { lat: number; lng: number }>(points: T[]): T[] {
  const result: T[] = [];
  for (const point of points) {
    const prev = result[result.length - 1];
    if (prev && distance(prev, point) < 3) continue;
    result.push(point);
  }
  return result;
}

function normalizeStationName(v: string) {
  return v
    .replace(/\(.+?\)/g, "")
    .replace(/역$/, "")
    .replace(/정류장$/, "")
    .replace(/\s+/g, "")
    .trim();
}

function parseOptionalPoint(lat?: string | null, lng?: string | null) {
  const parsedLat = parseFloat(lat ?? "");
  const parsedLng = parseFloat(lng ?? "");
  if (!isFinite(parsedLat) || !isFinite(parsedLng)) return null;
  return { lat: parsedLat, lng: parsedLng };
}

function buildEndpointFallback(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const points: { lat: number; lng: number }[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    points.push({
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
    });
  }
  return points;
}

function stationMatches(station: StationPoint, id: string, name: string, point: { lat: number; lng: number } | null) {
  if (id && station.id === id) return true;
  if (name && normalizeStationName(station.name) === normalizeStationName(name)) return true;
  return !!point && distance(station, point) < 90;
}

function matchingStationIndices(
  stations: StationPoint[],
  id: string,
  name: string,
  point: { lat: number; lng: number } | null,
) {
  const exact: number[] = [];
  stations.forEach((station, idx) => {
    if (stationMatches(station, id, name, point)) exact.push(idx);
  });
  if (exact.length) return exact;
  if (!point) return [];

  return stations
    .map((station, idx) => ({ idx, dist: distance(station, point) }))
    .filter((item) => item.dist < 300)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3)
    .map((item) => item.idx);
}

function scoreRoutePathSlice(
  stationSlice: StationPoint[],
  routePath: { lat: number; lng: number; seq: number }[],
) {
  const first = stationSlice[0];
  const last = stationSlice[stationSlice.length - 1];
  const startIdx = nearestIndex(routePath, first);
  const endIdx = nearestIndex(routePath, last);
  const pathSlice = sliceForward(routePath, startIdx, endIdx);
  if (pathSlice.length < 2) return null;

  const stationDistance = pathDistance(stationSlice);
  const routeDistance = pathDistance(pathSlice);
  const pathTotal = routePath.length;
  const orderedIndices = stationSlice.map((station) => normalizePathIndex(nearestIndex(routePath, station), startIdx, pathTotal));
  let backtracks = 0;
  for (let i = 1; i < orderedIndices.length; i++) {
    if (orderedIndices[i] < orderedIndices[i - 1]) backtracks += 1;
  }

  const stationDeviation = stationSlice.reduce((sum, station) => sum + nearestDistance(pathSlice, station), 0) / stationSlice.length;
  const endpointDeviation = nearestDistance(pathSlice, first) + nearestDistance(pathSlice, last);
  const distanceRatio = stationDistance > 0 ? routeDistance / stationDistance : 1;
  const ratioPenalty = distanceRatio > 5 ? (distanceRatio - 5) * 900 : distanceRatio < 0.55 ? (0.55 - distanceRatio) * 900 : 0;
  const score = stationDeviation * 2.5 + endpointDeviation + backtracks * 5000 + ratioPenalty + routeDistance * 0.01;

  return {
    score,
    points: pathSlice,
    source: backtracks === 0 && stationDeviation < 240 && distanceRatio < 8 ? "seoul-bus-route-path" : "station-sequence",
    stationDeviation,
    distanceRatio,
    backtracks,
  };
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const routeId = p.get("routeId")?.trim() ?? "";
  const fromId = p.get("fromId")?.trim() ?? "";
  const toId = p.get("toId")?.trim() ?? "";
  const fromName = p.get("fromName")?.trim() ?? "";
  const toName = p.get("toName")?.trim() ?? "";
  const fromPoint = parseOptionalPoint(p.get("fromLat"), p.get("fromLng"));
  const toPoint = parseOptionalPoint(p.get("toLat"), p.get("toLng"));

  if (!routeId || !fromId || !toId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }
  if (!TRANSIT_KEY) return NextResponse.json({ status: "NO_KEY", points: [] });

  try {
    const [stations, routePath] = await Promise.all([
      fetchBusRouteStations(routeId),
      fetchBusRoutePath(routeId),
    ]);
    const clippedRoutePath = fromPoint && toPoint ? clipRoutePathToEndpoints(routePath, fromPoint, toPoint) : null;

    const fromIndices = matchingStationIndices(stations, fromId, fromName, fromPoint);
    const toIndices = matchingStationIndices(stations, toId, toName, toPoint);

    let fromIdx = -1;
    let toIdx = -1;
    let bestScore = Infinity;
    let bestPathPoints: { lat: number; lng: number }[] = [];
    let bestSource = "station-sequence";
    let bestDebug: Record<string, number> = {};

    for (const f of fromIndices) {
      for (const t of toIndices) {
        if (f === t) continue;
        const stationSlice = sliceForward(stations, f, t);
        if (stationSlice.length < 2 || stationSlice.length > Math.max(8, stations.length * 0.75)) continue;

        const directStationDistance = pathDistance(stationSlice);
        const endpointPenalty =
          (fromPoint ? distance(stationSlice[0], fromPoint) : 0) +
          (toPoint ? distance(stationSlice[stationSlice.length - 1], toPoint) : 0);
        const routeScore = routePath.length >= 2 ? scoreRoutePathSlice(stationSlice, routePath) : null;
        const score = endpointPenalty + (routeScore?.score ?? directStationDistance * 0.2);
        if (score < bestScore) {
          bestScore = score;
          fromIdx = f;
          toIdx = t;
          bestPathPoints = routeScore?.points ?? [];
          bestSource = routeScore?.source ?? "station-sequence";
          bestDebug = routeScore
            ? {
                stationDeviation: Math.round(routeScore.stationDeviation),
                distanceRatio: Math.round(routeScore.distanceRatio * 100) / 100,
                backtracks: routeScore.backtracks,
              }
            : {};
        }
      }
    }

    if (fromIdx === -1 || toIdx === -1) {
      fromIdx = stations.findIndex((s) => stationMatches(s, fromId, fromName, fromPoint));
      toIdx = stations.findIndex((s) => stationMatches(s, toId, toName, toPoint));
    }

    if (fromIdx === -1 || toIdx === -1) {
      if (clippedRoutePath) {
        return NextResponse.json({
          status: "OK",
          routeId,
          stopCount: 0,
          source: "seoul-bus-route-path-direct",
          points: clippedRoutePath.points,
          debug: clippedRoutePath.debug,
        });
      }

      if (fromPoint && toPoint) {
        return NextResponse.json({
          status: "OK",
          routeId,
          stopCount: 0,
          source: "endpoint-line-fallback",
          points: buildEndpointFallback(fromPoint, toPoint),
        });
      }
      return NextResponse.json({ status: "OK", routeId, stopCount: 0, points: [] });
    }

    const stationSlice = sliceForward(stations, fromIdx, toIdx);
    const stopCount = Math.max(0, stationSlice.length - 1);

    if (bestPathPoints.length >= 2) {
      if (bestSource !== "seoul-bus-route-path" && clippedRoutePath) {
        return NextResponse.json({
          status: "OK",
          routeId,
          stopCount,
          source: "seoul-bus-route-path-direct",
          points: clippedRoutePath.points,
          debug: clippedRoutePath.debug,
        });
      }

      const finalPoints = bestSource === "seoul-bus-route-path" && fromPoint && toPoint
        ? clipPolylineToEndpoints(bestPathPoints, fromPoint, toPoint)
        : bestPathPoints;
      return NextResponse.json({
        status: "OK",
        routeId,
        stopCount,
        source: bestSource,
        points: dedupePoints(bestSource === "seoul-bus-route-path" ? finalPoints : stationSlice),
        debug: bestDebug,
      });
    }

    return NextResponse.json({ status: "OK", routeId, stopCount, source: "station-sequence", points: dedupePoints(stationSlice) });
  } catch (e) {
    if (fromPoint && toPoint) {
      return NextResponse.json({
        status: "OK",
        routeId,
        stopCount: 0,
        source: "endpoint-line-fallback",
        points: buildEndpointFallback(fromPoint, toPoint),
        warning: String(e),
      });
    }
    return NextResponse.json({ error: "BUS_SEGMENT_SHAPE_ERROR", message: String(e) }, { status: 502 });
  }
}
