import { NextRequest, NextResponse } from "next/server";

const TMAP_KEY = process.env.TMAP_APP_KEY ?? "";

function parseLinestring(s: string): { lat: number; lng: number }[] {
  return s.split(" ").flatMap((pair) => {
    const [lng, lat] = pair.split(",").map(Number);
    return isFinite(lat) && isFinite(lng) ? [{ lat, lng }] : [];
  });
}

function normalizeRouteName(route: string): string {
  return route.replace(/^수도권/, "").replace(/\(급행\)$/, "").trim();
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const startX = p.get("startX");
  const startY = p.get("startY");
  const endX = p.get("endX");
  const endY = p.get("endY");

  if (!startX || !startY || !endX || !endY) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }
  if (!TMAP_KEY) {
    return NextResponse.json({ error: "Missing TMAP_APP_KEY" }, { status: 500 });
  }

  try {
    const res = await fetch("https://apis.openapi.sk.com/transit/routes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        appKey: TMAP_KEY,
      },
      body: JSON.stringify({ startX, startY, endX, endY, count: 10, lang: 0, format: "json" }),
    });

    const data = await res.json();
    const itineraries: unknown[] = data.metaData?.plan?.itineraries ?? [];

    const routes = itineraries.map((itin) => {
      const it = itin as Record<string, unknown>;
      const legs: unknown[] = (it.legs as unknown[]) ?? [];

      const paths = legs
        .map((leg) => leg as Record<string, unknown>)
        .filter((leg) => leg.mode === "SUBWAY" || leg.mode === "BUS")
        .map((leg) => {
          const start = (leg.start ?? {}) as Record<string, unknown>;
          const end = (leg.end ?? {}) as Record<string, unknown>;
          const linestringRaw = (leg.passShape as Record<string, string> | undefined)?.linestring ?? "";
          const polyline = linestringRaw ? parseLinestring(linestringRaw) : [];

          return {
            mode: leg.mode === "SUBWAY" ? "subway" : "bus",
            fromId: "",
            fromName: (start.name as string) ?? "",
            fromLat: (start.lat as number) ?? null,
            fromLng: (start.lon as number) ?? null,
            lineName: normalizeRouteName((leg.route as string) ?? ""),
            routeId: "",
            busRouteType: "",
            routeColor: (leg.routeColor as string) ?? "",
            toId: "",
            toName: (end.name as string) ?? "",
            toLat: (end.lat as number) ?? null,
            toLng: (end.lon as number) ?? null,
            railLinkCount: 0,
            polyline,
          };
        });

      return {
        distance: (it.totalDistance as number) ?? 0,
        time: Math.round(((it.totalTime as number) ?? 0) / 60),
        paths,
      };
    });

    return NextResponse.json({ routes });
  } catch (e) {
    return NextResponse.json({ error: "TMAP_ERROR", message: String(e) }, { status: 502 });
  }
}
