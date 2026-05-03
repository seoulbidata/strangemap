import { NextRequest, NextResponse } from "next/server";

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID ?? "";
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET ?? "";
const NAVER_LOCAL_CLIENT_ID = process.env.NAVER_LOCAL_CLIENT_ID ?? "";
const NAVER_LOCAL_CLIENT_SECRET = process.env.NAVER_LOCAL_CLIENT_SECRET ?? "";
const SEOUL_SUBWAY_SEARCH_KEY = process.env.SEOUL_SUBWAY_SEARCH_KEY ?? "";
const SEOUL_TRANSIT_ROUTE_KEY = process.env.SEOUL_TRANSIT_ROUTE_KEY ?? "";
const SEOUL_OPENAPI_BASE = "http://openapi.seoul.go.kr:8088";
const SEOUL_TRANSIT_ROUTE_BASE = "http://ws.bus.go.kr/api/rest/pathinfo";

interface AddressItem {
  x: string;
  y: string;
  placeName?: string;
  roadAddress?: string;
  jibunAddress?: string;
  category?: string;
  telephone?: string;
  link?: string;
  stationCode?: string;
  lineName?: string;
  source: string;
}

function cleanHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "").trim();
}

function normalizeStationName(value: string): string {
  return value.replace(/\(.+?\)/g, "").replace(/역$/, "").trim();
}

function naverLocalCoord(value: unknown): string {
  try {
    return String(Number(value) / 10_000_000);
  } catch {
    return "";
  }
}

function isStationQuery(query: string): boolean {
  return query.includes("역") || normalizeStationName(query).length <= 4;
}

function dedupeAddresses(addresses: AddressItem[]): AddressItem[] {
  const seen = new Set<string>();
  const result: AddressItem[] = [];
  for (const item of addresses) {
    const lng = String(item.x ?? "").trim();
    const lat = String(item.y ?? "").trim();
    const label = item.placeName || item.roadAddress || item.jibunAddress || "";
    const key = `${label}|${lat.slice(0, 12)}|${lng.slice(0, 12)}`;
    if (!lng || !lat || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result.slice(0, 12);
}

async function fetchNaverGeocode(query: string): Promise<AddressItem[]> {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) return [];
  const url = `https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "x-ncp-apigw-api-key-id": NAVER_CLIENT_ID,
      "x-ncp-apigw-api-key": NAVER_CLIENT_SECRET,
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.addresses ?? []).map((item: Record<string, string>) => ({
    x: item.x,
    y: item.y,
    placeName: "",
    roadAddress: item.roadAddress,
    jibunAddress: item.jibunAddress,
    source: "naverGeocode",
  }));
}

async function fetchNaverLocalPlaces(query: string): Promise<AddressItem[]> {
  if (!NAVER_LOCAL_CLIENT_ID || !NAVER_LOCAL_CLIENT_SECRET) return [];
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=8&start=1&sort=comment`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_LOCAL_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_LOCAL_CLIENT_SECRET,
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const results: AddressItem[] = [];
  for (const item of data.items ?? []) {
    let x = naverLocalCoord(item.mapx);
    let y = naverLocalCoord(item.mapy);
    if (!x || !y) {
      const addressQuery = item.roadAddress || item.address || cleanHtml(item.title ?? "");
      const fallback = await fetchNaverGeocode(addressQuery);
      if (fallback[0]) { x = fallback[0].x; y = fallback[0].y; }
    }
    if (!x || !y) continue;
    results.push({
      x, y,
      placeName: cleanHtml(item.title ?? ""),
      roadAddress: item.roadAddress,
      jibunAddress: item.address,
      category: item.category,
      telephone: item.telephone,
      link: item.link,
      source: "naverLocalPlace",
    });
  }
  return results;
}

async function fetchSubwayStationLocations(query: string): Promise<AddressItem[]> {
  if (!SEOUL_SUBWAY_SEARCH_KEY) return [];
  const stationName = normalizeStationName(query);
  const url = `${SEOUL_OPENAPI_BASE}/${SEOUL_SUBWAY_SEARCH_KEY}/json/SearchInfoBySubwayNameService/1/20/${encodeURIComponent(stationName)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    const rows: Record<string, string>[] = data?.SearchInfoBySubwayNameService?.row ?? [];
    const results: AddressItem[] = [];
    for (const row of rows) {
      const rowStation = normalizeStationName(row.STATION_NM ?? row.STTN_NM ?? "");
      if (rowStation !== stationName) continue;
      const lineName = row.LINE_NUM ?? "";
      const places = await fetchNaverLocalPlaces(`${rowStation}역 ${lineName}`);
      const stationPlace = places.find(
        (p) =>
          normalizeStationName(p.placeName ?? "") === rowStation &&
          (p.category?.includes("지하철") || p.category?.includes("역") || p.placeName?.includes("역"))
      );
      if (!stationPlace) continue;
      results.push({
        x: stationPlace.x,
        y: stationPlace.y,
        placeName: `${rowStation}역`,
        roadAddress: `${lineName} ${rowStation}역`,
        jibunAddress: `${lineName} ${rowStation}역`,
        category: "교통,수송>지하철,전철역",
        stationCode: row.STATION_CD ?? row.FR_CODE ?? "",
        lineName,
        source: "seoulSubwayStation",
      });
    }
    return results;
  } catch {
    return [];
  }
}

async function fetchTransitLocations(query: string): Promise<AddressItem[]> {
  if (!SEOUL_TRANSIT_ROUTE_KEY) return [];
  const url = `${SEOUL_TRANSIT_ROUTE_BASE}/getLocationInfo?ServiceKey=${SEOUL_TRANSIT_ROUTE_KEY}&stSrch=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/xml" } });
    if (!res.ok) return [];
    const text = await res.text();
    const items = [...text.matchAll(/<itemList>([\s\S]*?)<\/itemList>/g)];
    return items
      .map((m) => {
        const get = (tag: string) => m[1].match(new RegExp(`<${tag}>(.*?)<\/${tag}>`))?.[1] ?? "";
        const x = get("gpsX");
        const y = get("gpsY");
        const name = get("poiNm");
        if (!x || !y) return null;
        return { x, y, roadAddress: name, jibunAddress: name, source: "seoulTransitLocation" } as AddressItem;
      })
      .filter(Boolean) as AddressItem[];
  } catch {
    return [];
  }
}

async function fetchNominatim(query: string): Promise<AddressItem[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "StrangeMapApp/1.0" } });
    if (!res.ok) return [];
    const items = await res.json();
    return items.map((item: Record<string, string>) => ({
      x: item.lon,
      y: item.lat,
      roadAddress: item.display_name,
      jibunAddress: item.display_name,
      source: "nominatim",
    }));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ error: "Missing q parameter" }, { status: 400 });
  }

  const allAddresses: AddressItem[] = [];

  if (isStationQuery(query)) {
    const subway = await fetchSubwayStationLocations(query);
    allAddresses.push(...subway);
  }

  const [local, geocode, transit, nominatim] = await Promise.all([
    fetchNaverLocalPlaces(query),
    fetchNaverGeocode(query),
    fetchTransitLocations(query),
    fetchNominatim(query),
  ]);

  allAddresses.push(...local, ...geocode, ...transit, ...nominatim);

  return NextResponse.json({
    status: "OK",
    source: "combined",
    addresses: dedupeAddresses(allAddresses),
    placeSearchEnabled: Boolean(NAVER_LOCAL_CLIENT_ID && NAVER_LOCAL_CLIENT_SECRET),
  });
}
