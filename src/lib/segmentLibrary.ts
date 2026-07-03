/**
 * 세그먼트 라이브러리 — 장소쌍 단위로 큐레이션한 폴리라인 재사용.
 *
 * 코스 사이드카(public/courses/routes/<id>.json)는 코스 id에 묶여 AI 코스(id가 매번 다름)에
 * 재사용할 수 없다. 대신 장소쌍 키로 저장한 public/courses/segments/<A>__<B>.json 을
 * 렌더 폴백 체인 2순위(사이드카 → 라이브러리 → /api/transit/walk → 직선)로 조회한다.
 * 파일 생성은 dev 전용 경로 에디터(/dev/route-editor)가 담당한다.
 */
import { SEOUL_PLACES } from "@/lib/seoulPlaces";
import { haversineKm } from "@/lib/courseRouting";
import type { CourseSegment, CourseStop, ThemeCourse } from "@/data/themeCourses";

export type LatLngPoint = { lat: number; lng: number };

/** 라이브러리 채택 조건: 저장된 끝점이 요청 스톱에서 이 거리 안이어야 한다 (동명이소 방어) */
const ENDPOINT_TOLERANCE_KM = 0.05;

/**
 * 장소 이름을 SEOUL_PLACES의 areaName으로 승격한다.
 * AI 코스는 displayName("서울숲"), 테마코스는 손으로 쓴 이름을 쓰므로
 * 같은 장소가 같은 키로 수렴하도록 areaName("서울숲공원")을 정본으로 삼는다.
 * 매치가 없으면(테마코스 전용 스톱) 원래 이름을 그대로 쓴다.
 */
function canonicalName(name: string): string {
  const place =
    SEOUL_PLACES.find((p) => p.displayName === name || p.areaName === name) ??
    SEOUL_PLACES.find((p) => name.includes(p.displayName) || p.displayName.includes(name));
  return place ? place.areaName : name;
}

/** 파일명 안전 문자열로 정규화 — NFC 고정(맥 NFD 유입 방지), 공백→하이픈, 위험 문자 제거 */
export function sanitizeName(name: string): string {
  return canonicalName(name)
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[/\\?%*:|"<>#]/g, "");
}

/**
 * 장소쌍 키. 사전순(코드포인트 순 — locale 미지정으로 결정성 보장) 정렬이므로
 * A→B와 B→A가 같은 키를 낸다. 저장 시 points는 항상 "키의 앞 이름 → 뒤 이름" 방향.
 */
export function segmentKey(nameA: string, nameB: string): string {
  const [first, second] = [sanitizeName(nameA), sanitizeName(nameB)].sort();
  return `${first}__${second}`;
}

/**
 * 세그먼트 라이브러리에서 a→b 폴리라인을 조회한다. (브라우저 전용)
 * 없거나(404) 끝점이 스톱과 안 맞으면 null — 호출부는 다음 폴백으로 넘어간다.
 * production에서도 도는 코드이므로 어떤 실패도 throw하지 않는다.
 */
export async function fetchLibrarySegment(
  a: { name: string; lat: number; lng: number },
  b: { name: string; lat: number; lng: number },
): Promise<LatLngPoint[] | null> {
  try {
    const key = segmentKey(a.name, b.name);
    const res = await fetch(`/courses/segments/${encodeURIComponent(key)}.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as CourseSegment;
    const pts = Array.isArray(data?.points) ? [...data.points] : [];
    if (pts.length < 2) return null;

    const head = pts[0];
    const tail = pts[pts.length - 1];
    const headToA = haversineKm(head.lat, head.lng, a.lat, a.lng);
    const headToB = haversineKm(head.lat, head.lng, b.lat, b.lng);
    const tailToA = haversineKm(tail.lat, tail.lng, a.lat, a.lng);
    const tailToB = haversineKm(tail.lat, tail.lng, b.lat, b.lng);

    // 한쪽 끝은 a, 반대쪽 끝은 b 근처여야 채택
    const forward = headToA <= ENDPOINT_TOLERANCE_KM && tailToB <= ENDPOINT_TOLERANCE_KM;
    const backward = headToB <= ENDPOINT_TOLERANCE_KM && tailToA <= ENDPOINT_TOLERANCE_KM;
    if (!forward && !backward) return null;
    if (backward) pts.reverse();

    // 저장 당시 좌표와 현재 스톱 좌표의 미세 오차를 스냅해 마커-선 이격 방지
    pts[0] = { lat: a.lat, lng: a.lng };
    pts[pts.length - 1] = { lat: b.lat, lng: b.lng };
    return pts;
  } catch {
    return null;
  }
}

// ── 사이드카 불변 규칙 검증 (에디터 UI·dev 저장 API 공용) ────────────────────

/** 스톱 좌표와 세그먼트 끝점 일치 판정 허용 오차 (약 1m) */
const SNAP_EPSILON = 1e-5;

function nearStop(p: LatLngPoint, stop: CourseStop): boolean {
  return Math.abs(p.lat - stop.lat) <= SNAP_EPSILON && Math.abs(p.lng - stop.lng) <= SNAP_EPSILON;
}

/**
 * 코스 사이드카 불변 규칙 검증. 위반 목록을 반환한다(빈 배열 = 통과).
 * 규칙: segments.length === stops.length - 1, 각 세그먼트 points ≥ 2 · 유한 좌표 ·
 * mode ∈ {walk, transit}, 첫/끝 점은 해당 스톱 좌표와 일치.
 */
export function validateSidecar(course: ThemeCourse, segments: CourseSegment[]): string[] {
  const errors: string[] = [];
  const expected = course.stops.length - 1;
  if (segments.length !== expected) {
    errors.push(`세그먼트 수 ${segments.length} ≠ 스톱-1 (${expected})`);
    return errors; // 개수가 어긋나면 이하 인덱스 검증은 무의미
  }
  segments.forEach((seg, i) => {
    const label = `구간 ${i + 1} (${course.stops[i].name}→${course.stops[i + 1].name})`;
    if (seg.mode !== "walk" && seg.mode !== "transit") {
      errors.push(`${label}: mode "${seg.mode}" 무효`);
    }
    if (!Array.isArray(seg.points) || seg.points.length < 2) {
      errors.push(`${label}: 점이 2개 미만`);
      return;
    }
    if (seg.points.some((p) => !Number.isFinite(p?.lat) || !Number.isFinite(p?.lng))) {
      errors.push(`${label}: 유한하지 않은 좌표 포함`);
      return;
    }
    if (!nearStop(seg.points[0], course.stops[i])) {
      errors.push(`${label}: 시작점이 스톱 좌표와 불일치`);
    }
    if (!nearStop(seg.points[seg.points.length - 1], course.stops[i + 1])) {
      errors.push(`${label}: 끝점이 스톱 좌표와 불일치`);
    }
  });
  return errors;
}
