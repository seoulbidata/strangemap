// 정적 폴리라인 위에 "흐르는 빛 입자(comet)" 레이어를 얹어 경로의 방향성과
// 이동 의도를 즉시 읽히게 만드는 Map Route Animation 유틸리티.
//
// 네이버 지도 Polyline은 dashOffset 애니메이션 API가 없어 marching-ants를
// 구현하려면 매 프레임 폴리라인을 재생성해야 한다. 대신 경로 위를 일정 간격으로
// 흐르는 발광 마커를 requestAnimationFrame으로 이동시키는 방식을 쓴다.
// 마커는 한 번만 생성하고 매 프레임 setPosition만 호출하므로 가볍다.

export interface FlowPoint {
  lat: number;
  lng: number;
}

// MapView의 NaverApi와 구조적으로 호환되는 최소 인터페이스
export interface FlowNaverApi {
  maps: {
    LatLng: new (lat: number, lng: number) => object;
    Point: new (x: number, y: number) => object;
    Marker: new (options: Record<string, unknown>) => {
      setPosition: (position: object) => void;
      setMap: (map: object | null) => void;
    };
  };
}

export interface RouteFlowOptions {
  /** 입자/글로우 색상 (#hex) */
  color: string;
  /** 입자 지름(px) — 기본 9 */
  size?: number;
  /** 마커 zIndex — 폴리라인 위, 라벨 아래로 둘 것 */
  zIndex?: number;
  /** 입자 간 간격(m). 작을수록 촘촘한 흐름 — 기본 260 */
  spacingMeters?: number;
  minParticles?: number;
  maxParticles?: number;
  /** 흐름 속도(m/s). 클수록 빨리 흐름 — 기본 480 */
  speedMetersPerSec?: number;
  minLoopMs?: number;
  maxLoopMs?: number;
  /** 전체 불투명도 (도보 등 보조 경로는 낮게) — 기본 1 */
  opacity?: number;
  /**
   * 좌표 인덱스별 색상. 코스처럼 구간마다 색이 바뀌는 경로에서
   * 화살표가 지나는 구간의 색을 따라가게 한다. 없으면 color 고정.
   */
  colorAt?: (pointIndex: number) => string;
}

// ── 공유 ticker: 애니메이터가 늘어도 rAF 루프는 하나만 돈다 ──────────────
type Tick = (now: number) => void;
const tickers = new Set<Tick>();
let rafId: number | null = null;

