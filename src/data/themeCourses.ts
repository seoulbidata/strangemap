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

export interface CourseStop {
  name: string;
  lat: number;
  lng: number;
  preview: string;      // 사이드바 미리보기용: 짧고 객관적인 한 줄
  description: string;  // 지도 카드용: 현장 감성 묘사
  duration: string;
  tip?: string;
  adTag?: AdTag;        // 광고 매장만 부여(없으면 일반 성지 스톱)
}

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
}

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
