export type CourseCategory = "역사" | "야경/자연" | "서울배경 컨텐츠" | "Hot플레이스" | "문화" | "로컬" | "운동";

/**
 * 광고 효과 태그 (수익화: 코스 동선 내 소상공인 매장 간접 광고)
 * 공정위 「추천·보증 표시·광고 심사지침」상 경제적 대가를 받은 콘텐츠는
 * 소비자가 명확히 인식할 수 있게 표시해야 하므로, 이 태그는 카드 UI에
 * 배지로 노출되는 것을 전제로 한다(숨김 데이터 아님).
 */
export interface AdTag {
  type: "광고" | "유료광고" | "제휴";  // 공정위 표시 문구 기준
  label: string;        // 카드 배지 노출 텍스트 (예: "광고")
  advertiser: string;   // 광고주(소상공인 매장)명
  disclosure: string;   // 법적 고지 문구 (툴팁/상세 노출)
  placeId?: string;     // 추후 매장 상세·정산 연동용 식별자
}

/**
 * 스톱의 슬롯 종류 (lewisai `slot_type`).
 *  - place: 일반 방문 장소
 *  - meal : 식사 슬롯. 배열 순서상 장소 사이에 끼어 있고, mealOptions 중 하나를 사용자가 고른다
 *  - flex : 시간표에 못 앉힌 자유 방문 제안 — startTime/endTime 이 없다
 */
export type CourseSlotType = "place" | "meal" | "flex";

/** 식사 슬롯에 배정된 식당 (lewisai `meal_options[]` = Visit Seoul 실데이터 중 한 곳). */
export interface MealPlace {
  title: string;
  summary?: string;
  address?: string;
  lat?: number;
  lng?: number;
  distKm?: number;       // 앵커 장소로부터의 직선거리
  useTime?: string;      // 영업시간 원문 (예: "11:30~21:00")
  kind: string;          // restaurant | cafe | bar
}

export interface CourseStop {
  name: string;
  /** 좌표. 식사 슬롯은 반경 안에 식당이 하나도 없으면 값이 없다 → hasCoords()로 항상 확인할 것 */
  lat: number;
  lng: number;
  preview: string;      // 사이드바 미리보기용: 짧고 객관적인 한 줄
  description: string;  // 지도 카드용: 현장 감성 묘사
  duration: string;
  tip?: string;
  adTag?: AdTag;        // 광고 매장만 부여(없으면 일반 성지 스톱)
  // ── 나만의 코스(AI) 확장 — optional, 정적 테마코스엔 없음 (lewisai 응답에서 채워짐) ──
  reason?: string;      // 왜 이 장소를 골랐는지 (AI 선정 이유)
  activities?: string[];// 여기서 할 수 있는 일
  day?: number;         // 멀티데이 코스의 N일차 (하루 코스는 undefined)
  // 방문 시각(startTime)의 예상 혼잡도(예보) — 서울시 FCST_PPLTN 기준. lewisai가 계산해 실어줌.
  // 미래 코스라 "실시간"이 아닌 "예보"가 맞는 값이며, 프론트에서 재조회하지 않고 이걸 그대로 표시한다.
  congestion?: string;  // "여유" | "보통" | "약간 붐빔" | "붐빔"
  // 시간표 코스(lewisai schedule 노드)의 방문 슬롯 "HH:MM" — 상세 패널 타임라인 + 총 소요시간 계산용.
  // 시간 범위 없이 만든 코스에는 둘 다 없다.
  startTime?: string;   // 방문 시작 시각 (예상 혼잡도 라벨의 시각 표기도 겸함)
  endTime?: string;     // 방문 종료 시각
  // 이 장소 주변의 실데이터 맛집 (lewisai nearby.restaurants) — 스톱 카드에 표시
  nearbyRestaurants?: { title: string; distKm?: number; address?: string }[];
  // ── 슬롯 계약 (lewisai 시간표 코스) ──
  slotType?: CourseSlotType;  // 없으면 "place" (정적 테마코스)
  /** 체류 시간(분). duration 은 "1시간 30분" 같은 표시 문자열이라 계산에는 이 값을 쓴다 */
  durationMin?: number;
  /** 직전 스톱에서 이 스톱까지의 이동 추정 (직선거리 기반). 첫 스톱·식사 슬롯은 없다 */
  travelMin?: number;
  travelMode?: "walk" | "transit";
  // ── 식사 슬롯 한정 ──
  /** 이 끼니에 배정된 식당 한 곳. 반경 안에 식당이 없으면 없다(= 좌표도 없는 슬롯). */
  mealPlace?: MealPlace;
}

export const stopSlotType = (s: CourseStop): CourseSlotType => s.slotType ?? "place";
export const isMealStop = (s: CourseStop): boolean => stopSlotType(s) === "meal";
/** 지도에 찍고 경로에 넣을 수 있는 스톱인가 — 식당을 못 찾은 식사 슬롯은 좌표가 없다. */
export const hasCoords = (s: { lat: number; lng: number }): boolean =>
  Number.isFinite(s.lat) && Number.isFinite(s.lng);
