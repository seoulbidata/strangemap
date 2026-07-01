// 야경명소 풍경 유형 분류 — 데이터(nightview.json)의 nightCategory 값과 일치해야 함
export const NIGHT_CATEGORIES = [
  "한강·다리",
  "전망대·산",
  "고궁·역사",
  "공원·정원",
  "도심·거리",
] as const;

export type NightCategory = (typeof NIGHT_CATEGORIES)[number];
