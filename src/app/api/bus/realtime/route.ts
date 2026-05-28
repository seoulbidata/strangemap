import { NextRequest, NextResponse } from "next/server";
import { parseBusArrivalXml } from "@/lib/transitXml";

const BUS_REALTIME_KEY = process.env.SEOUL_BUS_REALTIME_KEY ?? process.env.SEOUL_TRANSIT_ROUTE_KEY ?? "";
const TRANSIT_KEY = process.env.SEOUL_TRANSIT_ROUTE_KEY ?? "";

/** stopId|routeId 조합별 90초 TTL 인메모리 캐시 */
const cache = new Map<string, { ts: number; body: unknown }>();
const CACHE_TTL_MS = 90 * 1000;

/** 서울 버스 API 혼잡도 코드 3-7 → score/label/color 매핑 */
function congestionFromCode(code: number): { score: number; label: string; color: string } | null {
  if (code === 3) return { score: 22, label: "여유",     color: "#2563eb" };
  if (code === 4) return { score: 45, label: "보통",     color: "#16a34a" };
  if (code === 5) return { score: 75, label: "혼잡",     color: "#f97316" };
  if (code === 6) return { score: 92, label: "매우 혼잡", color: "#dc2626" };
  if (code === 7) return { score: 100, label: "만차",    color: "#991b1b" };
  return null;
}

function congestionLabel(score: number) {
  if (score <= 25) return { label: "원활", color: "#2563eb" };
  if (score <= 50) return { label: "보통", color: "#16a34a" };
  if (score <= 75) return { label: "약간 혼잡", color: "#f97316" };
  if (score <= 100) return { label: "혼잡", color: "#dc2626" };
  return { label: "매우 혼잡", color: "#991b1b" };
}

function congestionFromPassengerCount(count: number, busType?: string) {
  const capacity = busType === "2" ? 90 : 60;
  const ratio = count / capacity;
  if (ratio <= 0.25) return { score: 22, label: "여유", color: "#2563eb" };
  if (ratio <= 0.55) return { score: 45, label: "보통", color: "#16a34a" };
  if (ratio <= 0.8) return { score: 75, label: "혼잡", color: "#f97316" };
  return { score: 92, label: "매우 혼잡", color: "#dc2626" };
}

function congestionFromArrival(firstArrival: {
  fullFlag1?: string;
  congestionCode1?: number;
  rerideDiv1?: number;
  rerideCount1?: number;
  busType1?: string;
} | undefined) {
  if (!firstArrival) return null;
  const code = String(firstArrival.fullFlag1 ?? "") === "1"
    ? 7
    : (firstArrival.congestionCode1 ?? 0);
  const mapped = congestionFromCode(code);
  if (mapped) return mapped;

  const reride = firstArrival.rerideCount1 ?? 0;
  if (reride <= 0) return null;
  if (firstArrival.rerideDiv1 === 4) return congestionFromCode(reride) ?? null;
  if (firstArrival.rerideDiv1 === 2) return congestionFromPassengerCount(reride, firstArrival.busType1);
  if (reride >= 3 && reride <= 7) return congestionFromCode(reride) ?? null;
  return congestionFromPassengerCount(reride, firstArrival.busType1);
}

async function findBusStationOrder(routeId: string, stopId: string): Promise<number> {
  if (!routeId || !stopId || !TRANSIT_KEY) return 0;
  try {
    const url = `http://ws.bus.go.kr/api/rest/busRouteInfo/getStaionByRoute?serviceKey=${TRANSIT_KEY}&busRouteId=${routeId}`;
    const res = await fetch(url, { headers: { Accept: "application/xml" } });
    const text = await res.text();
    const matches = [...text.matchAll(/<itemList>([\s\S]*?)<\/itemList>/g)];
    for (const m of matches) {
      const id = m[1].match(/<station>(.*?)<\/station>/)?.[1] ?? "";
      if (id === stopId) {
        const seq = m[1].match(/<seq>(.*?)<\/seq>/)?.[1] ?? "0";
        return parseInt(seq, 10);
      }
    }
  } catch { /* ignore */ }
  return 0;
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const stopId = p.get("stopId")?.trim() ?? "";
  const routeId = p.get("routeId")?.trim() ?? "";
  const routeName = p.get("routeName")?.trim() ?? "";

  if (!stopId) return NextResponse.json({ error: "Missing stopId" }, { status: 400 });
  if (!BUS_REALTIME_KEY) return NextResponse.json({ error: "Missing bus API key" }, { status: 500 });

  const cacheKey = `${stopId}|${routeId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.body);
  }

  try {
    let body = "";
    let parsed;

    if (stopId && routeId) {
      const order = await findBusStationOrder(routeId, stopId);
      if (order > 0) {
        const url = `http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRoute?serviceKey=${BUS_REALTIME_KEY}&stId=${stopId}&busRouteId=${routeId}&ord=${order}`;
        const res = await fetch(url, { headers: { Accept: "application/xml" } });
        body = await res.text();
        parsed = parseBusArrivalXml(body, stopId, routeId, routeName);
        if (parsed.headerCode !== "0" || !parsed.arrivals.length) {
          parsed = undefined; // 실패 시 폴백으로 넘어감
        }
      }
    }

    if (!parsed) {
      const url = `http://ws.bus.go.kr/api/rest/arrive/getLowArrInfoByStId?ServiceKey=${BUS_REALTIME_KEY}&stId=${stopId}`;
      const res = await fetch(url, { headers: { Accept: "application/xml" } });
      body = await res.text();
      parsed = parseBusArrivalXml(body, stopId, routeId, routeName);
    }

    // 혼잡도 코드 우선, 코드가 비어 있으면 재차인원(reride) 기반 보조 추정 사용
    const congestion = congestionFromArrival(parsed.arrivals[0]);

    const result = { ...parsed, congestion };
    cache.set(cacheKey, { ts: Date.now(), body: result });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "BUS_REALTIME_ERROR", message: String(e) }, { status: 502 });
  }
}
