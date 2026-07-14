// 서울명소 유형 분류 — 데이터(seoulSpots.json)의 spotCategory 값과 일치해야 함
export const SPOT_CATEGORIES = [
  "한강·다리",
  "전망대·산",
  "고궁·역사",
  "공원·정원",
  "도심·거리",
  "미술관·박물관",
  "복합공간·쇼핑",
] as const;

export type SpotCategory = (typeof SPOT_CATEGORIES)[number];

/**
 * 명소를 즐기기 좋은 시간대 — seoulSpots.json의 bestTime 값.
 * 검색 정렬 가중치·카드 스타일·AI 프롬프트가 모두 이 축 하나만 본다.
 * night: 야경형 / day: 주간형(밤에 닫거나 낮이 본체) / any: 낮밤 모두
 */
export const BEST_TIMES = ["night", "day", "any"] as const;
export type BestTime = (typeof BEST_TIMES)[number];
