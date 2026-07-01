"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Script from "next/script";
import type { POIItem } from "@/app/api/poi/route";
import type { StoryQuest } from "@/types/quest";
import type { ThemeCourse } from "@/data/themeCourses";
import ActiveQuestTracker from "@/components/game/ActiveQuestTracker";
import PlaceCard from "@/components/game/PlaceCard";
import CourseStopCard from "@/components/game/CourseStopCard";
import AIInfoPanel from "@/components/game/AIInfoPanel";
import CourseDetailPanel from "@/components/map/CourseDetailPanel";
import { useCourseCollection } from "@/hooks/useCourseCollection";
import { RouteFlowAnimator, type FlowNaverApi } from "@/lib/routeFlow";
import { SEOUL_PLACES } from "@/lib/seoulPlaces";
import Sidebar from "@/components/sidebar/Sidebar";
import CultureSpeedDial from "@/components/map/CultureSpeedDial";
import MobileNavigation, { type MobileTabId } from "@/components/mobile/MobileNavigation";
import MobilePanel from "@/components/mobile/MobilePanel";
import MobileMapControls from "@/components/mobile/MobileMapControls";
import type { RouteDrawPayload, RouteSearchCache } from "@/components/sidebar/SearchRoadPanel";
import { CATEGORY_MARKER, type CultureCategory } from "@/lib/cultureCategories";
import { useMediaQuery } from "@/hooks/useMediaQuery";

declare global {
  interface Window { naver: NaverApi; }
}

const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };
const DEFAULT_ZOOM = 12;

type NaverLatLng = {
  lat: () => number;
  lng: () => number;
};

type NaverOverlay = {
  setMap: (map: NaverMap | null) => void;
};

type NaverMarker = NaverOverlay & {
  setPosition: (position: NaverLatLng) => void;
};

type NaverCircle = NaverOverlay & {
  setCenter: (center: NaverLatLng) => void;
  setRadius: (radius: number) => void;
};

type NaverLatLngBounds = {
  extend: (position: NaverLatLng) => void;
};

type NaverProjection = {
  fromPageXYToCoord: (point: NaverPoint) => NaverLatLng;
};

type NaverMap = {
  panTo: (position: NaverLatLng) => void;
  setZoom: (zoom: number) => void;
  setOptions: (options: Record<string, unknown>) => void;
  fitBounds: (bounds: NaverLatLngBounds, padding?: Record<string, number>) => void;
  getProjection: () => NaverProjection;
};

type NaverPoint = { x: number; y: number };

type NaverReverseGeocodeResponse = {
  v2?: { address?: { roadAddress?: string; jibunAddress?: string } };
};

type NaverApi = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => NaverMap;
    LatLng: new (lat: number, lng: number) => NaverLatLng;
    Point: new (x: number, y: number) => NaverPoint;
    Marker: new (options: Record<string, unknown>) => NaverMarker;
    Polyline: new (options: Record<string, unknown>) => NaverOverlay;
    Circle: new (options: Record<string, unknown>) => NaverCircle;
    LatLngBounds: new (from: NaverLatLng, to: NaverLatLng) => NaverLatLngBounds;
    Event: { addListener: (target: object, eventName: string, listener: () => void) => void };
    Position: { RIGHT_BOTTOM: string };
    Service: {
      OrderType: { ADDR: string };
      reverseGeocode: (
        options: Record<string, unknown>,
        callback: (status: unknown, response: NaverReverseGeocodeResponse) => void
      ) => void;
    };
  };
};

type LocationStatus = "idle" | "requesting" | "granted" | "denied" | "unavailable" | "error";

interface UserLocation {
  lat: number;
  lng: number;
  accuracy: number;
  updatedAt: number;
}

function getReverseGeocodeAddress(response: NaverReverseGeocodeResponse, fallback: string): string {
  return response.v2?.address?.roadAddress || response.v2?.address?.jibunAddress || fallback;
}

