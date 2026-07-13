import type { ThemeCourse } from "@/data/themeCourses";

/**
 * 첫 진입 시 지도에 뿌리는 "코스 시작점" 오버레이 마커의 HTML 생성 + 근접 그룹핑.
 * 스타일 클래스(.crs-start*)는 globals.css에 정의 — :hover/keyframes는 인라인 불가.
 */

/** 히어로 원본(최대 3MB급) 대신 Next 이미지 옵티마이저의 96px 리사이즈본을 쓴다 (q=75: Next 16 기본 허용값) */
export function startMarkerThumb(courseId: string): string {
  return `/_next/image?url=${encodeURIComponent(`/courses/heroes/${courseId}.jpg`)}&w=96&q=75`;
}

/** 링(48px) + 꼬리(9px, -2px 겹침) 기준 좌표 앵커. tiny 모드는 16px dot 중심 */
export function startMarkerAnchor(tiny: boolean): { x: number; y: number } {
  return tiny ? { x: 8, y: 8 } : { x: 24, y: 55 };
}

export interface StartMarkerOpts {
  dimmed: boolean;
  tiny: boolean;
}

export function buildStartMarkerHTML(course: ThemeCourse, label: string, opts: StartMarkerOpts): string {
  if (opts.tiny) {
    return `<div class="crs-start is-tiny${opts.dimmed ? " is-dimmed" : ""}" style="--c:${course.color}"></div>`;
  }
  // 이미지 404여도 뒤의 테마 그라데이션이 남는 이중 background (courseHeroBackground와 동일한 폴백 철학)
  const bg = `url('${startMarkerThumb(course.id)}'), linear-gradient(150deg, ${course.color}, ${course.color}CC)`;
  return `
    <div class="crs-start${opts.dimmed ? " is-dimmed" : ""}" style="--c:${course.color}">
      <div class="crs-start-label">${escapeHtml(label)}</div>
      <div class="crs-start-ring"><div class="crs-start-img" style="background-image:${bg}"></div></div>
      <div class="crs-start-tail"></div>
    </div>`;
}

export function buildClusterMarkerHTML(count: number, label: string, opts: StartMarkerOpts): string {
  if (opts.tiny) {
    return `<div class="crs-start is-tiny${opts.dimmed ? " is-dimmed" : ""}" style="--c:#16243C"></div>`;
  }
  return `
    <div class="crs-start${opts.dimmed ? " is-dimmed" : ""}" style="--c:#16243C">
      <div class="crs-start-label">${escapeHtml(label)}</div>
      <div class="crs-start-ring"><div class="crs-start-count">${count}</div></div>
      <div class="crs-start-tail"></div>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface StartCluster {
  center: { lat: number; lng: number };
  courses: ThemeCourse[];
}

export interface StartPointGroups {
  singles: ThemeCourse[];
  clusters: StartCluster[];
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 시작점(stops[0])이 thresholdM 이내로 이어지는 코스들을 하나의 클러스터로 묶는다.
 * 18개 고정 데이터라 단순 그리디 체이닝이면 충분 (광화문 일대 5개, 성수 일대 2개가 대상).
 */
export function groupStartPoints(courses: ThemeCourse[], thresholdM = 800): StartPointGroups {
  const withStart = courses.filter((c) => c.stops.length > 0);
  const groups: ThemeCourse[][] = [];

  for (const course of withStart) {
    const s = course.stops[0];
    const near = groups.find((g) =>
      g.some((m) => haversineM(s.lat, s.lng, m.stops[0].lat, m.stops[0].lng) <= thresholdM)
    );
    if (near) near.push(course);
    else groups.push([course]);
  }

  const singles: ThemeCourse[] = [];
  const clusters: StartCluster[] = [];
  for (const g of groups) {
    if (g.length === 1) {
      singles.push(g[0]);
    } else {
      clusters.push({
        center: {
          lat: g.reduce((sum, c) => sum + c.stops[0].lat, 0) / g.length,
          lng: g.reduce((sum, c) => sum + c.stops[0].lng, 0) / g.length,
        },
        courses: g,
      });
    }
  }
  return { singles, clusters };
}
