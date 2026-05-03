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
        congestionCode1: parseInt(firstText(["congetion1", "congestion1"]) || "0", 10),
        congestionCode2: parseInt(firstText(["congetion2", "congestion2"]) || "0", 10),
        rerideCount1: parseInt(firstText(["rerideNum1", "reride_Num1", "brdrde_Num1"]) || "0", 10),
        rerideCount2: parseInt(firstText(["rerideNum2", "reride_Num2", "brdrde_Num2"]) || "0", 10),
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
