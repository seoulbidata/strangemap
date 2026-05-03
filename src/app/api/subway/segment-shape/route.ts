import { NextRequest, NextResponse } from "next/server";

const SEOUL_OPENAPI_BASE = "http://openapi.seoul.go.kr:8088";
const NAVER_LOCAL_CLIENT_ID = process.env.NAVER_LOCAL_CLIENT_ID ?? "";
const NAVER_LOCAL_CLIENT_SECRET = process.env.NAVER_LOCAL_CLIENT_SECRET ?? "";

function normalizeStationName(v: string) {
  return v.replace(/\(.+?\)/g, "").replace(/역$/, "").trim();
}

function normalizeLineName(v: string) {
  return v.replace(/\s/g, "").replace(/^0+(\d+호선)$/, "$1");
}

function shortCode(v: string) {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 3 ? digits.slice(-3) : digits;
}

async function fetchStationCoord(stationName: string, lineName: string): Promise<{ lat: number; lng: number } | null> {
  if (!NAVER_LOCAL_CLIENT_ID || !NAVER_LOCAL_CLIENT_SECRET) return null;
  for (const query of [`${stationName}역 ${lineName}`, `${stationName}역`]) {
    const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=8&start=1&sort=comment`;
    try {
      const res = await fetch(url, {
        headers: { "X-Naver-Client-Id": NAVER_LOCAL_CLIENT_ID, "X-Naver-Client-Secret": NAVER_LOCAL_CLIENT_SECRET },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const place = (data.items ?? []).find((item: Record<string, string>) => {
        const name = item.title?.replace(/<[^>]+>/g, "").trim() ?? "";
        return normalizeStationName(name) === stationName && (item.category?.includes("지하철") || item.category?.includes("역"));
      });
      if (place?.mapx && place?.mapy) {
        return { lat: Number(place.mapy) / 1e7, lng: Number(place.mapx) / 1e7 };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const fromId = p.get("fromId")?.trim() ?? "";
  const toId = p.get("toId")?.trim() ?? "";
  const fromName = normalizeStationName(p.get("fromName")?.trim() ?? "");
  const toName = normalizeStationName(p.get("toName")?.trim() ?? "");
  const lineName = p.get("lineName")?.trim() ?? "";
  const expectedCount = parseInt(p.get("railLinkCount") ?? "0", 10);

  if (!fromId || !toId || !lineName) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const searchKey = process.env.SEOUL_SUBWAY_SEARCH_KEY ?? "";
  if (!searchKey) return NextResponse.json({ status: "NO_KEY", points: [] });

  try {
    const normalizedLine = normalizeLineName(lineName);
    const res = await fetch(`${SEOUL_OPENAPI_BASE}/${searchKey}/json/SearchSTNBySubwayLineInfo/1/1000//${encodeURIComponent(lineName)}`);
    const data = await res.json();
    const rows: Record<string, string>[] = data.SearchSTNBySubwayLineInfo?.row ?? [];

    const stations: { id: string; name: string; lat: number; lng: number }[] = [];
    const coordPromises = rows
      .filter((row) => {
        const rowLine = normalizeLineName(row.LINE_NUM ?? "");
        if (rowLine !== normalizedLine) return false;
        const code = parseInt(row.STATION_CD ?? "0", 10);
        if (normalizedLine === "2호선" && code > 243) return false;
        return true;
      })
      .map(async (row) => {
        const name = normalizeStationName(row.STATION_NM ?? "");
        const code = (row.STATION_CD ?? "").padStart(4, "0");
        const coord = await fetchStationCoord(name, lineName);
        if (coord) stations.push({ id: code, name, lat: coord.lat, lng: coord.lng });
      });

    await Promise.all(coordPromises);
    stations.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));

    const fromShort = shortCode(fromId);
    const toShort = shortCode(toId);
    let fromIdx = stations.findIndex((s) => shortCode(s.id) === fromShort);
    let toIdx = stations.findIndex((s) => shortCode(s.id) === toShort);
    if (fromIdx === -1) fromIdx = stations.findIndex((s) => s.name === fromName);
    if (toIdx === -1) toIdx = stations.findIndex((s) => s.name === toName);

    if (fromIdx === -1 || toIdx === -1) return NextResponse.json({ status: "OK", lineName, points: [] });

    const forward = fromIdx <= toIdx ? stations.slice(fromIdx, toIdx + 1) : [...stations.slice(fromIdx), ...stations.slice(0, toIdx + 1)];
    const backward = toIdx <= fromIdx ? stations.slice(toIdx, fromIdx + 1).reverse() : [...stations.slice(toIdx), ...stations.slice(0, fromIdx + 1)].reverse();

    const candidates = [forward, backward];
    const selected = expectedCount > 0
      ? candidates.sort((a, b) => Math.abs(a.length - 1 - expectedCount) - Math.abs(b.length - 1 - expectedCount))[0]
      : candidates.sort((a, b) => a.length - b.length)[0];

    return NextResponse.json({ status: "OK", lineName, points: selected });
  } catch (e) {
    return NextResponse.json({ error: "SUBWAY_SEGMENT_SHAPE_ERROR", message: String(e) }, { status: 502 });
  }
}
