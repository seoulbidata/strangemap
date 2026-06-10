import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import { normalizeCategory, type CultureCategory } from "@/lib/cultureCategories";

export interface POIItem {
  id: string;
  name: string;
  category: string;
  normalizedCategory?: CultureCategory;
  source: "culture" | "nightview" | "theme_course";
  lat: number;
  lng: number;
  place: string;
  date?: string;
  endDate?: string;
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

function isEventPassed(endDateStr: string, proTimeStr?: string): boolean {
  if (!endDateStr) return false;

  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstTime = new Date(now.getTime() + kstOffset);

  const currentYear = kstTime.getUTCFullYear();
  const currentMonth = kstTime.getUTCMonth() + 1;
  const currentDate = kstTime.getUTCDate();
  const currentHour = kstTime.getUTCHours();
  const currentMin = kstTime.getUTCMinutes();

  const datePart = endDateStr.slice(0, 10);
  const [endYear, endMonth, endDay] = datePart.split("-").map(Number);

  if (!endYear || !endMonth || !endDay) return false;

  if (endYear < currentYear) return true;
  if (endYear > currentYear) return false;
  if (endMonth < currentMonth) return true;
  if (endMonth > currentMonth) return false;
  if (endDay < currentDate) return true;
  if (endDay > currentDate) return false;

  if (endDay === currentDate) {
    if (!proTimeStr) return false;

    const timeMatches = [...proTimeStr.matchAll(/(\d{1,2}):(\d{2})/g)];
    let endHour = 23;
    let endMin = 59;

    if (timeMatches.length > 0) {
      const lastMatch = timeMatches[timeMatches.length - 1];
      endHour = parseInt(lastMatch[1], 10);
      endMin = parseInt(lastMatch[2], 10);
    } else {
      const hourMatches = [...proTimeStr.matchAll(/(\d{1,2})\s*시/g)];
      if (hourMatches.length > 0) {
        const lastMatch = hourMatches[hourMatches.length - 1];
        endHour = parseInt(lastMatch[1], 10);
        endMin = 0;
      }
    }

    if (currentHour > endHour) return true;
    if (currentHour === endHour && currentMin > endMin) return true;
  }

  return false;
}

export async function GET() {
  const apiKey = process.env.SEOUL_API_KEY;
  const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/culturalEventInfo/1/500/`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  const data = await res.json();
  const rows = data?.culturalEventInfo?.row ?? [];

  const culturePOIs: POIItem[] = rows
    .filter((r: any) => {
      if (!r.LAT || !r.LOT || parseFloat(r.LAT) === 0) return false;
      if (isEventPassed(r.END_DATE, r.PRO_TIME)) return false;
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
      endDate: r.END_DATE ? r.END_DATE.slice(0, 10) : undefined,
      fee: r.USE_FEE || "무료",
      thumbnail: r.MAIN_IMG,
      link: r.HMPG_ADDR,
      operating_time: r.PRO_TIME || undefined,
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