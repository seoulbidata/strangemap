import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const fromLat = p.get("fromLat")?.trim() ?? "";
  const fromLng = p.get("fromLng")?.trim() ?? "";
  const toLat = p.get("toLat")?.trim() ?? "";
  const toLng = p.get("toLng")?.trim() ?? "";

  if (!fromLat || !fromLng || !toLat || !toLng) {
    return NextResponse.json({ error: "Missing fromLat/fromLng/toLat/toLng" }, { status: 400 });
  }

  try {
    const url = `http://router.project-osrm.org/route/v1/foot/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url, {
      next: { revalidate: 60 * 60 * 12 }, // 12시간 동안 캐시
    });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]?.geometry?.coordinates) {
      return NextResponse.json({ points: [] });
    }

    const coords = data.routes[0].geometry.coordinates;
    const points = coords.map((c: any) => ({
      lat: Number(c[1]),
      lng: Number(c[0]),
    }));

    return NextResponse.json({ points });
  } catch (e) {
    console.error("OSRM walk routing error:", e);
    return NextResponse.json({ points: [] });
  }
}
