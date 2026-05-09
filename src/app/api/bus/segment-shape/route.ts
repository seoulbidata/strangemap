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
  const url = `http://ws.bus.go.kr/api/rest/busRouteInfo/getStaionByRoute?serviceKey=${TRANSIT_KEY}&busRouteId=${routeId}`;
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

function pathDistance(points: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const lat = points[i].lat - points[i - 1].lat;
    const lng = points[i].lng - points[i - 1].lng;
    total += Math.sqrt(lat * lat + lng * lng);
  }
  return total;
}

function sliceCircular<T>(items: T[], startIdx: number, endIdx: number): T[] {
  return startIdx <= endIdx ? items.slice(startIdx, endIdx + 1) : [...items.slice(startIdx), ...items.slice(0, endIdx + 1)];
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const routeId = p.get("routeId")?.trim() ?? "";
  const fromId = p.get("fromId")?.trim() ?? "";
  const toId = p.get("toId")?.trim() ?? "";

  if (!routeId || !fromId || !toId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }
  if (!TRANSIT_KEY) return NextResponse.json({ status: "NO_KEY", points: [] });

  try {
    const [stations, routePath] = await Promise.all([
      fetchBusRouteStations(routeId),
      fetchBusRoutePath(routeId),
    ]);

    const fromIdx = stations.findIndex((s) => s.id === fromId);
    const toIdx = stations.findIndex((s) => s.id === toId);

    if (fromIdx === -1 || toIdx === -1) {
      return NextResponse.json({ status: "OK", routeId, points: [] });
    }

    const stationSlice = sliceCircular(stations, fromIdx, toIdx);

    if (routePath.length >= 2 && stationSlice.length >= 2) {
      const startIdx = nearestIndex(routePath, stationSlice[0]);
      const endIdx = nearestIndex(routePath, stationSlice[stationSlice.length - 1]);
      const forwardSlice = startIdx <= endIdx
        ? routePath.slice(startIdx, endIdx + 1)
        : routePath.slice(endIdx, startIdx + 1).reverse();
      const wrappedSlice = sliceCircular(routePath, startIdx, endIdx);
      const stationDistance = pathDistance(stationSlice);
      const forwardDistance = pathDistance(forwardSlice);
      const wrappedDistance = pathDistance(wrappedSlice);
      const pathSlice = wrappedDistance < forwardDistance ? wrappedSlice : forwardSlice;
      const pathIsReasonable = stationDistance === 0 || pathDistance(pathSlice) <= stationDistance * 4;
      if (pathSlice.length >= 2) {
        return NextResponse.json({ status: "OK", routeId, points: pathIsReasonable ? pathSlice : stationSlice });
      }
    }

    return NextResponse.json({ status: "OK", routeId, points: stationSlice });
  } catch (e) {
    return NextResponse.json({ error: "BUS_SEGMENT_SHAPE_ERROR", message: String(e) }, { status: 502 });
  }
}
