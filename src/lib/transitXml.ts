import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

export function parseXml(text: string): Record<string, unknown> {
  try {
    return parser.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getText(node: unknown, tag: string): string {
  if (!node || typeof node !== "object") return "";
  const value = (node as Record<string, unknown>)[tag];
  if (value === undefined || value === null) return "";
  return String(value);
}

function getFloat(node: unknown, tag: string): number | null {
  const v = parseFloat(getText(node, tag));
  return isFinite(v) ? v : null;
}

export interface TransitPath {
  mode: "subway" | "bus";
  fromId: string;
  fromName: string;
  fromLat: number | null;
  fromLng: number | null;
  lineName: string;
  routeId: string;
  busRouteType: string;
  toId: string;
  toName: string;
  toLat: number | null;
  toLng: number | null;
  railLinkCount: number;
}

export interface TransitRoute {
  distance: number;
  time: number;
  paths: TransitPath[];
}

export interface TransitRouteResult {
  headerCode: string;
  headerMessage: string;
  endpoint: string;
  routes: TransitRoute[];
}

export function parseTransitRouteXml(body: string, endpoint: string): TransitRouteResult {
  const parsed = parseXml(body);
  const root = (parsed?.ServiceResult as Record<string, unknown>) ?? parsed;
  const msgHeader = (root.msgHeader as Record<string, unknown>) ?? {};
  const headerCode = getText(msgHeader, "headerCd");
  const headerMessage = getText(msgHeader, "headerMsg");

  const msgBody = (root.msgBody as Record<string, unknown>) ?? {};
  let itemList = msgBody.itemList;
  if (!Array.isArray(itemList)) itemList = itemList ? [itemList] : [];

  const routes: TransitRoute[] = (itemList as unknown[]).map((item) => {
    let pathList = (item as Record<string, unknown>).pathList;
    if (!Array.isArray(pathList)) pathList = pathList ? [pathList] : [];

    const paths: TransitPath[] = (pathList as unknown[]).map((pathNode) => {
      let railLinkList = (pathNode as Record<string, unknown>).railLinkList;
      if (!Array.isArray(railLinkList)) railLinkList = railLinkList ? [railLinkList] : [];
      const railLinkCount = (railLinkList as unknown[]).length;
      const lineName = getText(pathNode, "routeNm");
      const isSubway = railLinkCount > 0 || lineName.endsWith("호선");

      return {
        mode: isSubway ? "subway" : "bus",
        fromId: getText(pathNode, "fid"),
        fromName: getText(pathNode, "fname"),
        fromLat: getFloat(pathNode, "fy"),
        fromLng: getFloat(pathNode, "fx"),
        lineName,
        routeId: getText(pathNode, "routeId"),
        busRouteType: "",
        toId: getText(pathNode, "tid"),
        toName: getText(pathNode, "tname"),
        toLat: getFloat(pathNode, "ty"),
        toLng: getFloat(pathNode, "tx"),
        railLinkCount,
      } satisfies TransitPath;
    });

    return {
      distance: parseInt(getText(item, "distance") || "0", 10),
      time: parseInt(getText(item, "time") || "0", 10),
      paths,
    };
  });

  return { headerCode, headerMessage, endpoint, routes };
}

function parseArrivalSeconds(message: string): number {
  if (!message) return 0;
  if (/곧|도착|진입/.test(message)) return 0;
  const minuteMatch = message.match(/(\d+)\s*분(?:\s*(\d+)\s*초)?/);
  if (minuteMatch) return parseInt(minuteMatch[1], 10) * 60 + parseInt(minuteMatch[2] ?? "0", 10);
  const secondMatch = message.match(/(\d+)\s*초/);
  return secondMatch ? parseInt(secondMatch[1], 10) : 0;
}

function busArrivalSeconds(item: unknown, message: string, order: number): number {
  if (/곧|도착|진입/.test(message)) return parseArrivalSeconds(message);
  for (const field of [`arrmsgSec${order}`, `traTime${order}`, `exps${order}`, `arriveTime${order}`]) {
    const v = parseInt(getText(item, field), 10);
    if (v > 0 && v <= 86400) return v;
  }
  return parseArrivalSeconds(message);
}

function busArrivalStationCount(item: unknown, message: string, order: number): number {
  const match = message.match(/\[(\d+)\s*번째\s*전\]/);
  if (match) return parseInt(match[1], 10);
  const v = parseInt(getText(item, `stationCount${order}`), 10);
  return v > 0 ? v : 0;
}

export function parseBusArrivalXml(body: string, stopId: string, routeId: string, routeName: string) {
  const parsed = parseXml(body);
  const root = (parsed?.ServiceResult as Record<string, unknown>) ?? parsed;
  const msgHeader = (root.msgHeader as Record<string, unknown>) ?? {};
  const headerCode = getText(msgHeader, "headerCd");
  const headerMessage = getText(msgHeader, "headerMsg");

  const msgBody = (root.msgBody as Record<string, unknown>) ?? {};
  let itemList = msgBody.itemList;
  if (!Array.isArray(itemList)) itemList = itemList ? [itemList] : [];

  const arrivals = (itemList as unknown[])
    .filter((item) => {
      const ir = getText(item, "busRouteId");
      const irn = getText(item, "rtNm");
      if (routeId && ir && ir !== routeId) return false;
      if (routeName && irn && !irn.includes(routeName)) return false;
      return true;
    })
    .slice(0, 3)
    .map((item) => {
      const firstText = (names: string[]) => names.map((n) => getText(item, n)).find(Boolean) ?? "";
      const arrmsg1 = getText(item, "arrmsg1");
      const arrmsg2 = getText(item, "arrmsg2");
      return {
        routeId: getText(item, "busRouteId"),
        routeName: getText(item, "rtNm") || routeName,
        arrmsg1,
        arrmsg2,
        arrivalSeconds1: busArrivalSeconds(item, arrmsg1, 1),
        arrivalSeconds2: busArrivalSeconds(item, arrmsg2, 2),
        stationCount1: busArrivalStationCount(item, arrmsg1, 1),
        stationCount2: busArrivalStationCount(item, arrmsg2, 2),
        congestionCode1: parseInt(firstText(["congest1", "congetion1", "congestion1"]) || "0", 10),
        congestionCode2: parseInt(firstText(["congest2", "congetion2", "congestion2"]) || "0", 10),
        rerideDiv1: parseInt(firstText(["rerdieDiv1", "rerdie_Div1", "rerideDiv1", "reride_Div1", "brerdeDiv1", "brerde_Div1"]) || "0", 10),
        rerideDiv2: parseInt(firstText(["rerdieDiv2", "rerdie_Div2", "rerideDiv2", "reride_Div2", "brerdeDiv2", "brerde_Div2"]) || "0", 10),
        rerideCount1: parseInt(firstText(["rerideNum1", "reride_Num1", "rerdieNum1", "rerdie_Num1", "brdrde_Num1"]) || "0", 10),
        rerideCount2: parseInt(firstText(["rerideNum2", "reride_Num2", "rerdieNum2", "rerdie_Num2", "brdrde_Num2"]) || "0", 10),
        fullFlag1: firstText(["isFullFlag1", "full1"]),
        fullFlag2: firstText(["isFullFlag2", "full2"]),
        plainNo1: getText(item, "plainNo1"),
        plainNo2: getText(item, "plainNo2"),
        busType1: getText(item, "busType1"),
        busType2: getText(item, "busType2"),
        stationName: getText(item, "stNm"),
        direction: getText(item, "adirection") || getText(item, "dir"),
        vehicleId1: getText(item, "vehId1"),
        vehicleId2: getText(item, "vehId2"),
        lastUpdated: getText(item, "mkTm"),
      };
    });

  return { stopId, routeId, routeName, headerCode, headerMessage, arrivals };
}

let cachedStations: { name: string; lat: number; lng: number }[] | null = null;

export async function fetchTransitWithFallback(
  endpoint: string,
  startX: string,
  startY: string,
  endX: string,
  endY: string,
  key: string
): Promise<TransitRouteResult> {
  const base = "http://ws.bus.go.kr/api/rest/pathinfo";
  const url = `${base}/${endpoint}?ServiceKey=${key}&startX=${startX}&startY=${startY}&endX=${endX}&endY=${endY}`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/xml" } });
    const body = await res.text();
    const parsed = parseTransitRouteXml(body, endpoint);

    // 정상적으로 경로가 조회된 경우 바로 반환
    if (parsed.routes.length > 0 && parsed.headerCode === "0") {
      return parsed;
    }

    const masterKey = process.env.SEOUL_SUBWAY_MASTER_KEY ?? "";
    if (!masterKey) return parsed;

    if (!cachedStations) {
      try {
        const sRes = await fetch(`http://openapi.seoul.go.kr:8088/${masterKey}/json/subwayStationMaster/1/1000/`);
        const sData = await sRes.json();
        const rows = sData.subwayStationMaster?.row ?? [];
        cachedStations = rows
          .map((row: any) => ({
            name: String(row.BLDN_NM ?? ""),
            lat: parseFloat(row.LAT ?? "0"),
            lng: parseFloat(row.LOT ?? "0"),
          }))
          .filter((s: any) => s.lat > 0 && s.lng > 0);
      } catch (e) {
        console.error("Failed to fetch subway master for snapping fallback:", e);
        cachedStations = [];
      }
    }

    const startLng = parseFloat(startX);
    const startLat = parseFloat(startY);
    const endLng = parseFloat(endX);
    const endLat = parseFloat(endY);

    if (isNaN(startLng) || isNaN(startLat) || isNaN(endLng) || isNaN(endLat)) {
      return parsed;
    }

    const calcDist = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const dx = (lng1 - lng2) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
      const dy = lat1 - lat2;
      return Math.sqrt(dx * dx + dy * dy) * 111_320;
    };

    let bestStart: { name: string; lat: number; lng: number } | null = null;
    let bestStartDist = Infinity;
    let bestEnd: { name: string; lat: number; lng: number } | null = null;
    let bestEndDist = Infinity;

    for (const s of cachedStations ?? []) {
      const dStart = calcDist(startLat, startLng, s.lat, s.lng);
      if (dStart < bestStartDist) {
        bestStartDist = dStart;
        bestStart = s;
      }
      const dEnd = calcDist(endLat, endLng, s.lat, s.lng);
      if (dEnd < bestEndDist) {
        bestEndDist = dEnd;
        bestEnd = s;
      }
    }

    // 2km 이내의 가장 가까운 지하철역으로 스냅하여 재탐색 시도
    const startSnapped = bestStart && bestStartDist < 2000 && bestStartDist > 30;
    const endSnapped = bestEnd && bestEndDist < 2000 && bestEndDist > 30;

    if (startSnapped || endSnapped) {
      const newStartX = startSnapped && bestStart ? bestStart.lng.toFixed(6) : startX;
      const newStartY = startSnapped && bestStart ? bestStart.lat.toFixed(6) : startY;
      const newEndX = endSnapped && bestEnd ? bestEnd.lng.toFixed(6) : endX;
      const newEndY = endSnapped && bestEnd ? bestEnd.lat.toFixed(6) : endY;

      console.log(
        `[Fallback Snap] Snapping start: ${startX},${startY} -> ${newStartX},${newStartY} (${bestStart?.name}, d=${bestStartDist.toFixed(0)}m), ` +
        `end: ${endX},${endY} -> ${newEndX},${newEndY} (${bestEnd?.name}, d=${bestEndDist.toFixed(0)}m)`
      );

      const retryUrl = `${base}/${endpoint}?ServiceKey=${key}&startX=${newStartX}&startY=${newStartY}&endX=${newEndX}&endY=${newEndY}`;
      const retryRes = await fetch(retryUrl, { headers: { Accept: "application/xml" } });
      const retryBody = await retryRes.text();
      const retryParsed = parseTransitRouteXml(retryBody, endpoint);
      if (retryParsed.routes.length > 0) {
        return retryParsed;
      }
    }

    return parsed;
  } catch (e) {
    console.error("fetchTransitWithFallback error:", e);
    return { headerCode: "9", headerMessage: String(e), endpoint, routes: [] };
  }
}
