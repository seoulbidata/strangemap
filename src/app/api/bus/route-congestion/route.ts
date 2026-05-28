import { NextRequest, NextResponse } from "next/server";

const ROUTE_CONGESTION_KEY = process.env.ROUTE_CONGESTION_KEY ?? "";
const API_URL = "http://apis.data.go.kr/1613000/RouteCongestionLevel/getRouteCongestionLevel";

const cache = new Map<string, { ts: number; body: unknown }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function scoreLabel(score: number) {
  if (score <= 25) return { label: "원활", color: "#2563eb" };
  if (score <= 50) return { label: "보통", color: "#16a34a" };
  if (score <= 75) return { label: "약간 혼잡", color: "#f97316" };
  if (score <= 100) return { label: "혼잡", color: "#dc2626" };
  return { label: "매우 혼잡", color: "#991b1b" };
}

function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function ymd(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function monthStartCandidates() {
  const now = kstNow();
  const out: string[] = [];
  for (let i = 0; i < 8; i++) {
    out.push(ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return out;
}

function currentTimeZone() {
  const hour = kstNow().getUTCHours();
  return String(hour === 0 ? 24 : hour).padStart(2, "0");
}

function normalizeItems(data: any): any[] {
  const item = data?.Response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

async function fetchCongestion(params: {
  oprYmd: string;
  ctpvCd: string;
  sggCd: string;
  routeId?: string;
  stationId?: string;
}) {
  const search = new URLSearchParams({
    serviceKey: ROUTE_CONGESTION_KEY,
    pageNo: "1",
    numOfRows: "1000",
    opr_ymd: params.oprYmd,
    ctpv_cd: params.ctpvCd,
    sgg_cd: params.sggCd,
    dataType: "JSON",
  });
  if (params.routeId) search.set("rte_id", params.routeId);
  if (params.stationId) search.set("sttn_id", params.stationId);

  const res = await fetch(`${API_URL}?${search}`, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 60 * 60 * 6 },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

function pickScore(items: any[], preferredTzon: string) {
  const exact = items.filter((item) => String(item.tzon).padStart(2, "0") === preferredTzon);
  const pool = exact.length ? exact : items;
  const scores = pool
    .map((item) => Number(item.cgst))
    .filter((v) => Number.isFinite(v) && v >= 0);
  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length);
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const routeId = p.get("routeId")?.trim() ?? "";
  const stationId = p.get("stationId")?.trim() ?? "";
  const ctpvCd = p.get("ctpvCd")?.trim() || "11";
  const sggCd = p.get("sggCd")?.trim() || "11140";
  const tzon = p.get("tzon")?.trim().padStart(2, "0") || currentTimeZone();

  if (!ROUTE_CONGESTION_KEY) return NextResponse.json({ status: "NO_KEY" });

  const cacheKey = `${routeId}|${stationId}|${ctpvCd}|${sggCd}|${tzon}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.body);
  }

  try {
    for (const oprYmd of monthStartCandidates()) {
      const attempts = [
        { routeId, stationId },
        { routeId, stationId: "" },
        { routeId: "", stationId: "" },
      ].filter((v, idx, arr) => idx === arr.findIndex((x) => x.routeId === v.routeId && x.stationId === v.stationId));

      for (const attempt of attempts) {
        const data = await fetchCongestion({ oprYmd, ctpvCd, sggCd, routeId: attempt.routeId, stationId: attempt.stationId });
        const items = normalizeItems(data);
        const score = pickScore(items, tzon);
        if (score == null) continue;
        const { label, color } = scoreLabel(score);
        const body = {
          status: "OK",
          source: attempt.routeId ? "routeCongestionLevel-route" : "routeCongestionLevel-district",
          score,
          label,
          color,
          oprYmd,
          tzon,
          ctpvCd,
          sggCd,
          routeId: attempt.routeId || undefined,
          stationId: attempt.stationId || undefined,
          sampleCount: items.length,
        };
        cache.set(cacheKey, { ts: Date.now(), body });
        return NextResponse.json(body);
      }
    }

    const body = { status: "NO_DATA", routeId, stationId, ctpvCd, sggCd, tzon };
    cache.set(cacheKey, { ts: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: "ROUTE_CONGESTION_ERROR", message: String(e) }, { status: 502 });
  }
}
