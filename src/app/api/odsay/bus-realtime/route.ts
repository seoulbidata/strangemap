import { NextRequest, NextResponse } from "next/server";

const ODSAY_API_KEY = process.env.ODSAY_API_KEY ?? "";
const ODSAY_BASE = "https://api.odsay.com/v1/api";

const cache = new Map<string, { ts: number; body: unknown }>();
const CACHE_TTL_MS = 60 * 1000;

function cleanBusNo(v: string) {
  return (v.includes(":") ? v.split(":").at(-1)! : v).replace(/\s+/g, "");
}

function congestionFromCode(code: number | string | undefined | null) {
  const n = Number(String(code ?? "").trim());
  if (n === 1) return { score: 22, label: "여유", color: "#2563eb", source: "odsayRealtime" };
  if (n === 2) return { score: 45, label: "보통", color: "#16a34a", source: "odsayRealtime" };
  if (n === 3) return { score: 75, label: "혼잡", color: "#f97316", source: "odsayRealtime" };
  if (n === 4) return { score: 92, label: "매우 혼잡", color: "#dc2626", source: "odsayRealtime" };
  return null;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

async function odsayGet(path: string, params: Record<string, string>) {
  const search = new URLSearchParams({ ...params, apiKey: ODSAY_API_KEY });
  const res = await fetch(`${ODSAY_BASE}/${path}?${search}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 },
  });
  return res.json();
}

function findCongestionNode(node: any): any {
  if (!node || typeof node !== "object") return null;
  for (const key of [
    "congestion",
    "congestionType",
    "busCongestion",
    "busCongestionType",
    "busCongestionCode",
    "congestionCode",
    "crowded",
    "crowdedType",
    "crowdType",
    "crowdLevel",
    "type",
  ]) {
    if (node[key] !== undefined) return node[key];
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findCongestionNode(item);
        if (found !== null && found !== undefined) return found;
      }
    } else if (value && typeof value === "object") {
      const found = findCongestionNode(value);
      if (found !== null && found !== undefined) return found;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const routeName = cleanBusNo(p.get("routeName") ?? "");
  const routeId = p.get("routeId")?.trim() ?? "";
  const stopId = p.get("stopId")?.trim() ?? "";
  const stopName = p.get("stopName")?.trim() ?? "";

  if (!routeName && !routeId) return NextResponse.json({ status: "MISSING_ROUTE" }, { status: 400 });
  if (!ODSAY_API_KEY) return NextResponse.json({ status: "NO_KEY" });

  const cacheKey = `${routeName}|${routeId}|${stopId}|${stopName}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.body);
  }

  try {
    const laneData = await odsayGet("searchBusLane", {
      busNo: routeName || routeId,
      CID: "1000",
      stationListYn: "no",
    });
    if (laneData?.error) {
      const body = { status: "ODSAY_ERROR", error: laneData.error };
      cache.set(cacheKey, { ts: Date.now(), body });
      return NextResponse.json(body);
    }

    const lanes = asArray(laneData?.result?.lane);
    const lane = lanes.find((item: any) => String(item.localBusID ?? "") === routeId)
      ?? lanes.find((item: any) => cleanBusNo(String(item.busNo ?? "")) === routeName)
      ?? lanes[0];
    if (!lane?.busID) {
      const body = { status: "NO_LANE", routeName, routeId };
      cache.set(cacheKey, { ts: Date.now(), body });
      return NextResponse.json(body);
    }

    const detailData = await odsayGet("busLaneDetail", { busID: String(lane.busID) });
    const stations = asArray(detailData?.result?.station);
    const station = stations.find((item: any) => String(item.localStationID ?? "") === stopId)
      ?? stations.find((item: any) => String(item.arsID ?? "").replace(/\D/g, "") === stopId.replace(/\D/g, ""))
      ?? stations.find((item: any) => stopName && String(item.stationName ?? "").includes(stopName))
      ?? stations[0];
    if (!station?.stationID) {
      const body = { status: "NO_STATION", routeName, routeId, stopId };
      cache.set(cacheKey, { ts: Date.now(), body });
      return NextResponse.json(body);
    }

    const realtimeData = await odsayGet("realtimeStation", {
      stationID: String(station.stationID),
      stationBase: "1",
    });
    if (realtimeData?.error) {
      const body = { status: "ODSAY_ERROR", error: realtimeData.error };
      cache.set(cacheKey, { ts: Date.now(), body });
      return NextResponse.json(body);
    }

    const realItems = asArray(realtimeData?.result?.real);
    const target = realItems.find((item: any) => String(item.routeID ?? "") === routeId)
      ?? realItems.find((item: any) => cleanBusNo(String(item.routeNm ?? "")) === routeName)
      ?? realItems[0]
      ?? realtimeData?.result;
    const congestion = congestionFromCode(findCongestionNode(target));
    if (!congestion) {
      const body = { status: "NO_CONGESTION", source: "odsayRealtime", routeName, routeId, stationID: station.stationID };
      cache.set(cacheKey, { ts: Date.now(), body });
      return NextResponse.json(body);
    }

    const body = {
      status: "OK",
      source: "odsayRealtime",
      congestion,
      busID: lane.busID,
      localBusID: lane.localBusID,
      stationID: station.stationID,
      localStationID: station.localStationID,
      routeName,
      routeId,
    };
    cache.set(cacheKey, { ts: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: "ODSAY_REALTIME_ERROR", message: String(e) }, { status: 502 });
  }
}
