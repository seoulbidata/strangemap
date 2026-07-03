"use client";

/**
 * 큐레이션 코스·경로 에디터 (dev 전용 — production 빌드에서는 404)
 *
 * 두 편집 모드:
 *  - 경로 편집: 세그먼트 폴리라인 정점 편집 (선/지도 클릭=추가, 핸들 드래그=이동, 우클릭=삭제)
 *  - 스톱 편집: 스톱 마커 드래그=이동, 지도 클릭=끝에 추가, 마커 우클릭=삭제, 필드 폼으로 이름 등 수정
 * 신규 코스 생성 지원 — 필수 메타데이터 폼 작성 + 지도에서 스톱 찍고 경로 그리기.
 *
 * 저장: POST /api/dev/course 한 번으로
 *  - src/data/themeCoursesData.ts 에 코스 upsert (메인 앱은 새로고침 후 반영)
 *  - public/courses/routes/<id>.json 사이드카에 source:"curated" (precompute가 안 덮어씀)
 *
 * 스타일 주의: 전부 인라인 스타일 사용.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Script from "next/script";
import {
  THEME_COURSES,
  type CourseSegment,
  type CourseStop,
  type ThemeCourse,
} from "@/data/themeCourses";
import { segmentKey, validateSidecar } from "@/lib/segmentLibrary";
import { haversineKm } from "@/lib/courseRouting";
import {
  CATEGORIES,
  COURSE_ID_RE,
  DIFFICULTIES,
  validateCourseMeta,
} from "@/app/api/dev/courseValidation";

// ── Naver Maps 최소 타입 (에디터에서 쓰는 표면만) ────────────────────────────
type NLatLng = { lat: () => number; lng: () => number };
type NMap = {
  fitBounds: (bounds: unknown, opts?: unknown) => void;
  setCursor?: (cursor: string) => void;
};
type NMarker = {
  setMap: (map: NMap | null) => void;
  getPosition: () => NLatLng;
};
type NPolyline = {
  setMap: (map: NMap | null) => void;
  setPath: (path: NLatLng[]) => void;
  setStyles: (style: Record<string, unknown>) => void;
};
type NaverMapsApi = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => NMap;
  LatLng: new (lat: number, lng: number) => NLatLng;
  LatLngBounds: new (sw: NLatLng, ne: NLatLng) => { extend: (p: NLatLng) => void };
  Point: new (x: number, y: number) => unknown;
  Marker: new (opts: Record<string, unknown>) => NMarker;
  Polyline: new (opts: Record<string, unknown>) => NPolyline;
  Event: {
    addListener: (
      target: unknown,
      type: string,
      handler: (e: { coord?: NLatLng }) => void,
    ) => void;
  };
};
// MapView가 전역 Window.naver 타입을 이미 선언하고 있어(형태가 다름) 여기선 캐스팅으로 접근
const getNaver = () => (window as unknown as { naver: { maps: NaverMapsApi } }).naver.maps;

type Pt = { lat: number; lng: number };
type DraftSeg = { mode: "walk" | "transit"; points: Pt[] };
type EditMode = "route" | "stops";

const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };
const MODE_COLOR: Record<DraftSeg["mode"], string> = { walk: "#16a34a", transit: "#2563eb" };

const NEW_COURSE_DEFAULTS: Omit<ThemeCourse, "id"> = {
  title: "",
  subtitle: "",
  description: "",
  totalDuration: "",
  distance: "",
  difficulty: "쉬움",
  tags: [],
  color: "#2563eb",
  category: "문화",
  estimatedCost: "",
  bestTime: "",
  stops: [],
};

/** 두 스톱 사이 25점 직선 보간 (precompute의 직선 폴백과 동일 밀도) */
function straightPoints(a: Pt, b: Pt): Pt[] {
  const N = 24;
  return Array.from({ length: N + 1 }, (_, k) => ({
    lat: a.lat + (b.lat - a.lat) * (k / N),
    lng: a.lng + (b.lng - a.lng) * (k / N),
  }));
}

/** 폴리라인 총 길이(km) */
function polylineKm(points: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    sum += haversineKm(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }
  return sum;
}

/** 직선 폴백으로 보이는 세그먼트 판정 (경로 길이 ≈ 직선 거리) */
function looksStraight(points: Pt[]): boolean {
  if (points.length < 2) return true;
  const a = points[0];
  const b = points[points.length - 1];
  const straight = haversineKm(a.lat, a.lng, b.lat, b.lng);
  return straight > 0 && polylineKm(points) / straight < 1.005;
}