export default function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<NaverMap | null>(null);
  const allPOIs = useRef<POIItem[]>([]);
  const markersRef = useRef<NaverOverlay[]>([]);
  const cultureMarkersRef = useRef<NaverOverlay[]>([]);
  const questMarkersRef = useRef<NaverOverlay[]>([]);
  const courseMarkersRef = useRef<NaverOverlay[]>([]);
  const coursePolylinesRef = useRef<NaverOverlay[]>([]);
  const courseArrowsRef = useRef<NaverOverlay[]>([]);
  const courseFlowRef = useRef<RouteFlowAnimator[]>([]);
  const routeFlowRef = useRef<RouteFlowAnimator[]>([]);
  const originMarkerRef = useRef<NaverMarker | null>(null);
  const destMarkerRef = useRef<NaverMarker | null>(null);
  const userLocationMarkerRef = useRef<NaverMarker | null>(null);
  const accuracyCircleRef = useRef<NaverCircle | null>(null);
  const polylineRef = useRef<NaverOverlay | null>(null);
  const routePolylinesRef = useRef<NaverOverlay[]>([]);
  const routeMarkersRef = useRef<NaverOverlay[]>([]);
  const [poisData, setPoisData] = useState<POIItem[]>([]);
  const [selected, setSelected] = useState<POIItem | null>(null);
  const [aiAskingPOI, setAiAskingPOI] = useState<POIItem | null>(null);
  const [activeQuest, setActiveQuest] = useState<StoryQuest | null>(null);
  const [currentObjIndex, setCurrentObjIndex] = useState(0);
  const [activeCourse, setActiveCourse] = useState<ThemeCourse | null>(null);
  const [detailCourse, setDetailCourse] = useState<ThemeCourse | null>(null);
  const { drafts: courseDrafts, addDraft, removeDraft } = useCourseCollection();
  const [mapReady, setMapReady] = useState(false);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [dest, setDest] = useState<{ lat: number; lng: number } | null>(null);
  const [presetDest, setPresetDest] = useState<{ label: string; lat: number; lng: number } | null>(null);
  const [presetOrigin, setPresetOrigin] = useState<{ label: string; lat: number; lng: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null);
  const [activeCultureCategory, setActiveCultureCategory] = useState<CultureCategory | null>(null);
  const [showNight, setShowNight] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationMessage, setLocationMessage] = useState("");
  const [sidebarActiveTab, setSidebarActiveTab] = useState<MobileTabId | null>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");

  const locationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeCacheRef = useRef<RouteSearchCache>({
    routePool: [],
    alternatives: [],
    selectedIdx: 0,
    status: "",
    stepArrivals: {},
  });


  const triggerMessageTimeout = useCallback(() => {
    if (locationTimeoutRef.current) {
      clearTimeout(locationTimeoutRef.current);
    }
    locationTimeoutRef.current = setTimeout(() => {
      setLocationMessage("");
      setLocationStatus("idle");
    }, 2000);
  }, []);



  function handleNaverLoad() {
    if (!mapRef.current || mapInstance.current) return;

    mapInstance.current = new window.naver.maps.Map(mapRef.current, {
      center: new window.naver.maps.LatLng(SEOUL_CENTER.lat, SEOUL_CENTER.lng),
      zoom: DEFAULT_ZOOM,
      mapTypeControl: false,
      zoomControl: false,
      scaleControl: false,
      logoControl: false,
      mapDataControl: false,
    });

    setMapReady(true);
    fetchAllPOIs();
  }

  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    mapInstance.current.setOptions({ zoomControl: false });
  }, [mapReady]);

  async function fetchAllPOIs() {
    try {
      const res = await fetch("/api/poi");
      const { pois } = await res.json();
      allPOIs.current = pois;
      setPoisData(pois);
    } catch (e) {
      console.warn("POI fetch failed", e);
    }
  }

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
  }, []);

  const clearQuestMarkers = useCallback(() => {
    questMarkersRef.current.forEach((m) => m.setMap(null));
    questMarkersRef.current = [];
  }, []);

  const clearCourseOverlay = useCallback(() => {
    courseMarkersRef.current.forEach((m) => m.setMap(null));
    courseMarkersRef.current = [];
    coursePolylinesRef.current.forEach((p) => p.setMap(null));
    coursePolylinesRef.current = [];
    courseArrowsRef.current.forEach((a) => a.setMap(null));
    courseArrowsRef.current = [];
    courseFlowRef.current.forEach((f) => f.destroy());
    courseFlowRef.current = [];
  }, []);

  // 문화행사 마커 — 카테고리 선택 시 커스텀 PNG 마커로 렌더링 (최대 100개)
  useEffect(() => {
    if (!mapReady) return;
    cultureMarkersRef.current.forEach((m) => m.setMap(null));
    cultureMarkersRef.current = [];
    if (!activeCultureCategory) return;

    const naver = window.naver;
    const markerUrl = CATEGORY_MARKER[activeCultureCategory];
    const filtered = allPOIs.current
      .filter((p) => p.source === "culture" && p.normalizedCategory === activeCultureCategory)
      .slice(0, 100);

    filtered.forEach((poi) => {
      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(poi.lat, poi.lng),
        map: mapInstance.current,
        title: poi.name,
        icon: {
          content: `<img src="${markerUrl}" style="width:26px;height:26px;cursor:pointer;display:block;" />`,
          anchor: new naver.maps.Point(13, 13),
        },
      });
      naver.maps.Event.addListener(marker, "click", () => {
        setSelected(poi);
        if (isMobile) setSidebarActiveTab(null);
      });
      cultureMarkersRef.current.push(marker);
    });
  }, [activeCultureCategory, mapReady, isMobile]);

  // 야경명소 마커 — showNight 토글에 반응
  useEffect(() => {
    if (!mapReady) return;
    clearMarkers();
    if (!showNight) return;

    const naver = window.naver;
    allPOIs.current
      .filter((p) => p.source === "nightview")
      .forEach((poi) => {
        const marker = new naver.maps.Marker({
          position: new naver.maps.LatLng(poi.lat, poi.lng),
          map: mapInstance.current,
          title: poi.name,
          icon: {
            content: `<img src="/markers/marker-nightview.png" style="width:26px;height:26px;cursor:pointer;display:block;" />`,
            anchor: new naver.maps.Point(8, 8),
          },
        });
        naver.maps.Event.addListener(marker, "click", () => {
          setSelected(poi);
          if (isMobile) setSidebarActiveTab(null);
        });
        markersRef.current.push(marker);
      });
  }, [showNight, mapReady, clearMarkers, isMobile]);

  // 퀘스트 마커
  useEffect(() => {
    if (!mapReady) return;
    clearQuestMarkers();
    if (!activeQuest) return;

    const naver = window.naver;
    activeQuest.objectives.forEach((obj, i) => {
      const isCurrent = i === currentObjIndex;
      const isDone = i < currentObjIndex;
      const bg = isDone ? "#16A34A" : isCurrent ? "#1B3A6B" : "#FFFFFF";
      const textColor = isDone || isCurrent ? "#FFFFFF" : "#6B7280";
      const borderColor = isDone ? "#15803D" : isCurrent ? "#1B3A6B" : "#D1D5DB";
      const size = isCurrent ? 34 : 26;
      const label = isDone ? "✓" : (i + 1).toString();

      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(obj.lat, obj.lng),
        map: mapInstance.current,
        zIndex: 100,
        icon: {
          content: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid ${borderColor};box-shadow:0 2px 8px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${isCurrent ? 13 : 11}px;color:${textColor};cursor:pointer;font-family:system-ui,sans-serif;">${label}</div>`,
          anchor: new naver.maps.Point(size / 2, size / 2),
        },
      });

      naver.maps.Event.addListener(marker, "click", () => {
        setSelected({ id: obj.poiId, name: obj.poiName, category: "퀘스트 지점", source: "nightview", lat: obj.lat, lng: obj.lng, place: obj.hint, fee: "" } as POIItem);
        if (isMobile) setSidebarActiveTab(null);
      });
      questMarkersRef.current.push(marker);
    });

    const cur = activeQuest.objectives[currentObjIndex];
    if (cur) mapInstance.current?.panTo(new naver.maps.LatLng(cur.lat, cur.lng));
  }, [activeQuest, currentObjIndex, mapReady, clearQuestMarkers, isMobile]);

  // 테마 코스 마커 + 방향 화살표
  useEffect(() => {
    if (!mapReady) return;
    clearCourseOverlay();
    if (!activeCourse) return;

    const naver = window.naver;
    const path: NaverLatLng[] = [];

    // 테마 단일 색상(hue)의 명도 그라데이션 — 경유지 번호별로 채도·명도 차이로 구분
    const hexToHsl = (hex: string): [number, number, number] => {
      let h = hex.replace("#", "");
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      let hue = 0;
      let s = 0;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) hue = (b - r) / d + 2;
        else hue = (r - g) / d + 4;
        hue /= 6;
      }
      return [hue * 360, s * 100, l * 100];
    };
    const hslToHex = (h: number, s: number, l: number): string => {
      const sn = s / 100;
      const ln = l / 100;
      const k = (n: number) => (n + h / 30) % 12;
      const a = sn * Math.min(ln, 1 - ln);
      const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
      return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
    };
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    const [baseH, baseS] = hexToHsl(activeCourse.color);
    const stopCount = activeCourse.stops.length;
    // 테마 색을 중심으로 같은 계열 안에서 인접 색상으로만 살짝 회전시키고(예: 보라→파랑),
    // 명도를 함께 변화시켜 한 계열 그라데이션처럼 자연스럽게 이어지게 한다.
    const HUE_SPREAD = 55; // 코스 전체 색상 회전 폭(deg) — 좁게 둬 같은 계열 유지
    const segColor = (i: number) => {
      const p = stopCount > 1 ? i / (stopCount - 1) : 0; // 0(출발)~1(도착)
      const H = (baseH + HUE_SPREAD * (p - 0.5) + 360) % 360;
      const S = clamp(baseS + 18, 58, 88); // 채도 부스트 — 선명하게
      const L = clamp(62 - 24 * p, 38, 64); // 출발 밝게 → 도착 깊게: 그라데이션 깊이
      return hslToHex(H, S, L);
    };

    activeCourse.stops.forEach((stop, i) => {
      const isFirst = i === 0;
      const isLast = i === activeCourse.stops.length - 1;
      const size = isFirst || isLast ? 36 : 28;
      const bg = segColor(i);

      const latlng = new naver.maps.LatLng(stop.lat, stop.lng);
      path.push(latlng);

      const marker = new naver.maps.Marker({
        position: latlng,
        map: mapInstance.current,
        zIndex: 90,
        icon: {
          content: `<div style="
            width:${size}px;height:${size}px;border-radius:50%;
            background:${bg};
            border:3px solid #fff;
            box-shadow:0 2px 10px rgba(0,0,0,0.25);
            display:flex;align-items:center;justify-content:center;
            font-weight:700;font-size:${isFirst || isLast ? 14 : 12}px;
            color:#fff;cursor:pointer;
            font-family:system-ui,sans-serif;
          ">${i + 1}</div>`,
          anchor: new naver.maps.Point(size / 2, size / 2),
        },
      });

      naver.maps.Event.addListener(marker, "click", () => {
        setSelected({ id: `course_${i}`, name: stop.name, category: "테마 코스", source: "theme_course", lat: stop.lat, lng: stop.lng, place: stop.description, fee: stop.duration } as POIItem);
        if (isMobile) setSidebarActiveTab(null);
      });
      courseMarkersRef.current.push(marker);
    });


    // 지도 바운드 맞춤
    if (path.length > 1) {
      const bounds = new naver.maps.LatLngBounds(path[0], path[0]);
      path.forEach((p) => bounds.extend(p));
      mapInstance.current?.fitBounds(
        bounds,
        isMobile
          ? { top: 80, right: 32, bottom: 260, left: 32 }
          : { top: 60, right: 60, bottom: 60, left: 380 }
      );
    }

    // 실제 도보 경로 폴리라인 — 구간별 색상 + 진행 애니메이션 (OSRM walk)
    let cancelled = false;

    const bearing = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLng = toRad(bLng - aLng);
      const y = Math.sin(dLng) * Math.cos(toRad(bLat));
      const x =
        Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
        Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(dLng);
      return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
    };

    // 한 구간을 점진적으로 "그려지듯" 애니메이션 (ease-out)
    const animateSegment = (full: NaverLatLng[], color: string, opacity: number): Promise<void> =>
      new Promise((resolve) => {
        const poly = new naver.maps.Polyline({
          map: mapInstance.current,
          path: [full[0]],
          strokeColor: color,
          strokeOpacity: opacity,
          strokeWeight: 6,
          strokeLineCap: "round",
          strokeLineJoin: "round",
          zIndex: 80,
        }) as NaverOverlay & { setPath: (path: NaverLatLng[]) => void };
        coursePolylinesRef.current.push(poly);

        const DURATION = 600;
        const startT = performance.now();
        const step = (now: number) => {
          if (cancelled) return resolve();
          const t = Math.min(1, (now - startT) / DURATION);
          const eased = 1 - Math.pow(1 - t, 3);
          const count = Math.max(2, Math.round(eased * full.length));
          poly.setPath(full.slice(0, count));
          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            poly.setPath(full);
            resolve();
          }
        };
        requestAnimationFrame(step);
      });

    (async () => {
      // 사전 계산된 폴리라인(public/courses/routes/<id>.json)을 먼저 로드.
      // 있으면 런타임 라우팅 없이 저장된 좌표만 그린다.
      let precomputed: { mode: "walk" | "transit"; points: { lat: number; lng: number }[] }[] | null = null;
      try {
        const res = await fetch(`/courses/routes/${activeCourse.id}.json`);
        if (res.ok) precomputed = (await res.json()).segments ?? null;
      } catch {
        /* 사이드카 없으면 라이브 라우팅으로 폴백 */
      }
      if (cancelled) return;

      for (let i = 0; i < activeCourse.stops.length - 1; i++) {
        const a = activeCourse.stops[i];
        const b = activeCourse.stops[i + 1];

        let pts: { lat: number; lng: number }[] = precomputed?.[i]?.points ?? [];

        // 사전 계산본이 없을 때만 라이브 라우팅 호출(폴백)
        if (pts.length < 2) {
          try {
            const res = await fetch(
              `/api/transit/walk?fromLat=${a.lat}&fromLng=${a.lng}&toLat=${b.lat}&toLng=${b.lng}`
            );
            if (res.ok) pts = (await res.json()).points ?? [];
          } catch {
            /* 실패 시 직선 보간 폴백 */
          }
          if (cancelled) return;
        }

        const useFallback = pts.length < 2;
        if (useFallback) {
          // 직선도 부드럽게 그려지도록 보간점 생성
          const N = 24;
          pts = Array.from({ length: N + 1 }, (_, k) => ({
            lat: a.lat + (b.lat - a.lat) * (k / N),
            lng: a.lng + (b.lng - a.lng) * (k / N),
          }));
        }

        const color = segColor(i);
        const full = pts.map((p) => new naver.maps.LatLng(p.lat, p.lng));
        await animateSegment(full, color, useFallback ? 0.55 : 0.95);
        if (cancelled) return;

        // 그려진 구간 위에 흐르는 빛 입자 레이어 — 출발→도착 방향으로 계속 흐른다
        if (mapInstance.current) {
          courseFlowRef.current.push(
            new RouteFlowAnimator(
              naver as unknown as FlowNaverApi,
              mapInstance.current,
              pts,
              { color, zIndex: 85, size: 9, opacity: useFallback ? 0.7 : 1 },
            ),
          );
        }

        // 구간이 다 그려지면 진행 방향 화살표 표시
        const mid = full[Math.floor(full.length / 2)];
        const deg = bearing(a.lat, a.lng, b.lat, b.lng);
        const arrow = new naver.maps.Marker({
          position: mid,
          map: mapInstance.current,
          zIndex: 81,
          icon: {
            content: `<div style="transform:rotate(${deg}deg);display:flex;align-items:center;justify-content:center;width:18px;height:18px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 4l6 14-6-3-6 3z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
              </svg>
            </div>`,
            anchor: new naver.maps.Point(9, 9),
          },
        });
        courseArrowsRef.current.push(arrow);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCourse, mapReady, clearCourseOverlay, isMobile]);


  // 출발/목적지 마커
  useEffect(() => {
    if (!mapReady) return;
    const naver = window.naver;
    if (origin) {
      if (originMarkerRef.current) originMarkerRef.current.setMap(null);
      originMarkerRef.current = new naver.maps.Marker({
        position: new naver.maps.LatLng(origin.lat, origin.lng),
        map: mapInstance.current,
        icon: {
          content: `<div style="background:#16A34A;color:#fff;font-weight:700;font-size:10px;padding:3px 8px;border-radius:6px;border:2px solid #15803D;box-shadow:0 2px 6px rgba(0,0,0,0.2);font-family:system-ui,sans-serif;">출발</div>`,
          anchor: new naver.maps.Point(20, 12),
        },
      });
    }
    if (dest) {
      if (destMarkerRef.current) destMarkerRef.current.setMap(null);
      destMarkerRef.current = new naver.maps.Marker({
        position: new naver.maps.LatLng(dest.lat, dest.lng),
        map: mapInstance.current,
        icon: {
          content: `<div style="background:#DC2626;color:#fff;font-weight:700;font-size:10px;padding:3px 8px;border-radius:6px;border:2px solid #B91C1C;box-shadow:0 2px 6px rgba(0,0,0,0.2);font-family:system-ui,sans-serif;">도착</div>`,
          anchor: new naver.maps.Point(16, 12),
        },
      });
    }
  }, [origin, dest, mapReady]);

  // 사용자 현재 위치 마커 + GPS 정확도 원
  useEffect(() => {
    if (!mapReady || !userLocation) return;
    const naver = window.naver;
    const center = new naver.maps.LatLng(userLocation.lat, userLocation.lng);

    if (!userLocationMarkerRef.current) {
      userLocationMarkerRef.current = new naver.maps.Marker({
        position: center,
        map: mapInstance.current,
        zIndex: 120,
        icon: {
          content: `<div style="width:22px;height:22px;border-radius:50%;background:#DC2626;border:4px solid #fff;box-shadow:0 2px 10px rgba(220,38,38,0.45);position:relative;"><div style="position:absolute;left:50%;top:50%;width:8px;height:8px;border-radius:50%;background:#FCA5A5;transform:translate(-50%,-50%);"></div></div>`,
          anchor: new naver.maps.Point(11, 11),
        },
      });
    } else {
      userLocationMarkerRef.current.setPosition(center);
      userLocationMarkerRef.current.setMap(mapInstance.current);
    }

    const radius = Math.max(15, Math.min(userLocation.accuracy || 50, 1000));
    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = new naver.maps.Circle({
        map: mapInstance.current,
        center,
        radius,
        fillColor: "#DC2626",
        fillOpacity: 0.12,
        strokeColor: "#DC2626",
        strokeOpacity: 0.3,
        strokeWeight: 1,
      });
    } else {
      accuracyCircleRef.current.setCenter(center);
      accuracyCircleRef.current.setRadius(radius);
      accuracyCircleRef.current.setMap(mapInstance.current);
    }
  }, [mapReady, userLocation]);

  useEffect(() => {
    return () => {
      if (userLocationMarkerRef.current) userLocationMarkerRef.current.setMap(null);
      if (accuracyCircleRef.current) accuracyCircleRef.current.setMap(null);
      if (locationTimeoutRef.current) clearTimeout(locationTimeoutRef.current);
      courseFlowRef.current.forEach((f) => f.destroy());
      courseFlowRef.current = [];
      routeFlowRef.current.forEach((f) => f.destroy());
      routeFlowRef.current = [];
    };
  }, []);

  // 권역 오버레이: 필터 임계값과 동일한 직사각형으로 시각화

  const clearRouteOverlay = useCallback(() => {
    routePolylinesRef.current.forEach((l) => l.setMap(null));
    routePolylinesRef.current = [];
    routeFlowRef.current.forEach((f) => f.destroy());
    routeFlowRef.current = [];
    routeMarkersRef.current.forEach((m) => m.setMap(null));
    routeMarkersRef.current = [];
    if (originMarkerRef.current) { originMarkerRef.current.setMap(null); originMarkerRef.current = null; }
    if (destMarkerRef.current) { destMarkerRef.current.setMap(null); destMarkerRef.current = null; }
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
    setOrigin(null);
    setDest(null);
    setPresetOrigin(null);
    setPresetDest(null);
    routeCacheRef.current = { routePool: [], alternatives: [], selectedIdx: 0, status: "", stepArrivals: {} };
  }, []);

  const handleClearOrigin = useCallback(() => {
    setOrigin(null);
    setPresetOrigin(null);
    if (originMarkerRef.current) {
      originMarkerRef.current.setMap(null);
      originMarkerRef.current = null;
    }
  }, []);

  const handleClearDest = useCallback(() => {
    setDest(null);
    setPresetDest(null);
    if (destMarkerRef.current) {
      destMarkerRef.current.setMap(null);
      destMarkerRef.current = null;
    }
  }, []);

  const handleRouteFound = useCallback(async (payload: RouteDrawPayload) => {
    if (!mapInstance.current) return;
    clearRouteOverlay();
    const naver = window.naver;
    const { origin: org, destination: dst, route } = payload;
    const bounds = new naver.maps.LatLngBounds(
      new naver.maps.LatLng(org.lat, org.lng),
      new naver.maps.LatLng(org.lat, org.lng),
    );

    const addLine = (points: { lat: number; lng: number }[], color: string, weight: number, opacity: number, style?: "solid" | "dash") => {
      if (points.length < 2) return;
      const path = points.map((p) => new naver.maps.LatLng(p.lat, p.lng));
      routePolylinesRef.current.push(
        new naver.maps.Polyline({
          map: mapInstance.current,
          path,
          strokeColor: color,
          strokeWeight: weight,
          strokeOpacity: opacity,
          strokeLineCap: "round",
          strokeLineJoin: "round",
          strokeStyle: style ?? "solid"
        })
      );
      path.forEach((p) => bounds.extend(p));

      // 폴리라인 위에 진행 방향으로 흐르는 빛 입자 레이어를 얹는다.
      // 도보(dash)는 보조 경로이므로 더 작고 옅게, 대중교통은 또렷하게 흐른다.
      if (mapInstance.current) {
        const isDash = style === "dash";
        routeFlowRef.current.push(
          new RouteFlowAnimator(
            naver as unknown as FlowNaverApi,
            mapInstance.current,
            points,
            {
              color,
              zIndex: 95,
              size: isDash ? 6 : 7,
              opacity: isDash ? 0.8 : 1,
              spacingMeters: isDash ? 320 : 500,
            },
          ),
        );
      }
    };

    const addMarker = (
      lat: number,
      lng: number,
      html: string,
      options: { anchorX?: number; anchorY?: number; zIndex?: number } = {},
    ) => {
      const m = new naver.maps.Marker({
        map: mapInstance.current,
        position: new naver.maps.LatLng(lat, lng),
        zIndex: options.zIndex ?? 120,
        icon: {
          content: html,
          anchor: new naver.maps.Point(options.anchorX ?? 0, options.anchorY ?? 0),
        },
      });
      routeMarkersRef.current.push(m);
      bounds.extend(new naver.maps.LatLng(lat, lng));
    };

    const LINE_COLORS: Record<string, string> = {
      "1호선": "#0052A4", "2호선": "#00A84D", "3호선": "#EF7C1C", "4호선": "#00A5DE",
      "5호선": "#996CAC", "6호선": "#CD7C2F", "7호선": "#747F00", "8호선": "#E6186C",
      "9호선": "#BDB092", "경의중앙선": "#77C4A3", "공항철도": "#0090D2",
      "경춘선": "#0C8E72", "수인분당선": "#F5A200", "신분당선": "#D4003B",
      "우이신설선": "#B0CE18", "신림선": "#6789CA", "서해선": "#8FC31F",
      "김포골드라인": "#A17800", "인천1호선": "#7CA8D5", "인천2호선": "#ED8B00",
      "의정부경전철": "#FDA600", "용인경전철": "#509F22",
    };
    const normalizeLineName = (v: string) =>
      v.replace(/\s+/g, "").replace(/·/g, "").replace(/^(수도권|지하철)/, "").replace(/\(급행\)$/, "");
    const formatRouteColor = (color?: string) => {
      if (!color) return "";
      const hex = color.replace(/^#/, "").trim();
      return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : "";
    };
    const cleanBusRouteName = (name: string) =>
      (name.includes(":") ? name.split(":").at(-1)! : name).replace(/\s+/g, "");
    const routeLabel = (step: RouteDrawPayload["route"]["paths"][number]) => {
      if (step.mode === "bus") return `버스 ${cleanBusRouteName(step.lineName)}`;
      if (step.mode === "subway") return normalizeLineName(step.lineName);
      return "도보";
    };
    const transferLabel = (step: RouteDrawPayload["route"]["paths"][number]) => {
      if (step.mode === "bus") return `버스 ${cleanBusRouteName(step.lineName)} 환승`;
      if (step.mode === "subway") return `${normalizeLineName(step.lineName)} 환승`;
      return "환승";
    };
    const getBusColor = (name: string, type?: string) => {
      const routeName = cleanBusRouteName(name);
      if (type === "4" || type === "5" || type === "6" || /^M/i.test(routeName) || /^9\d{3}/.test(routeName) || /^2\d{3}/.test(routeName)) {
        return "#DC2626";
      }
      if (/^[가-힣]+[0-9-]+$/.test(routeName) || type === "2" || type === "12") {
        return "#16A34A";
      }
      return "#2563EB";
    };
    const getRouteColor = (step: RouteDrawPayload["route"]["paths"][number]) => {
      if (step.mode === "walk") return "#8a968e";
      if (step.mode === "subway") {
        return LINE_COLORS[normalizeLineName(step.lineName)] ?? (formatRouteColor(step.routeColor) || "#1d6a3a");
      }
      return getBusColor(step.lineName, step.busRouteType);
    };
    const markerHtml = (label: string, color: string, emphasis = false) => `
      <div style="
        background:${color};
        color:#fff;
        font-size:${emphasis ? 11 : 10}px;
        font-weight:800;
        padding:${emphasis ? "5px 11px" : "3px 8px"};
        border-radius:6px;
        border:2px solid rgba(0,0,0,0.18);
        box-shadow:0 2px 8px rgba(0,0,0,0.24);
        font-family:system-ui,sans-serif;
        white-space:nowrap;
        line-height:1.15;
      ">${label}</div>`;
    const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const toRad = (v: number) => (v * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 6371000 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    };
    const labelPointForStep = (
      step: RouteDrawPayload["route"]["paths"][number],
      pts: { lat: number; lng: number }[],
      isFirstTransit: boolean,
    ) => {
      const base = { lat: step.fromLat!, lng: step.fromLng! };
      if (!isFirstTransit || distanceMeters(base, org) > 90) return base;
      if (pts.length === 2) {
        return {
          lat: pts[0].lat + (pts[1].lat - pts[0].lat) * 0.12,
          lng: pts[0].lng + (pts[1].lng - pts[0].lng) * 0.12,
        };
      }
      return pts[Math.min(Math.max(2, Math.floor(pts.length * 0.12)), pts.length - 1)] ?? base;
    };

    const walkSegmentsToFetch: { from: { lat: number; lng: number }; to: { lat: number; lng: number } }[] = [];
    
    // 1. 첫 번째 도보 (출발지 -> 첫 대중교통 승차지)
    const firstStep = route.paths[0];
    if (firstStep && firstStep.fromLat != null && firstStep.fromLng != null) {
      walkSegmentsToFetch.push({ from: { lat: org.lat, lng: org.lng }, to: { lat: firstStep.fromLat, lng: firstStep.fromLng } });
    }
    
    // 2. 환승 도보 (하차지 -> 다음 승차지)
    for (let idx = 1; idx < route.paths.length; idx++) {
      const prevStep = route.paths[idx - 1];
      const nextStep = route.paths[idx];
      if (prevStep && nextStep && prevStep.toLat != null && prevStep.toLng != null && nextStep.fromLat != null && nextStep.fromLng != null) {
        walkSegmentsToFetch.push({
          from: { lat: prevStep.toLat, lng: prevStep.toLng },
          to: { lat: nextStep.fromLat, lng: nextStep.fromLng }
        });
      }
    }
    
    // 3. 마지막 도보 (마지막 하차지 -> 목적지)
    const lastStep = route.paths[route.paths.length - 1];
    if (lastStep && lastStep.toLat != null && lastStep.toLng != null) {
      walkSegmentsToFetch.push({ from: { lat: lastStep.toLat, lng: lastStep.toLng }, to: { lat: dst.lat, lng: dst.lng } });
    }

    const fetchWalkPoints = async (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
      const directDist = distanceMeters(from, to);
      if (directDist < 30) return [from, to];
      try {
        const params = new URLSearchParams({
          fromLat: String(from.lat),
          fromLng: String(from.lng),
          toLat: String(to.lat),
          toLng: String(to.lng)
        });
        const res = await fetch(`/api/transit/walk?${params}`);
        if (!res.ok) throw new Error("Walk fetch failed");
        const data = await res.json();
        if (Array.isArray(data.points) && data.points.length >= 2) {
          return data.points;
        }
      } catch (e) {
        console.warn("OSRM walk routing failed, using straight fallback:", e);
      }
      return [from, to];
    };

    // 모든 도보 노선의 실제 도로 선형 좌표를 병렬로 로드
    const fetchedWalkPoints = await Promise.all(
      walkSegmentsToFetch.map(seg => fetchWalkPoints(seg.from, seg.to))
    );

    let prev = { lat: org.lat, lng: org.lng };
    let transitStepCount = 0;
    for (let idx = 0; idx < route.paths.length; idx++) {
      const step = route.paths[idx];
      if (step.fromLat == null || step.fromLng == null) continue;

      // 단순 직선 대신 OSRM으로 추출한 보행자용 실제 골목 도로 선형 매핑
      const walkPoints = fetchedWalkPoints[idx] ?? [prev, { lat: step.fromLat, lng: step.fromLng }];
      addLine(walkPoints, "#8a968e", 3, 0.7, "dash");

      // 도보 이동 뱃지 추가 (도보 거리 40m 초과 시 중앙에 띄움)
      const midPoint = walkPoints[Math.floor(walkPoints.length / 2)];
      if (midPoint && distanceMeters(prev, { lat: step.fromLat, lng: step.fromLng }) > 40) {
        addMarker(midPoint.lat, midPoint.lng, markerHtml("도보 이동", "#8a968e"), {
          anchorX: 28,
          anchorY: 14,
          zIndex: 110,
        });
      }

      const color = getRouteColor(step);
      const routeShape = step.polyline ?? [];
      const hasRouteShape = routeShape.length >= 2;
      const pts: { lat: number; lng: number }[] = hasRouteShape
        ? routeShape
        : [{ lat: step.fromLat, lng: step.fromLng }, { lat: step.toLat!, lng: step.toLng! }];

      if (step.mode === "walk") {
        addLine(pts, color, 4, 0.75, "dash");
        addMarker(step.fromLat, step.fromLng, markerHtml("도보", color), { anchorX: 12, anchorY: 24, zIndex: 125 });
        prev = { lat: step.toLat ?? step.fromLat, lng: step.toLng ?? step.fromLng };
        continue;
      }

      addLine(pts, color, 4, 0.8);

      const prevTransitStep = [...route.paths.slice(0, idx)].reverse().find((s) => s.mode !== "walk");
      const isTransfer = !!prevTransitStep && prevTransitStep.lineName !== step.lineName;
      const isFirstTransit = transitStepCount === 0;
      const labelPoint = labelPointForStep(step, pts, isFirstTransit);
      transitStepCount += 1;

      let labelHtml = "";
      if (isTransfer) {
        labelHtml = markerHtml(transferLabel(step), color, true);
      } else {
        labelHtml = markerHtml(`${routeLabel(step)}${isFirstTransit ? " 탑승" : ""}`, color);
      }

      addMarker(labelPoint.lat, labelPoint.lng, labelHtml, {
        anchorX: isTransfer ? 18 : 10,
        anchorY: isTransfer ? 40 : 32,
        zIndex: isTransfer ? 170 : 135,
      });


      // 하차 마커 추가 (각 대중교통 하차 지점에 하차 뱃지 띄움)
      if (step.toLat != null && step.toLng != null) {
        const isLastTransit = idx === route.paths.length - 1;
        const formattedToName = step.toName.endsWith("역") || step.toName.endsWith("정류장") || step.toName.endsWith("정류소")
          ? step.toName
          : step.toName + (step.mode === "subway" ? "역" : " 정류장");
        const alightingLabel = isLastTransit ? `${formattedToName} 하차` : `${formattedToName} 하차 (환승)`;
        addMarker(step.toLat, step.toLng, markerHtml(alightingLabel, "#4B5563"), {
          anchorX: 30,
          anchorY: 14,
          zIndex: 140,
        });
      }

      prev = { lat: step.toLat ?? step.fromLat, lng: step.toLng ?? step.fromLng };
    }
    
    // 마지막 하차지 -> 목적지 구간 보행자 실제 골목 도로 선형 매핑
    const finalWalkPoints = fetchedWalkPoints[fetchedWalkPoints.length - 1] ?? [prev, { lat: dst.lat, lng: dst.lng }];
    addLine(finalWalkPoints, "#8a968e", 3, 0.7, "dash");

    // 최종 도보 이동 뱃지 추가
    const finalMidPoint = finalWalkPoints[Math.floor(finalWalkPoints.length / 2)];
    if (finalMidPoint && distanceMeters(prev, { lat: dst.lat, lng: dst.lng }) > 40) {
      addMarker(finalMidPoint.lat, finalMidPoint.lng, markerHtml("도보 이동", "#8a968e"), {
        anchorX: 28,
        anchorY: 14,
        zIndex: 110,
      });
    }

    addMarker(org.lat, org.lng, `<div style="background:#16A34A;color:#fff;font-weight:800;font-size:10px;padding:5px 9px;border-radius:6px;border:2px solid #15803D;box-shadow:0 2px 7px rgba(0,0,0,0.22);font-family:system-ui,sans-serif;white-space:nowrap;">출발</div>`, { anchorX: 40, anchorY: 8, zIndex: 190 });
    addMarker(dst.lat, dst.lng, `<div style="background:#DC2626;color:#fff;font-weight:800;font-size:10px;padding:5px 9px;border-radius:6px;border:2px solid #B91C1C;box-shadow:0 2px 7px rgba(0,0,0,0.22);font-family:system-ui,sans-serif;white-space:nowrap;">도착</div>`, { anchorX: 4, anchorY: 8, zIndex: 190 });

    setPresetOrigin({ label: org.label, lat: org.lat, lng: org.lng });
    setPresetDest({ label: dst.label, lat: dst.lat, lng: dst.lng });

    bounds.extend(new naver.maps.LatLng(dst.lat, dst.lng));
    mapInstance.current.fitBounds(
      bounds,
      isMobile
        ? { top: 80, right: 32, bottom: 300, left: 32 }
        : { top: 80, right: 80, bottom: 80, left: 460 }
    );
  }, [clearRouteOverlay, isMobile, setPresetOrigin, setPresetDest]);

  // 사이드바에서 POI 선택 → 지도 이동 + 카드 열기
  const handleSelectPOI = (poi: POIItem) => {
    setSelected(poi);
    if (isMobile) setSidebarActiveTab(null);
    if (mapInstance.current) {
      mapInstance.current.panTo(new window.naver.maps.LatLng(poi.lat, poi.lng));
      mapInstance.current.setZoom(15);
    }
  };

  // 테마 코스 선택 (지도에 동선 그리기 토글)
  const handleSelectCourse = (course: ThemeCourse) => {
    setActiveCourse((prev) => {
      if (prev?.id === course.id) {
        setSelected(null);
        return null;
      }
      return course;
    });
    if (isMobile) setSidebarActiveTab(null);
  };

  // 컬렉션 카드 클릭 → 우측 디테일 패널 열기 (좌측 사이드바는 유지)
  const handleOpenCourseDetail = (course: ThemeCourse) => {
    setDetailCourse(course);
  };

  // 디테일 패널의 경유지 클릭 → 지도 이동 + stop 카드
  const handleSelectCourseStop = (course: ThemeCourse, stopIndex: number) => {
    const s = course.stops[stopIndex];
    if (!s) return;
    if (activeCourse?.id !== course.id) setActiveCourse(course);
    setSelected({
      id: `course_${stopIndex}`,
      name: s.name,
      category: "테마 코스",
      source: "theme_course",
      lat: s.lat,
      lng: s.lng,
      place: s.description,
      fee: s.duration,
    } as POIItem);
    mapInstance.current?.panTo(new window.naver.maps.LatLng(s.lat, s.lng));
  };

  const handleToggleSaveCourse = (course: ThemeCourse) => {
    if (courseDrafts.some((d) => d.id === course.id)) removeDraft(course.id);
    else addDraft(course);
  };



  const handleFocusObjective = (i: number) => {
    if (!activeQuest) return;
    setCurrentObjIndex(i);
    const obj = activeQuest.objectives[i];
    if (obj) {
      mapInstance.current?.panTo(new window.naver.maps.LatLng(obj.lat, obj.lng));
      mapInstance.current?.setZoom(15);
    }
  };

  const isQuestTarget = (poi: POIItem | null): boolean => {
    if (!poi || !activeQuest) return false;
    const cur = activeQuest.objectives[currentObjIndex];
    return !!cur && Math.abs(cur.lat - poi.lat) < 0.0005 && Math.abs(cur.lng - poi.lng) < 0.0005;
  };

  const requestUserLocation = useCallback(() => {
    const map = mapInstance.current;
    if (!mapReady || !map) return;
    if (!("geolocation" in navigator)) {
      setLocationStatus("unavailable");
      setLocationMessage("이 브라우저에서는 위치 정보를 사용할 수 없습니다.");
      triggerMessageTimeout();
      return;
    }

    if (locationTimeoutRef.current) {
      clearTimeout(locationTimeoutRef.current);
    }
    setLocationStatus("requesting");
    setLocationMessage("현재 위치를 확인하는 중입니다.");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const nextLocation = {
          lat: latitude,
          lng: longitude,
          accuracy,
          updatedAt: Date.now(),
        };
        const latlng = new window.naver.maps.LatLng(nextLocation.lat, nextLocation.lng);

        setUserLocation(nextLocation);
        setLocationStatus("granted");
        setLocationMessage(`현재 위치를 표시했습니다. 오차 약 ${Math.round(accuracy)}m`);
        triggerMessageTimeout();

        map.panTo(latlng);
        map.setZoom(16);
      },
      (error) => {
        let msg = "위치 확인 시간이 초과되었습니다. 다시 시도해 주세요.";
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus("denied");
          msg = "위치 권한이 거부되었습니다. 브라우저 설정에서 위치 접근을 허용해 주세요.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationStatus("unavailable");
          msg = "현재 위치를 가져올 수 없습니다. GPS 또는 네트워크 상태를 확인해 주세요.";
        } else {
          setLocationStatus("error");
        }
        setLocationMessage(msg);
        triggerMessageTimeout();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }, [mapReady, triggerMessageTimeout]);

  const resolveUserLocationForRoute = useCallback(() => {
    if (userLocation) {
      return Promise.resolve(userLocation);
    }

    if (!("geolocation" in navigator)) {
      setLocationStatus("unavailable");
      setLocationMessage("이 브라우저에서는 위치 정보를 사용할 수 없습니다.");
      triggerMessageTimeout();
      return Promise.reject(new Error("Geolocation unavailable"));
    }

    if (locationTimeoutRef.current) {
      clearTimeout(locationTimeoutRef.current);
    }
    setLocationStatus("requesting");
    setLocationMessage("출발지 설정을 위해 현재 위치를 확인하는 중입니다.");

    return new Promise<UserLocation>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          const nextLocation = {
            lat: latitude,
            lng: longitude,
            accuracy,
            updatedAt: Date.now(),
          };

          setUserLocation(nextLocation);
          setLocationStatus("granted");
          setLocationMessage("현재 위치를 출발지로 설정했습니다.");
          triggerMessageTimeout();
          resolve(nextLocation);
        },
        (error) => {
          let msg = "현재 위치를 확인할 수 없어 목적지만 먼저 설정했습니다.";
          if (error.code === error.PERMISSION_DENIED) {
            setLocationStatus("denied");
            msg = "위치 권한이 거부되어 목적지만 먼저 설정했습니다.";
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            setLocationStatus("unavailable");
            msg = "현재 위치를 가져올 수 없어 목적지만 먼저 설정했습니다.";
          } else {
            setLocationStatus("error");
          }
          setLocationMessage(msg);
          triggerMessageTimeout();
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        }
      );
    });
  }, [triggerMessageTimeout, userLocation]);

  const setPlaceAsRouteDestination = useCallback(
    async (poi: POIItem) => {
      setPresetDest({ label: poi.name, lat: poi.lat, lng: poi.lng });
      setDest({ lat: poi.lat, lng: poi.lng });
      setSidebarActiveTab("route");
      setSelected(null);

      try {
        const currentLocation = await resolveUserLocationForRoute();
        setOrigin({ lat: currentLocation.lat, lng: currentLocation.lng });
        setPresetOrigin({ label: "내 위치", lat: currentLocation.lat, lng: currentLocation.lng });
      } catch {
        setPresetOrigin(null);
      }
    },
    [resolveUserLocationForRoute]
  );


  // 우클릭 컨텍스트 메뉴
  useEffect(() => {
    const map = mapInstance.current;
    if (!mapReady || !map || !mapRef.current) return;
    const mapDiv = mapRef.current;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const projection = map.getProjection();
      const coord = projection.fromPageXYToCoord(
        new window.naver.maps.Point(e.pageX, e.pageY)
      );
      setContextMenu({ x: e.clientX, y: e.clientY, lat: coord.lat(), lng: coord.lng() });
    };

    mapDiv.addEventListener("contextmenu", handleContextMenu);
    return () => mapDiv.removeEventListener("contextmenu", handleContextMenu);
  }, [mapReady]);

  function applyContextMenu(kind: "origin" | "dest", lat: number, lng: number) {
    setContextMenu(null);
    const fallbackLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const coords = new window.naver.maps.LatLng(lat, lng);
    window.naver.maps.Service.reverseGeocode(
      { coords, orders: [window.naver.maps.Service.OrderType.ADDR] },
      (_status: unknown, response: NaverReverseGeocodeResponse) => {
        const addr = getReverseGeocodeAddress(response, fallbackLabel);
        if (kind === "origin") {
          setOrigin({ lat, lng });
          setPresetOrigin({ label: addr, lat, lng });
        } else {
          setDest({ lat, lng });
          setPresetDest({ label: addr, lat, lng });
        }
      }
    );
  }

  return (
    <>
      <Script
        id="naver-maps"
        src={`https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}&submodules=geocoder`}
        strategy="afterInteractive"
        onLoad={handleNaverLoad}
      />

      <div className="relative w-full h-full bg-[#FFFBF0]">
        {/* 지도 */}
        <div className="absolute inset-0">
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
        </div>

        {/* 좌측 사이드바 */}
        <div className="hidden md:block">
          <Sidebar
            pois={poisData}
            onSelectPOI={handleSelectPOI}
            onOpenCourse={handleOpenCourseDetail}
            activeCourseId={activeCourse?.id ?? null}
            onRouteFound={handleRouteFound}
            onRouteClear={clearRouteOverlay}
            presetDest={presetDest}
            presetOrigin={presetOrigin}
            onClearOrigin={handleClearOrigin}
            onClearDest={handleClearDest}
            routeCacheRef={routeCacheRef}
            activeTab={sidebarActiveTab}
            onActiveTabChange={setSidebarActiveTab}
          />
        </div>

        <MobilePanel
          activeTab={sidebarActiveTab}
          pois={poisData}
          onClose={() => setSidebarActiveTab(null)}
          onSelectPOI={handleSelectPOI}
          onOpenCourse={handleOpenCourseDetail}
          activeCourseId={activeCourse?.id ?? null}
          onRouteFound={handleRouteFound}
          onRouteClear={clearRouteOverlay}
          presetDest={presetDest}
          presetOrigin={presetOrigin}
          onClearOrigin={handleClearOrigin}
          onClearDest={handleClearDest}
          routeCacheRef={routeCacheRef}
        />

        <MobileNavigation
          activeTab={sidebarActiveTab}
          onTabChange={setSidebarActiveTab}
        />

        <MobileMapControls
          showNight={showNight}
          activeCultureCategory={activeCultureCategory}
          locationStatus={locationStatus}
          onOpenTab={setSidebarActiveTab}
          onToggleNight={() => setShowNight((v) => !v)}
          onSelectCultureCategory={setActiveCultureCategory}
          onRequestLocation={requestUserLocation}
        />

        {/* 사이드바 옆 상단 레이어 토글 버튼 */}
        <div
          className="absolute top-3 z-20 flex items-start gap-2 max-md:hidden"
          style={{
            left: isMobile ? 12 : sidebarActiveTab ? 72 + 320 + 8 : 72 + 8,
            right: isMobile ? 12 : undefined,
            transition: "left 200ms ease-out",
          }}
        >
          <CultureSpeedDial
            activeCategory={activeCultureCategory}
            onSelectCategory={setActiveCultureCategory}
          />
          <button
            onClick={() => setShowNight((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold shadow-md border transition-all whitespace-nowrap ${
              showNight
                ? "bg-[#D97706] text-white border-[#B45309]"
                : "bg-white text-[#6B7280] border-[#FDECC8] hover:border-[#FE9C00] hover:text-[#FE9C00]"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ background: showNight ? "#fff" : "#fae633", border: `2px solid ${showNight ? "rgba(228, 202, 83, 0.89)" : "#fde409"}` }} />
            야경명소 위치
          </button>
          <button
            onClick={requestUserLocation}
            disabled={!mapReady || locationStatus === "requesting"}
            title="현재 위치로 이동"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold shadow-md border transition-all whitespace-nowrap disabled:opacity-60 ${
              locationStatus === "granted"
                ? "bg-[#DC2626] text-white border-[#B91C1C]"
                : "bg-white text-[#1B3A6B] border-[#FDECC8] hover:border-[#DC2626] hover:text-[#DC2626]"
            }`}
          >
            <span
              className="w-3 h-3 rounded-full inline-block shrink-0"
              style={{
                background: locationStatus === "granted" ? "#fff" : "#DC2626",
                border: `2px solid ${locationStatus === "granted" ? "rgba(255,255,255,0.55)" : "#FCA5A5"}`,
              }}
            />
            {locationStatus === "requesting" ? "위치 확인 중" : "내 위치"}
          </button>
        </div>

        {locationMessage && locationStatus !== "idle" && (
          <div
            className={`absolute z-20 rounded-xl border px-3 py-2 text-xs font-medium shadow-md max-w-[320px] ${
              locationStatus === "denied" || locationStatus === "unavailable" || locationStatus === "error"
                ? "bg-white text-[#B91C1C] border-[#FECACA]"
                : "bg-white text-[#1B3A6B] border-[#FECACA]"
            }`}
            style={{
              left: isMobile ? 12 : sidebarActiveTab ? 72 + 320 + 8 : 72 + 8,
              right: isMobile ? 12 : undefined,
              top: isMobile ? 108 : 60,
              transition: "left 200ms ease-out",
            }}
          >
            {locationMessage}
          </div>
        )}

        {/* 활성 퀘스트 트래커 */}
        {activeQuest && (
          <ActiveQuestTracker
            quest={activeQuest}
            currentIndex={currentObjIndex}
            onFocusObjective={handleFocusObjective}
            onAbandon={() => { setActiveQuest(null); setCurrentObjIndex(0); }}
          />
        )}

        {/* 장소 카드 */}
        {selected && selected.category === "테마 코스" && activeCourse ? (
          <CourseStopCard
            course={activeCourse}
            stop={activeCourse.stops[parseInt(selected.id.replace("course_", ""), 10)]}
            stopIndex={parseInt(selected.id.replace("course_", ""), 10)}
            onClose={() => setSelected(null)}
            onPrev={() => {
              const idx = parseInt(selected.id.replace("course_", ""), 10);
              if (idx > 0) {
                const s = activeCourse.stops[idx - 1];
                setSelected({ id: `course_${idx - 1}`, name: s.name, category: "테마 코스", source: "theme_course", lat: s.lat, lng: s.lng, place: s.description, fee: s.duration } as POIItem);
                mapInstance.current?.panTo(new window.naver.maps.LatLng(s.lat, s.lng));
              }
            }}
            onNext={() => {
              const idx = parseInt(selected.id.replace("course_", ""), 10);
              if (idx < activeCourse.stops.length - 1) {
                const s = activeCourse.stops[idx + 1];
                setSelected({ id: `course_${idx + 1}`, name: s.name, category: "테마 코스", source: "theme_course", lat: s.lat, lng: s.lng, place: s.description, fee: s.duration } as POIItem);
                mapInstance.current?.panTo(new window.naver.maps.LatLng(s.lat, s.lng));
              }
            }}
          />
        ) : selected ? (
          <PlaceCard
            poi={selected}
            isQuestTarget={isQuestTarget(selected)}
            onClose={() => setSelected(null)}
            onAskAI={() => { setAiAskingPOI(selected); setDetailCourse(null); }}
            onSetDest={() => {
              void setPlaceAsRouteDestination(selected);
            }}
          />
        ) : null}

        {/* AI 정보 패널 */}
        <AIInfoPanel poi={aiAskingPOI} onClose={() => setAiAskingPOI(null)} />

        {/* 코스 디테일 패널 (우측) */}
        {detailCourse && (
          <CourseDetailPanel
            course={detailCourse}
            isActive={activeCourse?.id === detailCourse.id}
            saved={courseDrafts.some((d) => d.id === detailCourse.id)}
            onClose={() => setDetailCourse(null)}
            onToggleStart={() => handleSelectCourse(detailCourse)}
            onToggleSave={() => handleToggleSaveCourse(detailCourse)}
            onSelectStop={(i) => handleSelectCourseStop(detailCourse, i)}
          />
        )}

        {/* 우클릭 컨텍스트 메뉴 */}
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
            <div
              className="fixed z-50 bg-white rounded-xl shadow-xl border border-[#E5E1D8] overflow-hidden"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                onClick={() => applyContextMenu("origin", contextMenu.lat, contextMenu.lng)}
                className="w-full px-4 py-2.5 text-[13px] text-left text-[#1A1E2E] hover:bg-[#F0FDF4] hover:text-[#16A34A] transition-colors font-medium"
              >
                출발지로 설정
              </button>
              <div className="h-px bg-[#F0EDE8]" />
              <button
                onClick={() => applyContextMenu("dest", contextMenu.lat, contextMenu.lng)}
                className="w-full px-4 py-2.5 text-[13px] text-left text-[#1A1E2E] hover:bg-[#FFF1F2] hover:text-[#DC2626] transition-colors font-medium"
              >
                목적지로 설정
              </button>
            </div>
          </>
        )}

        {/* 로딩 화면 */}
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center z-30 bg-[#FFFBF0]">
            <div className="text-center space-y-2">
              <div className="text-[#FE9C00] font-display tracking-[0.2em] text-sm animate-pulse">서울로 가는중</div>
              <div className="text-[#9CA3AF] text-xs">잠시만 기다려 주세요</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
