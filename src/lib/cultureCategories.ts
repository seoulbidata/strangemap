export const CULTURE_CATEGORIES = ["공연", "전시", "교육/체험", "축제", "음악"] as const;
export type CultureCategory = (typeof CULTURE_CATEGORIES)[number];

export const CODENAME_MAP: Record<string, CultureCategory> = {
  // 공연
  연극: "공연",
  "뮤지컬/오페라": "공연",
  무용: "공연",
  "공연/행사": "공연",
  "서커스/마술": "공연",
  // 전시
  "전시/미술": "전시",
  영화: "전시",
  // 교육/체험
  "교육/체험": "교육/체험",
  기타: "교육/체험",
  // 축제
  "축제-문화/예술": "축제",
  "축제-기타": "축제",
  "축제-전통/역사": "축제",
  "축제-관광/체육": "축제",
  "축제-자연/경관": "축제",
  // 음악
  클래식: "음악",
  콘서트: "음악",
  국악: "음악",
  "독주/독창회": "음악",
};

export function normalizeCategory(codename: string): CultureCategory {
  return CODENAME_MAP[codename] ?? "교육/체험";
}

export const CATEGORY_MARKER: Record<CultureCategory, string> = {
  공연: "/markers/marker-performance.png",
  전시: "/markers/marker-exhibition.png",
  "교육/체험": "/markers/marker-experience.png",
  축제: "/markers/marker-festival.png",
  음악: "/markers/marker-music.png",
};

export const CATEGORY_COLOR: Record<CultureCategory, { bg: string; text: string; active: string }> = {
  공연: { bg: "#F5F3FF", text: "#7C3AED", active: "#7C3AED" },
  전시: { bg: "#EFF6FF", text: "#2563EB", active: "#2563EB" },
  "교육/체험": { bg: "#F0FDF4", text: "#16A34A", active: "#16A34A" },
  축제: { bg: "#FFF7ED", text: "#EA580C", active: "#EA580C" },
  음악: { bg: "#FDF2F8", text: "#DB2777", active: "#DB2777" },
};