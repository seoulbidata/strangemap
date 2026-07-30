/**
 * 식사 슬롯이 낀 코스의 구간 이동 계산.
 *
 * 끼니마다 식당은 한 곳으로 확정되어 오지만(aiCourseFromAgent), 서버가 실어 준 travel_min 은
 * **장소→장소** 기준이다 — 시간표를 장소만으로 짜고 식사 슬롯을 시각 순으로 나중에 끼워 넣기 때문.
 * 그래서 화면에 보이는 순서 그대로 쓰면 식사 슬롯을 사이에 두고 라벨이 어긋난다.
 * 식사가 끼어 있는 구간만 프론트가 서버와 같은 모델로 다시 잰다.
 */
import { hasCoords, isMealStop, type CourseStop } from "@/data/themeCourses";
import { haversineKm } from "@/lib/courseRouting";

// ── 이동 추정 — lewisai app/core/scheduler.py travel() 과 같은 모델 ──────────
// 서버가 준 travel_min 과 단위·기준이 어긋나면 식사 구간에서만 값이 튀므로 그대로 옮겼다.
const ROUTE_FACTOR = 1.25;        // 직선거리 → 실제 도로거리 보정
const WALK_MIN_PER_KM = 13;       // 도보 약 4.6km/h
const MOVE_BUFFER_MIN = 5;        // 길찾기·신호 여유
const TRANSIT_THRESHOLD_KM = 2.0; // 보정 후 이 거리까지는 도보로 본다
const TRANSIT_MIN_PER_KM = 3;
const TRANSIT_OVERHEAD_MIN = 12;  // 역·정류장 접근과 대기

function estimateTravel(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): { min: number; mode: "walk" | "transit" } {
  const km = haversineKm(a.lat, a.lng, b.lat, b.lng) * ROUTE_FACTOR;
  if (km <= TRANSIT_THRESHOLD_KM) {
    return { min: Math.round(km * WALK_MIN_PER_KM) + MOVE_BUFFER_MIN, mode: "walk" };
  }
  return {
    min: Math.round(km * TRANSIT_MIN_PER_KM) + TRANSIT_OVERHEAD_MIN + MOVE_BUFFER_MIN,
    mode: "transit",
  };
}

/** 한 구간(직전 스톱 → 이 스톱)의 이동. `estimated`면 서버 값이 아니라 프론트가 좌표로 다시 잰 값. */
export interface CourseLeg {
  min: number;
  mode: "walk" | "transit";
  estimated: boolean;
}

/**
 * 렌더 순서 기준의 구간 이동표 — `legs[i]` = "직전 스톱에서 stops[i] 까지".
 *
 * 좌표 없는 슬롯(식당 못 찾은 식사)은 잴 수 없으므로 건너뛰고,
 * 그 다음 스톱은 그 이전 좌표 있는 스톱에서부터 잰다.
 */
export function courseLegs(stops: CourseStop[]): (CourseLeg | null)[] {
  const legs: (CourseLeg | null)[] = stops.map(() => null);
  let prevIdx = -1;
  stops.forEach((s, i) => {
    if (!hasCoords(s)) return;
    const prev = prevIdx >= 0 ? stops[prevIdx] : null;
    prevIdx = i;
    if (!prev || (s.day ?? 1) !== (prev.day ?? 1)) return;
    // 양 끝이 모두 일반 장소이고 서버 추정이 있으면 그대로 쓴다 (서버와 화면이 같은 숫자를 말하도록)
    if (!isMealStop(s) && !isMealStop(prev) && s.travelMin != null) {
      legs[i] = { min: s.travelMin, mode: s.travelMode ?? "walk", estimated: false };
      return;
    }
    const { min, mode } = estimateTravel(prev, s);
    legs[i] = { min, mode, estimated: true };
  });
  return legs;
}

/** 식사 후보 종류 배지 (색맹 대비로 색뿐 아니라 글자로도 구분). */
export const MEAL_KIND_LABEL: Record<string, string> = {
  restaurant: "식당",
  cafe: "카페",
  bar: "주점",
};
export const MEAL_KIND_LABEL_EN: Record<string, string> = {
  restaurant: "Restaurant",
  cafe: "Cafe",
  bar: "Bar",
};
