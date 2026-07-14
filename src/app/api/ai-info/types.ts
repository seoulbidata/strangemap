import type { AIEvent } from "@/types/quest";

/**
 * ai-info 프롬프트 킷(ko/en) 공용 타입.
 * route.ts ↔ prompts.*.ts 간 순환 import를 피하기 위해 별도 파일로 분리.
 */

/** citydata_ppltn FCST_PPLTN 한 슬롯 (앞 3~4개만 사용 — 토큰 예산) */
export interface ForecastSlot {
  /** FCST_TIME 원문 ("YYYY-MM-DD HH:MM") */
  time: string;
  /** FCST_CONGEST_LVL (여유/보통/약간 붐빔/붐빔/매우 붐빔) */
  level: string;
}

/** citydata WEATHER_STTS에서 추린 최소 날씨 정보 */
export interface AreaWeather {
  temp?: string; // 기온(℃)
  sky?: string; // 하늘 상태 (맑음/구름많음 등)
  pcpMsg?: string; // 강수 관련 메시지
  pm10Level?: string; // 미세먼지 지수 단계 (좋음/보통/나쁨)
}

/** 실시간 혼잡 + 예보 + 날씨 — 기존 "레벨: 메시지" 문자열을 구조화 */
export interface AreaStatus {
  level: string; // AREA_CONGEST_LVL
  msg: string; // AREA_CONGEST_MSG
  forecast: ForecastSlot[];
  weather?: AreaWeather;
}

/** 테마코스 경유지 큐레이션 컨텍스트 (POIItem.courseCtx에서 전달) */
export interface CourseContext {
  title?: string;
  description?: string;
  tip?: string;
  bestTime?: string;
  duration?: string;
}

/** buildPrompt에 넘기는 전체 컨텍스트 — ko/en 킷 동일 시그니처 */
export interface PromptContext {
  place: string;
  type?: string;
  operating_time?: string;
  fee?: string;
  subway?: string;
  addr?: string;
  bus?: string;
  tel?: string;
  parking?: string;
  category?: string;
  /** 서울명소를 즐기기 좋은 시간대 ("night" | "day" | "any") — source === "spot"일 때만 */
  bestTime?: string;
  /** 문화행사 기간 ("date ~ endDate") — type === "culture"일 때만 */
  eventPeriod?: string;
  viewpoints: string[];
  status: AreaStatus | null;
  realEvents: AIEvent[];
  /** SEOUL_PLACES 매칭 시 큐레이션된 설명·분류 */
  curated?: { description: string; category: string };
  course?: CourseContext;
}