/** 클릭 지점에서 가장 가까운 변의 시작 인덱스 (경도 cos(lat) 보정 평면 근사) */
function nearestEdgeIndex(points: Pt[], p: Pt): number {
  const cos = Math.cos((p.lat * Math.PI) / 180);
  const px = p.lng * cos;
  const py = p.lat;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const ax = points[i].lng * cos;
    const ay = points[i].lat;
    const bx = points[i + 1].lng * cos;
    const by = points[i + 1].lat;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const d = (px - qx) ** 2 + (py - qy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// ── 인라인 스타일 ─────────────────────────────────────────────
const S: Record<string, CSSProperties> = {
  root: {
    display: "flex",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
    background: "#0b0f19",
    color: "#f3f4f6",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 14,
  },
  aside: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: 400,
    flexShrink: 0,
    overflowY: "auto",
    borderRight: "1px solid #1f2937",
    padding: 16,
    boxSizing: "border-box",
  },
  title: { fontSize: 18, fontWeight: 700, margin: 0 },
  devBadge: { fontSize: 11, fontWeight: 400, color: "#fbbf24", marginLeft: 6 },
  help: { fontSize: 12, lineHeight: "19px", color: "#9ca3af", margin: 0 },
  row: { display: "flex", gap: 8, alignItems: "center" },
  select: {
    flex: 1,
    minWidth: 0,
    borderRadius: 6,
    border: "1px solid #374151",
    background: "#111827",
    color: "#f3f4f6",
    padding: 8,
    fontSize: 13,
  },
  metaRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#9ca3af" },
  dirtyBadge: {
    borderRadius: 4,
    background: "rgba(120,53,15,.6)",
    color: "#fcd34d",
    padding: "2px 6px",
  },
  list: { display: "flex", flexDirection: "column", gap: 6, listStyle: "none", margin: 0, padding: 0 },
  itemHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  itemName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  itemMeta: { marginTop: 4, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#6b7280" },
  straightBadge: {
    borderRadius: 4,
    background: "rgba(127,29,29,.6)",
    color: "#fca5a5",
    padding: "2px 6px",
  },
  toolBox: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    borderRadius: 6,
    border: "1px solid #374151",
    background: "#111827",
    padding: 8,
  },
  toolTitle: { fontSize: 12, fontWeight: 600, color: "#d1d5db" },
  btnRow: { display: "flex", gap: 8 },
  btn: {
    flex: 1,
    borderRadius: 6,
    border: "none",
    background: "#374151",
    color: "#f3f4f6",
    padding: "7px 8px",
    fontSize: 12,
    cursor: "pointer",
  },
  btnIndigo: {
    borderRadius: 6,
    border: "none",
    background: "#4338ca",
    color: "#fff",
    padding: "7px 8px",
    fontSize: 12,
    cursor: "pointer",
  },
  keyHint: { fontSize: 11, color: "#6b7280", wordBreak: "break-all" },
  bottom: { marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, paddingTop: 8 },
  errorBox: {
    borderRadius: 6,
    border: "1px solid #7f1d1d",
    background: "rgba(69,10,10,.4)",
    color: "#fca5a5",
    padding: 8,
    fontSize: 12,
    margin: 0,
    listStyle: "none",
    maxHeight: 140,
    overflowY: "auto",
  },
  status: { fontSize: 12, color: "#9ca3af", wordBreak: "break-all", margin: 0 },
  map: { flex: 1, height: "100%", minWidth: 0 },
  formGrid: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 2 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 5,
    border: "1px solid #374151",
    background: "#0f1523",
    color: "#f3f4f6",
    padding: "6px 8px",
    fontSize: 13,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 5,
    border: "1px solid #374151",
    background: "#0f1523",
    color: "#f3f4f6",
    padding: "6px 8px",
    fontSize: 13,
    minHeight: 52,
    resize: "vertical",
    fontFamily: "inherit",
  },
  half: { display: "flex", gap: 8 },
};

const segItemStyle = (selected: boolean): CSSProperties => ({
  cursor: "pointer",
  borderRadius: 6,
  border: `1px solid ${selected ? "#3b82f6" : "#1f2937"}`,
  background: selected ? "rgba(30,58,138,.35)" : "#111827",
  padding: 8,
});

const tabStyle = (active: boolean): CSSProperties => ({
  flex: 1,
  borderRadius: 6,
  border: `1px solid ${active ? "#3b82f6" : "#374151"}`,
  background: active ? "rgba(30,58,138,.5)" : "#111827",
  color: active ? "#93c5fd" : "#9ca3af",
  padding: "7px 8px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
});

const saveBtnStyle = (disabled: boolean): CSSProperties => ({
  borderRadius: 6,
  border: "none",
  background: disabled ? "#374151" : "#15803d",
  color: "#fff",
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
});