/** "N곳" 표기용 — 식사 슬롯은 장소 수에 넣지 않는다. */
export const placeStopCount = (c: ThemeCourse): number => c.stops.filter((s) => !isMealStop(s)).length;

/**
 * 식사 슬롯 색 — 장소(테마색/일차색)와 대비되는 앰버.
 * 색맹 대비로 **색만으로 구분하지 않는다**: 마커 모양(둥근 사각 vs 원)과 포크·나이프 아이콘이 함께 달라진다.
 * 일차 색(DAY_COLORS)의 주황(#EA580C)과 겹치지 않게 한 단계 더 노란 쪽으로 잡았다.
 */
export const MEAL_COLOR = "#D97706";
export const MEAL_COLOR_DEEP = "#B45309";
export const MEAL_TINT = "#FEF6E7";

/**
 * 인접 스톱 사이 한 구간의 사전 계산된 폴리라인.
 * 빌드 타임에 OSRM으로 도로 스냅 경로를 구워 public/courses/routes/<id>.json 에 저장하고,
 * 런타임에는 라우팅 호출 없이 이 좌표만 그린다. (scripts/precompute-routes.mts)
 */
export interface CourseSegment {
  mode: "walk" | "transit";               // 직선거리 기준(≤1.5km 도보), 스타일 구분용
  points: { lat: number; lng: number }[]; // 도로 스냅된 폴리라인 좌표열
}

export interface ThemeCourse {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  totalDuration: string;
  distance: string;
  difficulty: "쉬움" | "보통" | "어려움";
  tags: string[];
  color: string;
  category: CourseCategory;
  /** 히어로 이미지 경로 (없으면 카테고리 기본 이미지 → 테마 그라데이션 순으로 폴백) */
  image?: string;
  mediaTitle?: string;
  estimatedCost: string;
  bestTime: string;
  stops: CourseStop[];
  // ── 나만의 코스(AI) 확장 — optional ──
  days?: number;                          // 여행 일수 (멀티데이). 1 또는 undefined = 하루
  dayAreas?: Record<number, string>;      // 일차 → 권역 (여행자 멀티데이 권역 분산)
  dayDescriptions?: Record<number, string>; // 일차 → 그 일차 설명. 멀티데이는 전체 description 을
                                          // 짧게 두고 일차 탭에 맞춰 이 설명을 보여준다
  overlayPois?: CourseOverlayPoi[];       // 경로 밖 오버레이(식당 등) — 폴리라인에 안 들어감
  createdAt?: number;                     // 만든 시각 (epoch ms) — "내가 만든 코스" 목록 표시용
  myChoices?: CourseChoice[];             // 위저드에서 고른 조건 (확인 단계 요약과 동일) — 아코디언에 표시
}

/** 위저드에서 고른 조건 한 줄 (예: 함께 / 친구와 · 연인과) */
export interface CourseChoice {
  label: string;
  value: string;
}

/** 코스 경로에 포함되진 않지만 지도에 함께 보여줄 주변 지점 (AI 코스의 주변 식당 등) */
export interface CourseOverlayPoi {
  name: string;
  lat: number;
  lng: number;
  kind: string;   // restaurant | cafe | bar | event 등
  day?: number;   // 멀티데이 코스에서 이 지점이 속한 일차 (일차 선택 시 필터용)
}

/** 멀티데이 코스의 일차별 폴리라인·마커 색 (1일차부터 순환). */
export const DAY_COLORS = ["#2563EB", "#EA580C", "#16A34A", "#7C3AED", "#DB2777", "#0891B2"] as const;
export const dayColor = (day: number): string => DAY_COLORS[(Math.max(1, day) - 1) % DAY_COLORS.length];

export const CATEGORY_META: Record<CourseCategory | "전체", { label: string; color: string; bg: string; border: string }> = {
  "전체":           { label: "전체",           color: "#374151", bg: "#F3F4F6", border: "#D1D5DB" },
  "역사":           { label: "역사",           color: "#92400E", bg: "#FEF3C7", border: "#FDE68A" },
  "야경/자연":      { label: "야경/자연",      color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
  "서울배경 컨텐츠":{ label: "서울배경 컨텐츠", color: "#6D28D9", bg: "#F5F3FF", border: "#DDD6FE" },
  "Hot플레이스":    { label: "Hot플레이스",    color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  "문화":           { label: "문화",           color: "#0F766E", bg: "#F0FDFA", border: "#99F6E4" },
  "로컬":           { label: "로컬",           color: "#BE185D", bg: "#FDF2F8", border: "#FBCFE8" },
  "운동":           { label: "운동",           color: "#15803D", bg: "#F0FDF4", border: "#BBF7D0" },
};

// 코스 데이터 본체 — /dev/route-editor 에디터가 저장 시 재직렬화하는 생성 파일로 분리됨.
// (.ts 확장자 import는 tsconfig allowImportingTsExtensions + node --experimental-strip-types 겸용)
import { THEME_COURSES_DATA } from "./themeCoursesData.ts";

export const THEME_COURSES: ThemeCourse[] = THEME_COURSES_DATA;
