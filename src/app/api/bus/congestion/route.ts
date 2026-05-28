import { NextRequest, NextResponse } from "next/server";
import { parseBusArrivalXml } from "@/lib/transitXml";

const BUS_REALTIME_KEY = process.env.SEOUL_BUS_REALTIME_KEY ?? process.env.SEOUL_TRANSIT_ROUTE_KEY ?? "";

/** 정류장 + 노선 조합별 2분 TTL 인메모리 캐시 */
const cache = new Map<string, { ts: number; body: unknown }>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2분

function congestionLabel(score: number) {
  if (score <= 25) return { label: "원활", color: "#2563eb" };
  if (score <= 50) return { label: "보통", color: "#16a34a" };
  if (score <= 75) return { label: "약간 혼잡", color: "#f97316" };
  if (score <= 100) return { label: "혼잡", color: "#dc2626" };
  return { label: "매우 혼잡", color: "#991b1b" };
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const stopId = p.get("stopId")?.trim() ?? "";
  const routeId = p.get("routeId")?.trim() ?? "";
  const routeName = p.get("routeName")?.trim() ?? "";

  if (!stopId) return NextResponse.json({ error: "Missing stopId" }, { status: 400 });
  if (!BUS_REALTIME_KEY) return NextResponse.json({ status: "NO_KEY", stopId, routeId });

  const cacheKey = `${stopId}|${routeId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.body);
  }

  try {
    const url = `http://ws.bus.go.kr/api/rest/arrive/getLowArrInfoByStId?ServiceKey=${BUS_REALTIME_KEY}&stId=${stopId}`;
    const res = await fetch(url, { headers: { Accept: "application/xml" } });
    const body = await res.text();
    const parsed = parseBusArrivalXml(body, stopId, routeId, routeName);

    // API 키 인증 실패 / Rate Limit 감지
    if (parsed.headerCode === "7" || parsed.headerMessage?.includes("인증실패") || parsed.headerMessage?.includes("LIMIT")) {
      const rsp = { status: "RATE_LIMITED", stopId, routeId };
      return NextResponse.json(rsp);
    }

    const first = parsed.arrivals[0];
    if (!first) {
      const rsp = { status: "NO_DATA", stopId, routeId };
      cache.set(cacheKey, { ts: Date.now(), body: rsp });
      return NextResponse.json(rsp);
    }

    const fullFlag = String(first.fullFlag1 ?? "") === "1";
    const code = fullFlag ? 7 : (first.congestionCode1 as number) || 0;
    const reride = (first.rerideCount1 as number) || 0;

    const mapping: Record<number, { score: number; label: string }> = {
      3: { score: 22, label: "여유" },
      4: { score: 45, label: "보통" },
      5: { score: 75, label: "혼잡" },
      6: { score: 92, label: "매우 혼잡" },
      7: { score: 100, label: "만차" },
    };

    if (!mapping[code] && reride <= 0) {
      const rsp = { status: "NO_DATA", stopId, routeId, routeName };
      cache.set(cacheKey, { ts: Date.now(), body: rsp });
      return NextResponse.json(rsp);
    }

    let score: number;
    let label: string;
    if (mapping[code]) {
      score = mapping[code].score;
      label = mapping[code].label;
    } else {
      score = Math.max(0, Math.min(100, Math.round((reride / 55) * 100)));
      label = congestionLabel(score).label;
    }

    const rsp = {
      status: "OK",
      source: "seoulBusRealtime",
      stopId,
      routeId: first.routeId || routeId,
      routeName: first.routeName || routeName,
      stopName: first.stationName,
      arrivalMessage: first.arrmsg1,
      arrivalSeconds: first.arrivalSeconds1,
      score,
      label,
      color: congestionLabel(score).color,
    };
    cache.set(cacheKey, { ts: Date.now(), body: rsp });
    return NextResponse.json(rsp);
  } catch (e) {
    return NextResponse.json({ error: "BUS_CONGESTION_ERROR", message: String(e) }, { status: 502 });
  }
}
