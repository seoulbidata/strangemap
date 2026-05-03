import { NextRequest, NextResponse } from "next/server";
import { parseBusArrivalXml } from "@/lib/transitXml";

const BUS_REALTIME_KEY = process.env.SEOUL_BUS_REALTIME_KEY ?? process.env.SEOUL_TRANSIT_ROUTE_KEY ?? "";
const TRANSIT_KEY = process.env.SEOUL_TRANSIT_ROUTE_KEY ?? "";

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

  try {
    let body = "";

    if (stopId && routeId) {
      const order = await findBusStationOrder(routeId, stopId);
      if (order > 0) {
        const url = `http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRoute?serviceKey=${BUS_REALTIME_KEY}&stId=${stopId}&busRouteId=${routeId}&ord=${order}`;
        const res = await fetch(url, { headers: { Accept: "application/xml" } });
        body = await res.text();
        const parsed = parseBusArrivalXml(body, stopId, routeId, routeName);
        if (parsed.headerCode === "0" && parsed.arrivals.length) {
          return NextResponse.json(parsed);
        }
      }
    }

    const url = `http://ws.bus.go.kr/api/rest/arrive/getLowArrInfoByStId?ServiceKey=${BUS_REALTIME_KEY}&stId=${stopId}`;
    const res = await fetch(url, { headers: { Accept: "application/xml" } });
    body = await res.text();
    return NextResponse.json(parseBusArrivalXml(body, stopId, routeId, routeName));
  } catch (e) {
    return NextResponse.json({ error: "BUS_REALTIME_ERROR", message: String(e) }, { status: 502 });
  }
}
