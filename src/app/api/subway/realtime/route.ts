import { NextRequest, NextResponse } from "next/server";

const SEOUL_OPENAPI_BASE = "http://openapi.seoul.go.kr:8088";
const SEOUL_SUBWAY_REALTIME_BASE = "http://swopenapi.seoul.go.kr/api/subway";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const stationName = p.get("station")?.trim() ?? "";
  const lineCode = p.get("lineCode")?.trim() ?? "";
  const lineName = p.get("lineName")?.trim() ?? "";

  if (!stationName) return NextResponse.json({ error: "Missing station" }, { status: 400 });

  const searchKey = process.env.SEOUL_SUBWAY_SEARCH_KEY ?? "";
  const arrivalKey = process.env.SEOUL_SUBWAY_ARRIVAL_KEY ?? searchKey;
  const positionKey = process.env.SEOUL_SUBWAY_POSITION_KEY ?? "";

  if (!searchKey || !arrivalKey) return NextResponse.json({ error: "Missing subway API keys" }, { status: 500 });

  try {
    const [searchRes, arrivalRes] = await Promise.all([
      fetch(`${SEOUL_OPENAPI_BASE}/${searchKey}/json/SearchInfoBySubwayNameService/1/20/${encodeURIComponent(stationName)}`),
      fetch(`${SEOUL_SUBWAY_REALTIME_BASE}/${arrivalKey}/json/realtimeStationArrival/0/20/${encodeURIComponent(stationName)}`),
    ]);

    const [searchData, arrivalData] = await Promise.all([searchRes.json(), arrivalRes.json()]);

    let positions: { realtimePositionList: unknown[] } = { realtimePositionList: [] };
    if (lineName && positionKey) {
      const posRes = await fetch(`${SEOUL_SUBWAY_REALTIME_BASE}/${positionKey}/json/realtimePosition/0/200/${encodeURIComponent(lineName)}`);
      if (posRes.ok) positions = await posRes.json();
    }

    let arrivals: Record<string, unknown>[] = (arrivalData.realtimeArrivalList ?? []) as Record<string, unknown>[];
    const searchRows: Record<string, unknown>[] = ((searchData.SearchInfoBySubwayNameService?.row ?? []) as Record<string, unknown>[]);

    if (lineCode) {
      arrivals = arrivals.filter((item) => item.subwayId === lineCode);
    }

    const positionRows = (positions.realtimePositionList ?? []) as Record<string, unknown>[];
    const enriched = arrivals.slice(0, 4).map((item) => {
      const matched = positionRows.find(
        (pos) => pos.trainNo === item.btrainNo || pos.trainNo === item.trainNo
      );
      return {
        subwayId: item.subwayId,
        updnLine: item.updnLine,
        trainLineNm: item.trainLineNm,
        arvlMsg2: item.arvlMsg2,
        arvlMsg3: item.arvlMsg3,
        barvlDt: item.barvlDt,
        btrainNo: item.btrainNo,
        bstatnNm: item.bstatnNm,
        recptnDt: item.recptnDt,
        position: matched ?? null,
      };
    });

    return NextResponse.json({ station: stationName, lineCode, lineName, searchRows, arrivals: enriched });
  } catch (e) {
    return NextResponse.json({ error: "SUBWAY_REALTIME_ERROR", message: String(e) }, { status: 502 });
  }
}
