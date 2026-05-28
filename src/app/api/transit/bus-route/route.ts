import { NextRequest, NextResponse } from "next/server";
import { fetchTransitWithFallback } from "@/lib/transitXml";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const startX = p.get("startX");
  const startY = p.get("startY");
  const endX = p.get("endX");
  const endY = p.get("endY");

  if (!startX || !startY || !endX || !endY) {
    return NextResponse.json({ error: "Missing startX/startY/endX/endY" }, { status: 400 });
  }

  const key = process.env.SEOUL_TRANSIT_ROUTE_KEY ?? "";
  if (!key) return NextResponse.json({ error: "Missing SEOUL_TRANSIT_ROUTE_KEY" }, { status: 500 });

  const endpoint = "getPathInfoByBus";

  try {
    const result = await fetchTransitWithFallback(endpoint, startX, startY, endX, endY, key);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "TRANSIT_ROUTE_ERROR", message: String(e) }, { status: 502 });
  }
}
