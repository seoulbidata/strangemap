/**
 * 서울명소(public/data/seoulSpots.json)를 SEO 콘텐츠 페이지에서 쓰기 위한 서버 전용 접근자.
 *
 * 지도 앱은 런타임에 fetch("/data/seoulSpots.json") 로 같은 파일을 읽으므로 원본은 public/ 에 둔 채
 * 여기서는 fs 로 읽어 빌드 타임(generateStaticParams / generateMetadata)에 그대로 쓴다.
 *
 * URL 슬러그는 PLACE_NAME_EN 로마자 표기를 하이픈화한 값이다("경복궁" → gyeongbokgung-palace).
 * 슬러그가 바뀌면 색인된 URL이 깨지므로, 로마자 표기를 고칠 때는 리다이렉트를 함께 넣을 것.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PLACE_NAME_EN } from "@/i18n/placeNames";
import { slugify } from "@/lib/seo";

export interface SeoulSpot {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  place: string;
  operating_time: string;
  fee: string;
  subway: string;
  url: string | null;
  tel: string | null;
  bus: string | null;
  parking: string | null;
  image: string;
  /** 대분류 — 목록 페이지 섹션 및 breadcrumb 에 쓴다 */
  spotCategory: string;
  bestTime: "day" | "night" | "any";
  /** 조망 포인트 설명(있는 곳만) */
  viewpoint?: string[];
}

export interface SpotEntry extends SeoulSpot {
  slug: string;
}

export const BEST_TIME_LABEL: Record<SeoulSpot["bestTime"], string> = {
  day: "낮",
  night: "밤",
  any: "언제나",
};

/** 목록 페이지의 섹션 순서 — 검색 수요가 큰 대분류를 위로. */
export const SPOT_CATEGORY_ORDER = [
  "고궁·역사",
  "전망대·산",
  "한강·다리",
  "공원·정원",
  "도심·거리",
  "미술관·박물관",
  "복합공간·쇼핑",
] as const;

let cached: SpotEntry[] | null = null;

export function getSpots(): SpotEntry[] {
  if (cached) return cached;

  const raw = readFileSync(
    path.join(process.cwd(), "public", "data", "seoulSpots.json"),
    "utf8"
  );
  const spots = JSON.parse(raw) as SeoulSpot[];

  // 로마자 표기가 겹치는 곳이 생기면 뒤엣것에 id 를 붙여 URL 충돌을 막는다.
  const seen = new Set<string>();
  cached = spots.map((spot) => {
    const base = slugify(PLACE_NAME_EN[spot.name] ?? spot.name) || `spot-${spot.id}`;
    const slug = seen.has(base) ? `${base}-${spot.id}` : base;
    seen.add(slug);
    return { ...spot, slug };
  });

  return cached;
}

export function getSpotBySlug(slug: string): SpotEntry | undefined {
  return getSpots().find((s) => s.slug === slug);
}

/** 대분류 → 명소 목록. SPOT_CATEGORY_ORDER 순서를 지키고 미등록 분류는 뒤에 붙인다. */
export function getSpotsByCategory(): { category: string; spots: SpotEntry[] }[] {
  const spots = getSpots();
  const groups = new Map<string, SpotEntry[]>();
  for (const spot of spots) {
    const list = groups.get(spot.spotCategory) ?? [];
    list.push(spot);
    groups.set(spot.spotCategory, list);
  }

  const ordered = SPOT_CATEGORY_ORDER.filter((c) => groups.has(c)) as string[];
  const rest = [...groups.keys()].filter((c) => !ordered.includes(c)).sort();

  return [...ordered, ...rest].map((category) => ({
    category,
    spots: groups.get(category)!,
  }));
}

const EARTH_KM = 6371;

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** 상세 페이지 하단 "주변 명소" — 내부 링크를 늘려 크롤 깊이를 줄이는 용도. */
export function getNearbySpots(spot: SpotEntry, limit = 4): { spot: SpotEntry; km: number }[] {
  return getSpots()
    .filter((s) => s.id !== spot.id)
    .map((s) => ({ spot: s, km: distanceKm(spot, s) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}
