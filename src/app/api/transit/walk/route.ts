import { NextRequest, NextResponse } from "next/server";

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * 비정상 우회 판정 한도(km).
 * 공개 OSRM 데모 서버는 URL에 foot을 넣어도 자동차 프로파일로 라우팅하므로
 * (실측: 잠원→반포한강공원 직선 0.28km에 경로 5.69km·시속 38km 응답),
 * 도보로 말이 안 되는 차로 램프 우회가 섞여 온다. 직선×2.5 + 0.6km를 넘으면
 * 그리지 않고 빈 응답을 돌려 호출부(코스·길찾기)가 직선 폴백을 쓰게 한다.
 * +0.6km 여유는 한강 다리·지하보도 등 정당한 우회(짧은 직선 대비 큰 비율)를 통과시키기 위함.
 */
const detourLimitKm = (straightKm: number) => straightKm * 2.5 + 0.6;

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

    // 우회 감지: 경로 길이가 직선 대비 비정상적으로 길면(차로 램프 루프) 폐기
    const straightKm = haversineKm(Number(fromLat), Number(fromLng), Number(toLat), Number(toLng));
    const routeKm = (data.routes[0].distance ?? 0) / 1000;
    if (routeKm > detourLimitKm(straightKm)) {
      console.warn(
        `[walk] 비정상 우회 폐기: 직선 ${straightKm.toFixed(2)}km vs 경로 ${routeKm.toFixed(2)}km`
      );
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
