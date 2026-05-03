import { NextRequest, NextResponse } from "next/server";

const SEOUL_OPENAPI_BASE = "http://openapi.seoul.go.kr:8088";

function normalizeStationName(v: string) {
  return v.replace(/\(.+?\)/g, "").replace(/역$/, "").trim();
}

function normalizeLineName(v: string) {
  return v.replace(/\s/g, "").replace(/^0+(\d+호선)$/, "$1");
}

function congestionLabel(score: number): { label: string; color: string } {
  if (score <= 25) return { label: "원활", color: "#2563eb" };
  if (score <= 50) return { label: "보통", color: "#16a34a" };
  if (score <= 75) return { label: "약간 혼잡", color: "#f97316" };
  if (score <= 100) return { label: "혼잡", color: "#dc2626" };
  return { label: "매우 혼잡", color: "#991b1b" };
}

function currentTimeField(): [string, string] {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes() >= 30 ? 30 : 0;
  if (hour < 5 || (hour === 5 && minute < 30)) return ["TIME0530", "05:30"];
  return [`TIME${String(hour).padStart(2, "0")}${minute === 30 ? "30" : "00"}`, `${String(hour).padStart(2, "0")}:${minute === 30 ? "30" : "00"}`];
}

function currentDayType(): string {
  const day = new Date().getDay();
  if (day === 0) return "일요일";
  if (day === 6) return "토요일";
  return "평일";
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const stationName = normalizeStationName(p.get("station")?.trim() ?? "");
  const lineName = p.get("lineName")?.trim() ?? "";

  if (!stationName) return NextResponse.json({ error: "Missing station" }, { status: 400 });

  const confusionKey = process.env.SEOUL_SUBWAY_CONFUSION_KEY ?? "";
  if (!confusionKey) {
    return NextResponse.json({ status: "NO_KEY", station: stationName, lineName, message: "혼잡도 API 키 없음" });
  }

  try {
    const rows: Record<string, string>[] = [];
    let start = 1;
    let total: number | null = null;
    while (total === null || start <= total) {
      const end = start + 999;
      const res = await fetch(`${SEOUL_OPENAPI_BASE}/${confusionKey}/json/subwConfusion/${start}/${end}/`);
      const data = await res.json();
      const body = data.subwConfusion ?? {};
      const pageRows: Record<string, string>[] = body.row ?? [];
      if (total === null) total = parseInt(body.list_total_count ?? "0", 10) || pageRows.length;
      if (!pageRows.length) break;
      rows.push(...pageRows);
      if (end >= total) break;
      start = end + 1;
    }

    const dayType = currentDayType();
    const [timeField, timeLabel] = currentTimeField();
    const normalizedLine = normalizeLineName(lineName);

    const matched = rows.filter((row) => {
      if (normalizeStationName(row.DPTRE_STTN ?? "") !== stationName) return false;
      if (normalizedLine && normalizeLineName(row.LINE ?? "") !== normalizedLine) return false;
      if ((row.DOW_SE ?? "") !== dayType) return false;
      return true;
    });

    if (!matched.length) {
      return NextResponse.json({ status: "NO_DATA", station: stationName, lineName, message: "데이터 없음" });
    }

    const scores = matched.map((row) => parseFloat(row[timeField] ?? "0") || 0);
    const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10;
    const { label, color } = congestionLabel(score);

    return NextResponse.json({
      status: "OK",
      source: "seoulSubwayConfusion",
      station: stationName,
      lineName,
      dayType,
      timeSlot: timeLabel,
      score,
      label,
      color,
    });
  } catch (e) {
    return NextResponse.json({ error: "SUBWAY_CONGESTION_ERROR", message: String(e) }, { status: 502 });
  }
}
