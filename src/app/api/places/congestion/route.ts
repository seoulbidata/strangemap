import { NextResponse } from "next/server";
import { SEOUL_PLACES } from "@/lib/seoulPlaces";

export interface CongestionData {
  areaName: string;
  level: "여유" | "보통" | "약간 붐빔" | "붐빔";
  message: string;
  ppltnMin: number;
  ppltnMax: number;
  updatedAt: string;
}

// Module-level cache: 5-minute TTL
const _cache = new Map<string, { data: CongestionData; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

async function fetchOneCongestion(areaName: string): Promise<CongestionData | null> {
  const hit = _cache.get(areaName);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  const key = process.env.SEOUL_API_KEY;
  if (!key) return null;

  const url = `http://openapi.seoul.go.kr:8088/${key}/json/citydata_ppltn/1/5/${encodeURIComponent(areaName)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = await res.json();

    const items: Record<string, string>[] | undefined = json["SeoulRtd.citydata_ppltn"];
    if (!items || items.length === 0) return null;

    const item = items[0];
    const data: CongestionData = {
      areaName: item.AREA_NM ?? areaName,
      level: (item.AREA_CONGEST_LVL ?? "보통") as CongestionData["level"],
      message: item.AREA_CONGEST_MSG ?? "",
      ppltnMin: parseInt(item.AREA_PPLTN_MIN ?? "0", 10),
      ppltnMax: parseInt(item.AREA_PPLTN_MAX ?? "0", 10),
      updatedAt: item.PPLTN_TIME ?? "",
    };

    _cache.set(areaName, { data, ts: Date.now() });
    return data;
  } catch {
    return null;
  }
}

// Fetch in batches of 6 to avoid overwhelming the API
async function fetchInBatches<T>(
  items: T[],
  fn: (item: T) => Promise<CongestionData | null>,
  batchSize = 6
): Promise<(CongestionData | null)[]> {
  const results: (CongestionData | null)[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fn));
    for (const r of settled) {
      results.push(r.status === "fulfilled" ? r.value : null);
    }
  }
  return results;
}

export async function GET() {
  const results = await fetchInBatches(SEOUL_PLACES, (p) => fetchOneCongestion(p.areaName));

  const congestionMap: Record<string, CongestionData> = {};
  results.forEach((result, i) => {
    if (result) congestionMap[SEOUL_PLACES[i].areaName] = result;
  });

  return NextResponse.json(congestionMap);
}