export default function RouteEditor() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<NMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // 코스 draft: 진실 원본은 ref, state는 렌더 미러 (THEME_COURSES 원본과 분리된 깊은 복사)
  const courseRef = useRef<ThemeCourse | null>(null);
  const [course, setCourse] = useState<ThemeCourse | null>(null);

  // 세그먼트 draft: 동일 패턴
  const draftRef = useRef<DraftSeg[]>([]);
  const [draft, setDraft] = useState<DraftSeg[]>([]);

  const [editMode, setEditMode] = useState<EditMode>("route");
  const editModeRef = useRef<EditMode>("route");

  const [selectedSeg, setSelectedSeg] = useState<number | null>(null);
  const selectedRef = useRef<number | null>(null);
  const [selectedStop, setSelectedStop] = useState<number | null>(null);
  const selectedStopRef = useRef<number | null>(null);

  const [metaOpen, setMetaOpen] = useState(false);
  const [tagsText, setTagsText] = useState("");

  const [dirty, setDirty] = useState(false);
  const [sourceInfo, setSourceInfo] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // 지도 오버레이 refs
  const stopMarkersRef = useRef<NMarker[]>([]);
  const polysRef = useRef<NPolyline[]>([]);
  const handlesRef = useRef<NMarker[]>([]);

  // 이벤트 핸들러(지도 클릭·마커 우클릭 등)가 나중에 선언되는 콜백을 부르기 위한 우회 ref.
  // 콜백 선언보다 먼저 만들어 두고 아래 useEffect에서 최신 구현으로 동기화한다.
  const rebuildHandlesRef = useRef<() => void>(() => {});
  const insertVertexRef = useRef<(segIdx: number, p: Pt) => void>(() => {});
  const addStopRef = useRef<(p: Pt) => void>(() => {});
  const deleteStopRef = useRef<(stopIdx: number) => void>(() => {});

  /** ref → state 미러 커밋 (사이드바·검증 갱신) */
  const commit = useCallback((markDirty = true) => {
    setDraft(draftRef.current.map((s) => ({ mode: s.mode, points: [...s.points] })));
    const c = courseRef.current;
    setCourse(c ? { ...c, stops: c.stops.map((s) => ({ ...s })), tags: [...c.tags] } : null);
    if (markDirty) setDirty(true);
  }, []);

  // ── 오버레이 렌더 ──────────────────────────────────────────────────────────

  const clearOverlays = useCallback(() => {
    for (const m of stopMarkersRef.current) m.setMap(null);
    for (const p of polysRef.current) p.setMap(null);
    for (const h of handlesRef.current) h.setMap(null);
    stopMarkersRef.current = [];
    polysRef.current = [];
    handlesRef.current = [];
  }, []);

  const polyStyle = useCallback((segIdx: number, selected: boolean) => {
    const mode = draftRef.current[segIdx]?.mode ?? "walk";
    return {
      strokeColor: MODE_COLOR[mode],
      strokeWeight: selected ? 7 : 4,
      strokeOpacity: selected ? 0.95 : 0.45,
      strokeStyle: mode === "transit" ? "shortdash" : "solid",
      zIndex: selected ? 60 : 50,
      clickable: true,
    };
  }, []);

  /** 선택 세그먼트의 중간 정점 핸들 재구축 (경로 편집 모드 전용) */
  const rebuildHandles = useCallback(() => {
    const naver = getNaver();
    const map = mapInstance.current;
    for (const h of handlesRef.current) h.setMap(null);
    handlesRef.current = [];
    const segIdx = selectedRef.current;
    if (map == null || segIdx == null || editModeRef.current !== "route") return;
    const seg = draftRef.current[segIdx];
    if (!seg) return;

    // 끝점(스톱 앵커)에는 핸들을 만들지 않음 → 이동·삭제가 구조적으로 불가
    for (let v = 1; v < seg.points.length - 1; v++) {
      const p = seg.points[v];
      const handle = new naver.Marker({
        position: new naver.LatLng(p.lat, p.lng),
        map,
        draggable: true,
        zIndex: 200,
        icon: {
          content:
            '<div style="width:12px;height:12px;border-radius:50%;background:#fff;border:2.5px solid #2563eb;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:grab;"></div>',
          anchor: new naver.Point(6, 6),
        },
      });
      naver.Event.addListener(handle, "drag", () => {
        const pos = handle.getPosition();
        draftRef.current[segIdx].points[v] = { lat: pos.lat(), lng: pos.lng() };
        polysRef.current[segIdx]?.setPath(
          draftRef.current[segIdx].points.map((q) => new naver.LatLng(q.lat, q.lng)),
        );
      });
      naver.Event.addListener(handle, "dragend", () => {
        commit();
      });
      naver.Event.addListener(handle, "rightclick", () => {
        draftRef.current[segIdx].points.splice(v, 1);
        polysRef.current[segIdx]?.setPath(
          draftRef.current[segIdx].points.map((q) => new naver.LatLng(q.lat, q.lng)),
        );
        commit();
        rebuildHandlesRef.current(); // 인덱스가 밀리므로 전체 재구축
      });
      handlesRef.current.push(handle);
    }
  }, [commit]);

  const selectSegment = useCallback(
    (segIdx: number | null) => {
      selectedRef.current = segIdx;
      setSelectedSeg(segIdx);
      polysRef.current.forEach((poly, i) => poly.setStyles(polyStyle(i, i === segIdx)));
      rebuildHandles();
    },
    [polyStyle, rebuildHandles],
  );

  const selectStop = useCallback((stopIdx: number | null) => {
    selectedStopRef.current = stopIdx;
    setSelectedStop(stopIdx);
  }, []);

  /** 스톱 이동 시 인접 세그먼트 끝점 스냅 + 지도 반영 */
  const snapAdjacentSegments = useCallback((stopIdx: number) => {
    const naver = getNaver();
    const c = courseRef.current;
    if (!c) return;
    const p = { lat: c.stops[stopIdx].lat, lng: c.stops[stopIdx].lng };
    const prev = draftRef.current[stopIdx - 1];
    if (prev) {
      prev.points[prev.points.length - 1] = { ...p };
      polysRef.current[stopIdx - 1]?.setPath(prev.points.map((q) => new naver.LatLng(q.lat, q.lng)));
    }
    const next = draftRef.current[stopIdx];
    if (next) {
      next.points[0] = { ...p };
      polysRef.current[stopIdx]?.setPath(next.points.map((q) => new naver.LatLng(q.lat, q.lng)));
    }
  }, []);

  /** 코스 전체 오버레이(스톱 마커 + 세그먼트 폴리라인) 구축 */
  const renderCourse = useCallback(
    (c: ThemeCourse) => {
      const naver = getNaver();
      const map = mapInstance.current;
      if (!map) return;
      clearOverlays();
      const stopsEditable = editModeRef.current === "stops";

      c.stops.forEach((stop, i) => {
        const marker = new naver.Marker({
          position: new naver.LatLng(stop.lat, stop.lng),
          map,
          draggable: stopsEditable,
          zIndex: 150,
          icon: {
            content: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:${stopsEditable ? "#b45309" : "#111827"};color:#fff;font-size:13px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);cursor:${stopsEditable ? "grab" : "pointer"};" title="${stop.name}">${i + 1}</div>`,
            anchor: new naver.Point(13, 13),
          },
        });
        naver.Event.addListener(marker, "click", () => {
          if (editModeRef.current === "stops") selectStop(i);
        });
        naver.Event.addListener(marker, "rightclick", () => {
          if (editModeRef.current === "stops") deleteStopRef.current(i);
        });
        naver.Event.addListener(marker, "drag", () => {
          if (editModeRef.current !== "stops") return;
          const pos = marker.getPosition();
          const cur = courseRef.current;
          if (!cur) return;
          cur.stops[i] = { ...cur.stops[i], lat: pos.lat(), lng: pos.lng() };
          snapAdjacentSegments(i);
        });
        naver.Event.addListener(marker, "dragend", () => {
          if (editModeRef.current !== "stops") return;
          const pos = marker.getPosition();
          const cur = courseRef.current;
          if (!cur) return;
          cur.stops[i] = { ...cur.stops[i], lat: pos.lat(), lng: pos.lng() };
          snapAdjacentSegments(i);
          selectStop(i);
          commit();
        });
        stopMarkersRef.current.push(marker);
      });

      draftRef.current.forEach((seg, i) => {
        const poly = new naver.Polyline({
          map,
          path: seg.points.map((p) => new naver.LatLng(p.lat, p.lng)),
          ...polyStyle(i, selectedRef.current === i),
        });
        naver.Event.addListener(poly, "click", (e) => {
          if (editModeRef.current !== "route") return;
          if (selectedRef.current === i && e.coord) {
            // 이미 선택된 선을 클릭 → 정점 추가
            insertVertexRef.current(i, { lat: e.coord.lat(), lng: e.coord.lng() });
          } else {
            selectSegment(i);
          }
        });
        polysRef.current.push(poly);
      });

      // 코스 전체가 보이도록 이동 (스톱 1개 이상일 때)
      if (c.stops.length > 0) {
        const bounds = new naver.LatLngBounds(
          new naver.LatLng(c.stops[0].lat, c.stops[0].lng),
          new naver.LatLng(c.stops[0].lat, c.stops[0].lng),
        );
        for (const s of c.stops) bounds.extend(new naver.LatLng(s.lat, s.lng));
        if (c.stops.length > 1) map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
      }
    },
    [clearOverlays, polyStyle, selectSegment, selectStop, snapAdjacentSegments, commit],
  );

  /** 최근접 변에 정점 삽입 (경로 편집 모드) */
  const insertVertexAt = useCallback(
    (segIdx: number, p: Pt) => {
      const naver = getNaver();
      const seg = draftRef.current[segIdx];
      if (!seg) return;
      const at = nearestEdgeIndex(seg.points, p) + 1;
      seg.points.splice(at, 0, p);
      polysRef.current[segIdx]?.setPath(seg.points.map((q) => new naver.LatLng(q.lat, q.lng)));
      commit();
      rebuildHandles();
    },
    [commit, rebuildHandles],
  );

  /** 지도 클릭으로 스톱을 코스 끝에 추가 (스톱 편집 모드) */
  const addStop = useCallback(
    (p: Pt) => {
      const c = courseRef.current;
      if (!c) return;
      const stop: CourseStop = {
        name: `장소 ${c.stops.length + 1}`,
        lat: p.lat,
        lng: p.lng,
        preview: "",
        description: "",
        duration: "30분",
      };
      if (c.stops.length >= 1) {
        const last = c.stops[c.stops.length - 1];
        draftRef.current.push({ mode: "walk", points: straightPoints(last, p) });
      }
      c.stops.push(stop);
      commit();
      renderCourse(c);
      selectStop(c.stops.length - 1);
      setStatus(`스톱 ${c.stops.length} 추가 — 오른쪽 폼에서 이름을 채우세요`);
    },
    [commit, renderCourse, selectStop],
  );

  /** 스톱 삭제 — 양옆 세그먼트를 직선 하나로 병합 */
  const deleteStop = useCallback(
    (stopIdx: number) => {
      const c = courseRef.current;
      if (!c || stopIdx < 0 || stopIdx >= c.stops.length) return;
      if (!window.confirm(`스톱 ${stopIdx + 1} "${c.stops[stopIdx].name}" 삭제?`)) return;
      const segs = draftRef.current;
      if (stopIdx === 0) {
        segs.shift();
      } else if (stopIdx === c.stops.length - 1) {
        segs.pop();
      } else {
        segs.splice(stopIdx - 1, 2, {
          mode: "walk",
          points: straightPoints(c.stops[stopIdx - 1], c.stops[stopIdx + 1]),
        });
      }
      c.stops.splice(stopIdx, 1);
      selectStop(null);
      selectedRef.current = null;
      setSelectedSeg(null);
      commit();
      renderCourse(c);
    },
    [commit, renderCourse, selectStop],
  );

  useEffect(() => {
    rebuildHandlesRef.current = rebuildHandles;
    insertVertexRef.current = insertVertexAt;
    addStopRef.current = addStop;
    deleteStopRef.current = deleteStop;
  });

  // ── 지도 초기화 ────────────────────────────────────────────────────────────

  const handleNaverLoad = useCallback(() => {
    if (!mapEl.current || mapInstance.current) return;
    const naver = getNaver();
    mapInstance.current = new naver.Map(mapEl.current, {
      center: new naver.LatLng(SEOUL_CENTER.lat, SEOUL_CENTER.lng),
      zoom: 13,
      mapTypeControl: false,
      zoomControl: true,
      scaleControl: true,
      logoControl: false,
      mapDataControl: false,
    });
    // 지도 클릭: 스톱 편집 모드 = 스톱 추가 / 경로 편집 모드 = 선택 세그먼트에 정점 추가
    naver.Event.addListener(mapInstance.current, "click", (e) => {
      if (!e.coord) return;
      const p = { lat: e.coord.lat(), lng: e.coord.lng() };
      if (editModeRef.current === "stops") {
        addStopRef.current(p);
      } else if (selectedRef.current != null) {
        insertVertexRef.current(selectedRef.current, p);
      }
    });
    setMapReady(true);
  }, []);

  // 우클릭 기본 컨텍스트 메뉴 차단(삭제 상호작용과 충돌) + ESC로 선택 해제
  useEffect(() => {
    const el = mapEl.current;
    const onCtx = (e: MouseEvent) => e.preventDefault();
    el?.addEventListener("contextmenu", onCtx);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        selectSegment(null);
        selectStop(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      el?.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("keydown", onKey);
    };
  }, [selectSegment, selectStop]);

  // ── 코스 로드 / 신규 생성 ──────────────────────────────────────────────────

  const switchEditMode = useCallback(
    (m: EditMode) => {
      editModeRef.current = m;
      setEditMode(m);
      selectSegment(null);
      selectStop(null);
      const c = courseRef.current;
      if (c) renderCourse(c); // 마커 draggable 재구성
    },
    [renderCourse, selectSegment, selectStop],
  );

  const loadCourse = useCallback(
    async (id: string) => {
      const orig = THEME_COURSES.find((x) => x.id === id);
      if (!orig || !mapReady) return;
      const c = structuredClone(orig); // THEME_COURSES 원본과 분리
      setStatus("");
      setBusy(true);
      let segs: DraftSeg[] | null = null;
      try {
        const res = await fetch(`/courses/routes/${id}.json`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.segments) && data.segments.length === c.stops.length - 1) {
            segs = (data.segments as CourseSegment[]).map((s) => ({
              mode: s.mode === "transit" ? "transit" : "walk",
              points: s.points.map((p) => ({ lat: p.lat, lng: p.lng })),
            }));
            setSourceInfo(`${data.source ?? "?"} · ${data.editedAt ?? data.generatedAt ?? "?"}`);
          }
        }
      } catch {
        /* 사이드카 없으면 직선 시드 */
      }
      if (!segs) {
        segs = c.stops.slice(0, -1).map((s, i) => ({
          mode: "walk" as const,
          points: straightPoints(s, c.stops[i + 1]),
        }));
        setSourceInfo("사이드카 없음 — 직선 시드");
      }
      // 로드 직후 항상 끝점을 스톱 좌표로 스냅 (마커-선 이격 방지)
      segs.forEach((seg, i) => {
        seg.points[0] = { lat: c.stops[i].lat, lng: c.stops[i].lng };
        seg.points[seg.points.length - 1] = { lat: c.stops[i + 1].lat, lng: c.stops[i + 1].lng };
      });

      draftRef.current = segs;
      courseRef.current = c;
      setTagsText(c.tags.join(", "));
      selectedRef.current = null;
      setSelectedSeg(null);
      selectStop(null);
      setMetaOpen(false);
      commit(false);
      setDirty(false);
      renderCourse(c);
      setBusy(false);
    },
    [mapReady, commit, renderCourse, selectStop],
  );

  const createNewCourse = useCallback(() => {
    const id = window.prompt("새 코스 id (영소문자·숫자·하이픈, 예: my-new-course)")?.trim();
    if (!id) return;
    if (!COURSE_ID_RE.test(id)) {
      setStatus(`id 형식 오류: "${id}" — 영소문자·숫자·하이픈(kebab-case)만 가능`);
      return;
    }
    if (THEME_COURSES.some((c) => c.id === id)) {
      setStatus(`이미 존재하는 id: ${id} — 드롭다운에서 선택해 수정하세요`);
      return;
    }
    const c: ThemeCourse = { id, ...structuredClone(NEW_COURSE_DEFAULTS) };
    draftRef.current = [];
    courseRef.current = c;
    setTagsText("");
    setSourceInfo("신규 코스 (미저장)");
    selectedRef.current = null;
    setSelectedSeg(null);
    selectStop(null);
    setMetaOpen(true);
    commit(false);
    setDirty(true);
    editModeRef.current = "stops";
    setEditMode("stops");
    renderCourse(c);
    setStatus("스톱 편집 모드 — 지도를 클릭해 코스 장소를 순서대로 찍으세요 (최소 2개)");
  }, [commit, renderCourse, selectStop]);

  // ── 필드 편집 ──────────────────────────────────────────────────────────────

  const updateMeta = useCallback(
    (patch: Partial<ThemeCourse>) => {
      const c = courseRef.current;
      if (!c) return;
      Object.assign(c, patch);
      commit();
    },
    [commit],
  );

  const updateStop = useCallback(
    (stopIdx: number, patch: Partial<CourseStop>) => {
      const c = courseRef.current;
      if (!c || !c.stops[stopIdx]) return;
      c.stops[stopIdx] = { ...c.stops[stopIdx], ...patch };
      commit();
    },
    [commit],
  );

  const autoDistance = useCallback(() => {
    const total = draftRef.current.reduce((sum, seg) => sum + polylineKm(seg.points), 0);
    updateMeta({ distance: `약 ${total.toFixed(1)}km` });
  }, [updateMeta]);

  // ── 세그먼트 도구 ──────────────────────────────────────────────────────────

  const replaceSegPoints = useCallback(
    (segIdx: number, points: Pt[]) => {
      const naver = getNaver();
      const c = courseRef.current;
      if (!c) return;
      // 끝점 스냅
      points[0] = { lat: c.stops[segIdx].lat, lng: c.stops[segIdx].lng };
      points[points.length - 1] = { lat: c.stops[segIdx + 1].lat, lng: c.stops[segIdx + 1].lng };
      draftRef.current[segIdx].points = points;
      polysRef.current[segIdx]?.setPath(points.map((q) => new naver.LatLng(q.lat, q.lng)));
      commit();
      rebuildHandles();
    },
    [commit, rebuildHandles],
  );

  const reseedFromOSRM = useCallback(
    async (segIdx: number) => {
      const c = courseRef.current;
      if (!c) return;
      const a = c.stops[segIdx];
      const b = c.stops[segIdx + 1];
      setBusy(true);
      let pts: Pt[] = [];
      try {
        const res = await fetch(
          `/api/transit/walk?fromLat=${a.lat}&fromLng=${a.lng}&toLat=${b.lat}&toLng=${b.lng}`,
        );
        if (res.ok) pts = (await res.json()).points ?? [];
      } catch {
        /* 실패 시 직선 */
      }
      if (pts.length < 2) {
        pts = straightPoints(a, b);
        setStatus(`구간 ${segIdx + 1}: OSRM 우회 폐기/실패 — 직선으로 시드됨`);
      } else {
        setStatus(`구간 ${segIdx + 1}: OSRM 재시드 완료 (${pts.length}점)`);
      }
      replaceSegPoints(segIdx, pts);
      setBusy(false);
    },
    [replaceSegPoints],
  );

  const resetToStraight = useCallback(
    (segIdx: number) => {
      const c = courseRef.current;
      if (!c) return;
      // 중간 보간점 없이 두 스톱만 잇는 2점 직선 — 편집 핸들이 생기지 않는다
      const a = c.stops[segIdx];
      const b = c.stops[segIdx + 1];
      replaceSegPoints(segIdx, [
        { lat: a.lat, lng: a.lng },
        { lat: b.lat, lng: b.lng },
      ]);
      setStatus(`구간 ${segIdx + 1}: 직선으로 초기화 (점 제거)`);
    },
    [replaceSegPoints],
  );

  const toggleMode = useCallback(
    (segIdx: number) => {
      draftRef.current[segIdx].mode = draftRef.current[segIdx].mode === "walk" ? "transit" : "walk";
      polysRef.current[segIdx]?.setStyles(polyStyle(segIdx, selectedRef.current === segIdx));
      commit();
    },
    [commit, polyStyle],
  );

  // ── 저장 ──────────────────────────────────────────────────────────────────

  const errors = course ? [...validateCourseMeta(course), ...validateSidecar(course, draft)] : [];

  const saveCourse = useCallback(async () => {
    const c = courseRef.current;
    if (!c) return;
    setBusy(true);
    try {
      const res = await fetch("/api/dev/course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course: c, segments: draftRef.current }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setDirty(false);
        setSourceInfo(`curated · ${new Date().toISOString().slice(0, 10)}`);
        setStatus(
          `저장됨 → ${data.paths.join(", ")}${data.isNew ? " · 신규 코스는 페이지 새로고침 후 목록·메인 앱에 반영" : ""}`,
        );
      } else {
        setStatus(`저장 실패: ${(data.errors ?? [data.error]).join(" / ")}`);
      }
    } catch (e) {
      setStatus(`저장 실패: ${String(e)}`);
    }
    setBusy(false);
  }, []);

  const saveSegmentToLibrary = useCallback(async () => {
    const c = courseRef.current;
    const segIdx = selectedRef.current;
    if (!c || segIdx == null) return;
    const seg = draftRef.current[segIdx];
    const a = c.stops[segIdx];
    const b = c.stops[segIdx + 1];
    setBusy(true);
    try {
      const res = await fetch("/api/dev/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          a: { name: a.name, lat: a.lat, lng: a.lng },
          b: { name: b.name, lat: b.lat, lng: b.lng },
          mode: seg.mode,
          points: seg.points,
        }),
      });
      const data = await res.json();
      setStatus(
        res.ok && data.ok
          ? `라이브러리 저장됨 → ${data.path}`
          : `라이브러리 저장 실패: ${(data.errors ?? [data.error]).join(" / ")}`,
      );
    } catch (e) {
      setStatus(`라이브러리 저장 실패: ${String(e)}`);
    }
    setBusy(false);
  }, []);

  // ── UI ────────────────────────────────────────────────────────────────────

  const isNewCourse = course != null && !THEME_COURSES.some((c) => c.id === course.id);

  return (
    <div style={S.root}>
      <Script
        id="naver-maps-editor"
        src={`https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}&submodules=geocoder`}
        strategy="afterInteractive"
        onLoad={handleNaverLoad}
      />

      {/* 사이드바 */}
      <aside style={S.aside}>
        <h1 style={S.title}>
          코스·경로 에디터<span style={S.devBadge}>dev 전용</span>
        </h1>
        <p style={S.help}>
          {editMode === "route" ? (
            <>
              <b>경로 편집</b>: 선 클릭=선택 → 선택된 선/지도 클릭=정점 추가, 흰 핸들 드래그=이동,
              핸들 우클릭=삭제. <b>직선</b> 배지 구간이 손볼 우선순위.
            </>
          ) : (
            <>
              <b>스톱 편집</b>: 지도 클릭=끝에 스톱 추가, 주황 마커 드래그=이동, 마커
              우클릭=삭제, 마커/목록 클릭=필드 편집. 스톱을 옮기면 인접 경로 끝점이 따라온다.
            </>
          )}{" "}
          ESC=선택 해제.
        </p>

        <div style={S.row}>
          <select
            style={S.select}
            value={course?.id ?? ""}
            onChange={(e) => e.target.value && loadCourse(e.target.value)}
            disabled={!mapReady || busy}
          >
            <option value="">— 코스 선택 —</option>
            {isNewCourse && course && (
              <option value={course.id}>{course.title || course.id} (신규·미저장)</option>
            )}
            {THEME_COURSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.id})
              </option>
            ))}
          </select>
          <button
            style={{ ...S.btnIndigo, flexShrink: 0 }}
            disabled={!mapReady || busy}
            onClick={createNewCourse}
          >
            + 새 코스
          </button>
        </div>

        {course && (
          <div style={S.metaRow}>
            <span>{sourceInfo}</span>
            {dirty && <span style={S.dirtyBadge}>저장 안 됨</span>}
          </div>
        )}

        {/* 편집 모드 탭 */}
        {course && (
          <div style={S.btnRow}>
            <button style={tabStyle(editMode === "route")} onClick={() => switchEditMode("route")}>
              경로 편집
            </button>
            <button style={tabStyle(editMode === "stops")} onClick={() => switchEditMode("stops")}>
              스톱 편집
            </button>
          </div>
        )}

        {/* 코스 메타데이터 폼 */}
        {course && (
          <div style={S.toolBox}>
            <button
              style={{ ...S.btn, textAlign: "left", background: "transparent", padding: 0 }}
              onClick={() => setMetaOpen((v) => !v)}
            >
              {metaOpen ? "▾" : "▸"} 코스 정보 ({course.title || "제목 없음"})
            </button>
            {metaOpen && (
              <div style={S.formGrid}>
                <div>
                  <label style={S.label}>제목 title *</label>
                  <input style={S.input} value={course.title} onChange={(e) => updateMeta({ title: e.target.value })} />
                </div>
                <div>
                  <label style={S.label}>부제 subtitle *</label>
                  <input style={S.input} value={course.subtitle} onChange={(e) => updateMeta({ subtitle: e.target.value })} />
                </div>
                <div>
                  <label style={S.label}>설명 description *</label>
                  <textarea style={S.textarea} value={course.description} onChange={(e) => updateMeta({ description: e.target.value })} />
                </div>
                <div style={S.half}>
                  <div style={{ flex: 1 }}>
                    <label style={S.label}>카테고리 *</label>
                    <select
                      style={{ ...S.input }}
                      value={course.category}
                      onChange={(e) => updateMeta({ category: e.target.value as ThemeCourse["category"] })}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={S.label}>난이도 *</label>
                    <select
                      style={{ ...S.input }}
                      value={course.difficulty}
                      onChange={(e) => updateMeta({ difficulty: e.target.value as ThemeCourse["difficulty"] })}
                    >
                      {DIFFICULTIES.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={S.half}>
                  <div style={{ flex: 1 }}>
                    <label style={S.label}>총 소요시간 * (예: 약 4시간)</label>
                    <input style={S.input} value={course.totalDuration} onChange={(e) => updateMeta({ totalDuration: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={S.label}>
                      거리 *{" "}
                      <button style={{ border: "none", background: "none", color: "#60a5fa", cursor: "pointer", fontSize: 11, padding: 0 }} onClick={autoDistance}>
                        경로에서 자동계산
                      </button>
                    </label>
                    <input style={S.input} value={course.distance} onChange={(e) => updateMeta({ distance: e.target.value })} />
                  </div>
                </div>
                <div style={S.half}>
                  <div style={{ flex: 1 }}>
                    <label style={S.label}>예상 비용 * (예: 2만원 내외)</label>
                    <input style={S.input} value={course.estimatedCost} onChange={(e) => updateMeta({ estimatedCost: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={S.label}>추천 시간대 * (예: 오후 2시~)</label>
                    <input style={S.input} value={course.bestTime} onChange={(e) => updateMeta({ bestTime: e.target.value })} />
                  </div>
                </div>
                <div style={S.half}>
                  <div style={{ flex: 1 }}>
                    <label style={S.label}>태그 (쉼표 구분)</label>
                    <input
                      style={S.input}
                      value={tagsText}
                      onChange={(e) => {
                        setTagsText(e.target.value);
                        updateMeta({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) });
                      }}
                    />
                  </div>
                  <div style={{ width: 90 }}>
                    <label style={S.label}>색상 *</label>
                    <input
                      type="color"
                      style={{ ...S.input, padding: 2, height: 32 }}
                      value={/^#[0-9a-fA-F]{6}$/.test(course.color) ? course.color : "#2563eb"}
                      onChange={(e) => updateMeta({ color: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label style={S.label}>미디어 제목 mediaTitle (선택 — 드라마/영화 코스)</label>
                  <input style={S.input} value={course.mediaTitle ?? ""} onChange={(e) => updateMeta({ mediaTitle: e.target.value || undefined })} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 스톱 편집 모드: 스톱 목록 + 선택 스톱 필드 폼 */}
        {course && editMode === "stops" && (
          <>
            <ul style={S.list}>
              {course.stops.map((stop, i) => (
                <li key={i} style={segItemStyle(selectedStop === i)} onClick={() => selectStop(i)}>
                  <div style={S.itemHead}>
                    <span style={S.itemName}>
                      {i + 1}. {stop.name || "(이름 없음)"}
                    </span>
                    <button
                      style={{ border: "none", background: "none", color: "#f87171", cursor: "pointer", fontSize: 14, flexShrink: 0 }}
                      title="스톱 삭제"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteStop(i);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={S.itemMeta}>
                    <span>
                      {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)} · {stop.duration || "체류?"}
                    </span>
                  </div>
                </li>
              ))}
              {course.stops.length === 0 && (
                <li style={{ ...S.help, padding: 8 }}>지도를 클릭해 첫 스톱을 추가하세요.</li>
              )}
            </ul>

            {selectedStop != null && course.stops[selectedStop] && (
              <div style={S.toolBox}>
                <span style={S.toolTitle}>스톱 {selectedStop + 1} 필드</span>
                <div style={S.formGrid}>
                  <div style={S.half}>
                    <div style={{ flex: 1 }}>
                      <label style={S.label}>이름 *</label>
                      <input
                        style={S.input}
                        value={course.stops[selectedStop].name}
                        onChange={(e) => updateStop(selectedStop, { name: e.target.value })}
                      />
                    </div>
                    <div style={{ width: 100 }}>
                      <label style={S.label}>체류시간 *</label>
                      <input
                        style={S.input}
                        value={course.stops[selectedStop].duration}
                        onChange={(e) => updateStop(selectedStop, { duration: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={S.label}>미리보기 한 줄 * (사이드바용)</label>
                    <input
                      style={S.input}
                      value={course.stops[selectedStop].preview}
                      onChange={(e) => updateStop(selectedStop, { preview: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={S.label}>상세 설명 * (지도 카드용)</label>
                    <textarea
                      style={S.textarea}
                      value={course.stops[selectedStop].description}
                      onChange={(e) => updateStop(selectedStop, { description: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={S.label}>팁 (선택)</label>
                    <input
                      style={S.input}
                      value={course.stops[selectedStop].tip ?? ""}
                      onChange={(e) => updateStop(selectedStop, { tip: e.target.value || undefined })}
                    />
                  </div>
                  <span style={S.keyHint}>
                    좌표는 지도에서 마커를 드래그해 수정 · {course.stops[selectedStop].lat.toFixed(6)},{" "}
                    {course.stops[selectedStop].lng.toFixed(6)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* 경로 편집 모드: 세그먼트 목록 + 도구 */}
        {course && editMode === "route" && (
          <>
            <ul style={S.list}>
              {draft.map((seg, i) => {
                const straight = looksStraight(seg.points);
                const selected = selectedSeg === i;
                return (
                  <li key={i} style={segItemStyle(selected)} onClick={() => selectSegment(i)}>
                    <div style={S.itemHead}>
                      <span style={S.itemName}>
                        {i + 1}. {course.stops[i]?.name} → {course.stops[i + 1]?.name}
                      </span>
                      <button
                        style={{
                          flexShrink: 0,
                          borderRadius: 4,
                          border: "none",
                          padding: "2px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          background: MODE_COLOR[seg.mode] + "33",
                          color: MODE_COLOR[seg.mode],
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMode(i);
                        }}
                        title="mode 토글"
                      >
                        {seg.mode}
                      </button>
                    </div>
                    <div style={S.itemMeta}>
                      <span>
                        {seg.points.length}점 · {polylineKm(seg.points).toFixed(2)}km
                      </span>
                      {straight && <span style={S.straightBadge}>직선</span>}
                    </div>
                  </li>
                );
              })}
              {draft.length === 0 && (
                <li style={{ ...S.help, padding: 8 }}>
                  세그먼트가 없습니다 — 스톱 편집 모드에서 스톱을 2개 이상 추가하세요.
                </li>
              )}
            </ul>

            {selectedSeg != null && draft[selectedSeg] && (
              <div style={S.toolBox}>
                <span style={S.toolTitle}>구간 {selectedSeg + 1} 도구</span>
                <div style={S.btnRow}>
                  <button style={S.btn} disabled={busy} onClick={() => reseedFromOSRM(selectedSeg)}>
                    OSRM 재시드
                  </button>
                  <button style={S.btn} disabled={busy} onClick={() => resetToStraight(selectedSeg)}>
                    직선 초기화
                  </button>
                </div>
                <button style={S.btnIndigo} disabled={busy} onClick={saveSegmentToLibrary}>
                  이 구간을 세그먼트 라이브러리로 저장
                </button>
                <span style={S.keyHint}>
                  키: {segmentKey(course.stops[selectedSeg].name, course.stops[selectedSeg + 1].name)}
                </span>
              </div>
            )}
          </>
        )}

        {/* 검증 + 저장 */}
        {course && (
          <div style={S.bottom}>
            {errors.length > 0 && (
              <ul style={S.errorBox}>
                {errors.map((err, i) => (
                  <li key={i}>· {err}</li>
                ))}
              </ul>
            )}
            <button
              style={saveBtnStyle(busy || errors.length > 0)}
              disabled={busy || errors.length > 0}
              onClick={saveCourse}
            >
              {isNewCourse ? "새 코스 저장" : "코스 저장"} (데이터 + 경로 JSON)
            </button>
            {status && <p style={S.status}>{status}</p>}
          </div>
        )}
      </aside>

      {/* 지도 */}
      <div ref={mapEl} style={S.map} />
    </div>
  );
}
