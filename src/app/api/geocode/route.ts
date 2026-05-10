import { NextRequest, NextResponse } from "next/server";

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID ?? "";
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET ?? "";
const NAVER_LOCAL_CLIENT_ID = process.env.NAVER_LOCAL_CLIENT_ID ?? "";
const NAVER_LOCAL_CLIENT_SECRET = process.env.NAVER_LOCAL_CLIENT_SECRET ?? "";
const SEOUL_SUBWAY_SEARCH_KEY = process.env.SEOUL_SUBWAY_SEARCH_KEY ?? "";
const SEOUL_SUBWAY_MASTER_KEY = process.env.SEOUL_SUBWAY_MASTER_KEY ?? "";
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
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/\(.+?\)/g, "")
    .replace(/\s+\d+호선$/, "")
    .replace(/\s+[가-힣]+선$/, "")
    .replace(/역$/, "")
    .trim();
}

function normalizeLineName(value: string): string {
  return value.replace(/\s+/g, "").replace(/\(.+?\)/g, "").replace(/^0+(\d+호선)$/, "$1");
}

function subwayCoordKey(lineName: string, stationName: string) {
  return `${normalizeLineName(lineName)}:${normalizeStationName(stationName)}`;
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

async function fetchSubwayMasterCoords() {
  if (!SEOUL_SUBWAY_MASTER_KEY) return new Map<string, { x: string; y: string }>();

  const res = await fetch(`${SEOUL_OPENAPI_BASE}/${SEOUL_SUBWAY_MASTER_KEY}/json/subwayStationMaster/1/1000/`);
  if (!res.ok) return new Map<string, { x: string; y: string }>();

  const data = await res.json();
  const rows: Record<string, string>[] = data.subwayStationMaster?.row ?? [];
  const coords = new Map<string, { x: string; y: string }>();

  for (const row of rows) {
    const lineName = row.ROUTE ?? "";
    const stationName = row.BLDN_NM ?? "";
    const lat = row.LAT ?? "";
    const lng = row.LOT ?? "";
    if (!lineName || !stationName || !lat || !lng) continue;
    coords.set(subwayCoordKey(lineName, stationName), { x: lng, y: lat });
  }

  return coords;
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

async function fetchSubwayStationMaster(stationName: string): Promise<AddressItem[]> {
  if (!SEOUL_SUBWAY_MASTER_KEY) return [];
  const url = `${SEOUL_OPENAPI_BASE}/${SEOUL_SUBWAY_MASTER_KEY}/json/subwayStationMaster/1/100/${encodeURIComponent(stationName)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    const rows: Record<string, string>[] = data?.subwayStationMaster?.row ?? [];
    const results: AddressItem[] = [];
    for (const row of rows) {
      const rowStation = normalizeStationName(row.STATION_NM ?? "");
      if (rowStation !== stationName) continue;
      // 서울시 subwayStationMaster 좌표 필드명 (복수 후보 대응)
      const lng = row.XNTS_X ?? row.X_COORDINATE ?? row.CRDNT_X ?? row.X ?? "";
      const lat = row.XNTS_Y ?? row.Y_COORDINATE ?? row.CRDNT_Y ?? row.Y ?? "";
      if (!lng || !lat || !isFinite(parseFloat(lng)) || !isFinite(parseFloat(lat))) continue;
      const lineName = row.LINE_NUM ?? "";
      results.push({
        x: lng,
        y: lat,
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

async function fetchSubwayStationLocations(query: string): Promise<AddressItem[]> {
  const stationName = normalizeStationName(query);

  // 1순위: subwayStationMaster로 좌표 직접 획득
  const masterResults = await fetchSubwayStationMaster(stationName);
  if (masterResults.length) return masterResults;

  // 2순위: SearchInfoBySubwayNameService + Naver local 좌표 fallback
  if (!SEOUL_SUBWAY_SEARCH_KEY) return [];
  const url = `${SEOUL_OPENAPI_BASE}/${SEOUL_SUBWAY_SEARCH_KEY}/json/SearchInfoBySubwayNameService/1/20/${encodeURIComponent(stationName)}`;
  try {
    const [res, masterCoords] = await Promise.all([
      fetch(url, { headers: { Accept: "application/json" } }),
      fetchSubwayMasterCoords(),
    ]);
    if (!res.ok) return [];
    const data = await res.json();
    const rows: Record<string, string>[] = data?.SearchInfoBySubwayNameService?.row ?? [];
    const results: AddressItem[] = [];
    for (const row of rows) {
      const rowStation = normalizeStationName(row.STATION_NM ?? row.STTN_NM ?? "");
      if (rowStation !== stationName) continue;
      const lineName = row.LINE_NUM ?? "";
      let stationCoord = masterCoords.get(subwayCoordKey(lineName, rowStation));

      if (!stationCoord) {
        const places = await fetchNaverLocalPlaces(`${rowStation}역 ${lineName}`);
        const stationPlace = places.find(
          (p) =>
            normalizeStationName(p.placeName ?? "") === rowStation &&
            (p.category?.includes("지하철") || p.category?.includes("역") || p.placeName?.includes("역"))
        );
        if (stationPlace) stationCoord = { x: stationPlace.x, y: stationPlace.y };
      }

      if (!stationCoord) continue;
      results.push({
        x: stationCoord.x,
        y: stationCoord.y,
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

  // seoulSubwayStation을 dedupe 전에 앞으로 정렬해 우선순위 보장
  allAddresses.sort((a, b) => {
    if (a.source === "seoulSubwayStation" && b.source !== "seoulSubwayStation") return -1;
    if (b.source === "seoulSubwayStation" && a.source !== "seoulSubwayStation") return 1;
    return 0;
  });

  return NextResponse.json({
    status: "OK",
    source: "combined",
    addresses: dedupeAddresses(allAddresses),
    placeSearchEnabled: Boolean(NAVER_LOCAL_CLIENT_ID && NAVER_LOCAL_CLIENT_SECRET),
  });
}
