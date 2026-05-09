import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import { normalizeCategory, type CultureCategory } from "@/lib/cultureCategories";

export interface POIItem {
  id: string;
  name: string;
  category: string;
  normalizedCategory?: CultureCategory;
  source: "culture" | "nightview";
  lat: number;
  lng: number;
  place: string;
  date?: string;
  fee: string;
  thumbnail?: string;
  link?: string;
  operating_time?: string;
  subway?: string;
  tel?: string;
  bus?: string;
  parking?: string;
  viewpoint?: string[];
}

export async function GET() {
  const apiKey = process.env.SEOUL_API_KEY;
  const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/culturalEventInfo/1/500/`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  const data = await res.json();
  const rows = data?.culturalEventInfo?.row ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const culturePOIs: POIItem[] = rows
    .filter((r: any) => {
      if (!r.LAT || !r.LOT || parseFloat(r.LAT) === 0) return false;
      if (r.END_DATE) {
        const endDate = new Date(r.END_DATE.slice(0, 10));
        if (endDate < today) return false;
      }
      return true;
    })
    .map((r: any) => ({
      id: "culture_" + r.TITLE + r.STRTDATE,
      name: r.TITLE,
      category: r.CODENAME,
      normalizedCategory: normalizeCategory(r.CODENAME),
      source: "culture" as const,
      lat: parseFloat(r.LAT),
      lng: parseFloat(r.LOT),
      place: r.PLACE,
      date: r.DATE,
      fee: r.USE_FEE || "무료",
      thumbnail: r.MAIN_IMG,
      link: r.HMPG_ADDR,
    }));

  const nightviewPath = path.join(process.cwd(), "public/data/nightview.json");
  const nightviewRaw = JSON.parse(readFileSync(nightviewPath, "utf-8"));
  const nightviewPOIs: POIItem[] = nightviewRaw.map((r: any) => ({
    id: "nightview_" + r.id,
    name: r.name,
    category: r.category,
    source: "nightview" as const,
    lat: r.lat,
    lng: r.lng,
    place: r.place,
    fee: r.fee || "무료",
    link: r.url,
    operating_time: r.operating_time,
    subway: r.subway,
    tel: r.tel || undefined,
    bus: r.bus || undefined,
    parking: r.parking || undefined,
    thumbnail: r.image || null,
    viewpoint: r.viewpoint || undefined,
  }));

  return NextResponse.json({ pois: [...culturePOIs, ...nightviewPOIs] });
}