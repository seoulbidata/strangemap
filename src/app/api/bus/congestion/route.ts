import { NextRequest, NextResponse } from "next/server";
import { parseBusArrivalXml } from "@/lib/transitXml";

const BUS_REALTIME_KEY = process.env.SEOUL_BUS_REALTIME_KEY ?? process.env.SEOUL_TRANSIT_ROUTE_KEY ?? "";

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

  try {
    const url = `http://ws.bus.go.kr/api/rest/arrive/getLowArrInfoByStId?ServiceKey=${BUS_REALTIME_KEY}&stId=${stopId}`;
    const res = await fetch(url, { headers: { Accept: "application/xml" } });
    const body = await res.text();
    const parsed = parseBusArrivalXml(body, stopId, routeId, routeName);

    const first = parsed.arrivals[0];
    if (!first) return NextResponse.json({ status: "NO_DATA", stopId, routeId });

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
      return NextResponse.json({ status: "NO_DATA", stopId, routeId, routeName });
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

    return NextResponse.json({
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
    });
  } catch (e) {
    return NextResponse.json({ error: "BUS_CONGESTION_ERROR", message: String(e) }, { status: 502 });
  }
}