function pump(now: number) {
  tickers.forEach((t) => t(now));
  rafId = tickers.size > 0 ? requestAnimationFrame(pump) : null;
}
function addTicker(t: Tick) {
  tickers.add(t);
  if (rafId === null && typeof requestAnimationFrame === "function") {
    rafId = requestAnimationFrame(pump);
  }
}
function removeTicker(t: Tick) {
  tickers.delete(t);
  if (tickers.size === 0 && rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// ── 기하 유틸 ────────────────────────────────────────────────────────────
function haversine(a: FlowPoint, b: FlowPoint): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// 북(0°) 기준 시계방향 진행 방위각 — 화살표 회전에 사용
function bearing(a: FlowPoint, b: FlowPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 경로 좌표열 위에 흐르는 빛 입자 레이어를 띄운다.
 * start()는 생성 시 자동 호출되며, 정리할 땐 destroy()만 부르면 된다.
 */
export class RouteFlowAnimator {
  private naver: FlowNaverApi;
  private map: object;
  private points: FlowPoint[];
  private cum: number[] = []; // 누적 거리(m)
  private total = 0;
  private markers: { setPosition: (p: object) => void; setMap: (m: object | null) => void }[] = [];
  private els: HTMLElement[] = []; // 입자별 회전용 DOM 노드
  private strokes: SVGPathElement[] = []; // 입자별 색상 path (구간 색 추종용)
  private colors: string[] | null = null; // 좌표별 색 (colorAt이 있을 때만)
  private lastColor: string[] = []; // 입자별 마지막 적용 색 — 불필요한 DOM 쓰기 방지
  private hints: number[] = []; // 입자별 마지막 세그먼트 인덱스(단조 전진 탐색용)
  private lastFrac: number[] = [];
  private count = 0;
  private loopMs = 3000;
  private startedAt = 0;
  private tick: Tick;
  private destroyed = false;

  constructor(
    naver: FlowNaverApi,
    map: object,
    points: FlowPoint[],
    options: RouteFlowOptions,
  ) {
    this.naver = naver;
    this.map = map;
    // 연속 중복 좌표 제거 (colorAt에 넘길 원본 인덱스는 따로 보존)
    const srcIdx: number[] = [];
    this.points = points.filter((p, i) => {
      const keep = i === 0 || p.lat !== points[i - 1].lat || p.lng !== points[i - 1].lng;
      if (keep) srcIdx.push(i);
      return keep;
    });
    this.tick = (now) => this.frame(now);

    // 누적 거리 계산
    this.cum = [0];
    for (let i = 1; i < this.points.length; i++) {
      this.total += haversine(this.points[i - 1], this.points[i]);
      this.cum.push(this.total);
    }

    // 흐를 경로가 없거나 모션 최소화 설정이면 아무것도 하지 않는다
    if (this.points.length < 2 || this.total < 1 || prefersReducedMotion()) {
      this.destroyed = true;
      return;
    }

    const {
      color,
      size = 7,
      zIndex = 95,
      spacingMeters = 1000,
      minParticles = 1,
      maxParticles = 5,
      speedMetersPerSec = 45,
      minLoopMs = 3200,
      maxLoopMs = 11000,
      opacity = 1,
      colorAt,
    } = options;

    if (colorAt) this.colors = this.points.map((_, i) => colorAt(srcIdx[i]));

    this.count = clamp(Math.round(this.total / spacingMeters), minParticles, maxParticles);
    this.loopMs = clamp((this.total / speedMetersPerSec) * 1000, minLoopMs, maxLoopMs);

    // 진행 방향을 가리키는 셰브론 화살표 — 위(북, 0°)를 향하도록 그리고
    // 매 프레임 방위각만큼 회전시킨다. 흰 외곽선으로 지도 위에서 또렷하게.
    const box = Math.round(size * 2.6);
    const arrowSvg = `<svg width="${box}" height="${box}" viewBox="0 0 24 24" fill="none" style="display:block;">
      <path d="M5 15 L12 8 L19 15" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5 15 L12 8 L19 15" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    const { Marker, LatLng, Point } = this.naver.maps;
    const anchor = new Point(box / 2, box / 2);

    for (let k = 0; k < this.count; k++) {
      // 바깥 wrapper는 naver가 위치 지정에 쓸 수 있으므로, 회전은 안쪽 자식에만 건다
      const wrap = document.createElement("div");
      wrap.style.cssText = `width:${box}px;height:${box}px;pointer-events:none;`;
      const inner = document.createElement("div");
      inner.style.cssText = `width:${box}px;height:${box}px;transform-origin:50% 50%;will-change:transform;opacity:${opacity};`;
      inner.innerHTML = arrowSvg;
      wrap.appendChild(inner);

      const marker = new Marker({
        position: new LatLng(this.points[0].lat, this.points[0].lng),
        map: this.map,
        zIndex,
        clickable: false,
        icon: { content: wrap, anchor },
      });
      this.markers.push(marker);
      this.els.push(inner);
      // 색상 path는 흰 외곽선 뒤에 오는 두 번째 path
      this.strokes.push(inner.querySelectorAll("path")[1] as unknown as SVGPathElement);
      this.lastColor.push(color);
      this.hints.push(0);
      this.lastFrac.push(k / this.count);
    }

    this.startedAt = performance.now();
    addTicker(this.tick);
  }

  // 누적거리 d(m) 지점의 좌표를 단조 전진 탐색으로 보간
  private positionAt(d: number, idx: number): FlowPoint {
    let i = this.hints[idx];
    if (d < this.cum[i]) i = 0; // 한 바퀴 돌아 처음으로 감기면 리셋
    while (i < this.cum.length - 2 && this.cum[i + 1] < d) i++;
    this.hints[idx] = i;
    const segLen = this.cum[i + 1] - this.cum[i];
    const t = segLen > 0 ? (d - this.cum[i]) / segLen : 0;
    const a = this.points[i];
    const b = this.points[i + 1];
    return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  }

  private frame(now: number) {
    if (this.destroyed) return;
    const base = ((now - this.startedAt) % this.loopMs) / this.loopMs;
    const { LatLng } = this.naver.maps;
    for (let k = 0; k < this.count; k++) {
      const frac = (base + k / this.count) % 1;
      this.lastFrac[k] = frac;
      const pos = this.positionAt(frac * this.total, k);
      this.markers[k].setPosition(new LatLng(pos.lat, pos.lng));
      // positionAt이 갱신한 세그먼트 기준 진행 방위각으로 화살표 회전
      const i = this.hints[k];
      const deg = bearing(this.points[i], this.points[i + 1]);
      this.els[k].style.transform = `rotate(${deg}deg)`;
      // 구간마다 색이 바뀌는 경로면 현재 지나는 구간 색을 따라간다
      if (this.colors) {
        const c = this.colors[i];
        if (c && c !== this.lastColor[k]) {
          this.lastColor[k] = c;
          this.strokes[k]?.setAttribute("stroke", c);
        }
      }
    }
  }

  destroy() {
    if (this.destroyed && this.markers.length === 0) {
      removeTicker(this.tick);
      return;
    }
    this.destroyed = true;
    removeTicker(this.tick);
    this.markers.forEach((m) => m.setMap(null));
    this.markers = [];
    this.els = [];
    this.strokes = [];
  }
}
