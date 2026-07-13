/**
 * 고정값(enum) 라벨 매핑 — AI 번역을 거치지 않는 정적 사전.
 *
 * 원칙: `===` 비교·state·캐시 키·API body에 쓰이는 한글 문자열은 값으로 유지하고,
 * 렌더 시점에만 이 테이블로 영문 라벨을 얻는다. (라벨/값 분리)
 * 미등록 값은 한글 원문을 그대로 반환한다(기존 fallback 정책과 동일).
 */

export type Locale = "ko" | "en";

function toLabel(map: Record<string, string>, value: string, locale: Locale): string {
  return locale === "en" ? (map[value] ?? value) : value;
}

// ── 혼잡도 ─────────────────────────────────────────────────────────────────────
// 서브시스템별 어휘가 다르다(붐빔 계열: 서울 citydata / 혼잡 계열: 지하철·버스 /
// 필터 계열: AI 폼). 하나의 테이블이 전부 커버해 모든 호출부가 같은 헬퍼를 쓴다.
export const CONGESTION_EN: Record<string, string> = {
  "여유": "Low",
  "보통": "Moderate",
  "약간 붐빔": "Busy",
  "붐빔": "Crowded",
  "매우 붐빔": "Very Crowded",
  "약간 혼잡": "Busy",
  "혼잡": "Crowded",
  "매우 혼잡": "Very Crowded",
  "원활": "Smooth",
  "만차": "Full",
  "도보": "Walk",
  "알 수 없음": "Unknown",
  "정보없음": "No data",
  "정보 없음": "No data",
  "상관없음": "Any",
};

export function congestionLabel(value: string, locale: Locale): string {
  return toLabel(CONGESTION_EN, value, locale);
}

// ── 카테고리 ────────────────────────────────────────────────────────────────────
// 관광코스 카테고리 (themeCourses.ts CourseCategory + "전체")
export const COURSE_CATEGORY_EN: Record<string, string> = {
  "전체": "All",
  "역사": "History",
  "야경/자연": "Night & Nature",
  "서울배경 컨텐츠": "K-Content Spots",
  "Hot플레이스": "Hot Places",
  "문화": "Culture",
  "로컬": "Local",
  "운동": "Active",
};

// 서울 citydata 장소 카테고리 (seoulPlaces.ts Category + "전체")
export const PLACE_CATEGORY_EN: Record<string, string> = {
  "전체": "All",
  "공원·자연": "Parks & Nature",
  "한강": "Han River",
  "관광·역사": "History & Sights",
  "상권·역세권": "Shopping Districts",
  "야경·전망": "Night Views",
};

// 문화행사 카테고리 (cultureCategories.ts + "전체")
export const CULTURE_CATEGORY_EN: Record<string, string> = {
  "전체": "All",
  "공연": "Performance",
  "전시": "Exhibition",
  "교육/체험": "Workshops",
  "축제": "Festival",
  "음악": "Music",
};

// 야경명소 풍경 유형 (nightCategories.ts + "전체")
export const NIGHT_CATEGORY_EN: Record<string, string> = {
  "전체": "All",
  "한강·다리": "River & Bridges",
  "전망대·산": "Viewpoints & Peaks",
  "고궁·역사": "Palaces & History",
  "공원·정원": "Parks & Gardens",
  "도심·거리": "City Streets",
};

export function categoryLabel(value: string, locale: Locale): string {
  if (locale !== "en") return value;
  return (
    COURSE_CATEGORY_EN[value] ??
    PLACE_CATEGORY_EN[value] ??
    CULTURE_CATEGORY_EN[value] ??
    NIGHT_CATEGORY_EN[value] ??
    value
  );
}

// ── 코스 속성 ───────────────────────────────────────────────────────────────────
export const DIFFICULTY_EN: Record<string, string> = {
  "쉬움": "Easy",
  "보통": "Moderate",
  "어려움": "Hard",
};

export const ADTAG_EN: Record<string, string> = {
  "광고": "Ad",
  "유료광고": "Paid Ad",
  "제휴": "Partner",
};

export function difficultyLabel(value: string, locale: Locale): string {
  return toLabel(DIFFICULTY_EN, value, locale);
}

// ── 혼잡도 패널 정렬 ────────────────────────────────────────────────────────────
export const SORT_ORDER_EN: Record<string, string> = {
  "여유순": "Least crowded",
  "혼잡순": "Most crowded",
};

// ── AI 코스 생성 폼 칩 — 값은 한글로 /api/ai-recommend에 그대로 POST된다 ─────────
export const COMPANION_EN: Record<string, string> = {
  "혼자": "Solo",
  "친구": "Friends",
  "커플": "Couple",
  "가족": "Family",
};

export const AGE_EN: Record<string, string> = {
  "10-20대": "Teens–20s",
  "20-30대": "20s–30s",
  "30-40대": "30s–40s",
  "40-50대": "40s–50s",
  "60대 이상": "60+",
};

export const TIME_EN: Record<string, string> = {
  "오전": "Morning",
  "오후": "Afternoon",
  "밤": "Evening",
};

export const PURPOSE_EN: Record<string, string> = {
  "힐링": "Relaxation",
  "놀거리": "Fun",
  "데이트": "Date",
  "관광": "Sightseeing",
  "운동": "Active",
  "문화생활": "Culture",
};

export const REGION_EN: Record<string, string> = {
  "종로·중구": "Jongno·Jung-gu",
  "강북·성북": "Gangbuk·Seongbuk",
  "홍대·마포": "Hongdae·Mapo",
  "용산·이태원": "Yongsan·Itaewon",
  "여의도·영등포": "Yeouido·Yeongdeungpo",
  "강남·서초": "Gangnam·Seocho",
  "성수·건대": "Seongsu·Konkuk",
  "잠실·송파": "Jamsil·Songpa",
  "관악·사당": "Gwanak·Sadang",
  "상관없음": "Anywhere",
};

export const PLACE_COUNT_EN: Record<string, string> = {
  "3곳": "3 places",
  "4곳": "4 places",
  "5곳": "5 places",
};

/** AI 폼 칩 전체 라벨 조회 — 값 → 영문 표시 라벨 */
export function chipLabel(value: string, locale: Locale): string {
  if (locale !== "en") return value;
  return (
    COMPANION_EN[value] ??
    AGE_EN[value] ??
    TIME_EN[value] ??
    PURPOSE_EN[value] ??
    REGION_EN[value] ??
    PLACE_COUNT_EN[value] ??
    CONGESTION_EN[value] ??
    value
  );
}

// ── 길찾기 경로 옵션 라벨 (decorateAlternatives가 넣는 한글 값과 === 비교됨) ──────
export const ROUTE_ALT_LABEL_EN: Record<string, string> = {
  "서울로의 추천경로 안내": "Seoulro's pick",
  "가장 빠른길 안내": "Fastest route",
  "가장 원활한 경로 안내": "Least crowded route",
};

// ── 길찾기 단계 아이콘 배지 (StepItem이 `icon === "지하철"` 비교에 사용) ─────────
export const STEP_ICON_EN: Record<string, string> = {
  "출발": "Start",
  "도착": "Arrive",
  "도보": "Walk",
  "지하철": "Subway",
  "버스": "Bus",
};

export function stepIconLabel(value: string, locale: Locale): string {
  return toLabel(STEP_ICON_EN, value, locale);
}

// ── 대중교통 수단 요약 ─────────────────────────────────────────────────────────
export const TRANSIT_MODE_EN: Record<string, string> = {
  "버스+지하철": "Bus + Subway",
  "지하철": "Subway",
  "버스": "Bus",
  "대중교통": "Transit",
};
