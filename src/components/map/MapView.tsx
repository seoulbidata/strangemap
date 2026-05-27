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
import Sidebar from "@/components/sidebar/Sidebar";
import CultureSpeedDial from "@/components/map/CultureSpeedDial";
import MobileNavigation, { type MobileTabId } from "@/components/mobile/MobileNavigation";
import MobilePanel from "@/components/mobile/MobilePanel";
import MobileMapControls from "@/components/mobile/MobileMapControls";
import type { RouteDrawPayload } from "@/components/sidebar/SearchRoadPanel";
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
      naver.maps.Event.addListener(marker, "click", () => setSelected(poi));
      cultureMarkersRef.current.push(marker);
    });
  }, [activeCultureCategory, mapReady]);

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
        naver.maps.Event.addListener(marker, "click", () => setSelected(poi));
        markersRef.current.push(marker);
      });
  }, [showNight, mapReady, clearMarkers]);

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

      naver.maps.Event.addListener(marker, "click", () =>
        setSelected({ id: obj.poiId, name: obj.poiName, category: "퀘스트 지점", source: "nightview", lat: obj.lat, lng: obj.lng, place: obj.hint, fee: "" } as POIItem)
      );
      questMarkersRef.current.push(marker);
    });

    const cur = activeQuest.objectives[currentObjIndex];
    if (cur) mapInstance.current?.panTo(new naver.maps.LatLng(cur.lat, cur.lng));
  }, [activeQuest, currentObjIndex, mapReady, clearQuestMarkers]);

  // 테마 코스 마커 + 방향 화살표
  useEffect(() => {
    if (!mapReady) return;
    clearCourseOverlay();
    if (!activeCourse) return;

    const naver = window.naver;
    const path: NaverLatLng[] = [];

    activeCourse.stops.forEach((stop, i) => {
      const isFirst = i === 0;
      const isLast = i === activeCourse.stops.length - 1;
      const size = isFirst || isLast ? 36 : 28;
      const bg = activeCourse.color;

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

      naver.maps.Event.addListener(marker, "click", () =>
        setSelected({ id: `course_${i}`, name: stop.name, category: "테마 코스", source: "nightview", lat: stop.lat, lng: stop.lng, place: stop.description, fee: stop.duration } as POIItem)
      );
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
    };
  }, []);

  // 권역 오버레이: 필터 임계값과 동일한 직사각형으로 시각화

  const clearRouteOverlay = useCallback(() => {
    routePolylinesRef.current.forEach((l) => l.setMap(null));
    routePolylinesRef.current = [];
    routeMarkersRef.current.forEach((m) => m.setMap(null));
    routeMarkersRef.current = [];
    if (originMarkerRef.current) { originMarkerRef.current.setMap(null); originMarkerRef.current = null; }
    if (destMarkerRef.current) { destMarkerRef.current.setMap(null); destMarkerRef.current = null; }
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
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

    const addLine = (points: { lat: number; lng: number }[], color: string, weight: number, opacity: number) => {
      if (points.length < 2) return;
      const path = points.map((p) => new naver.maps.LatLng(p.lat, p.lng));
      routePolylinesRef.current.push(
        new naver.maps.Polyline({ map: mapInstance.current, path, strokeColor: color, strokeWeight: weight, strokeOpacity: opacity, strokeLineCap: "round", strokeLineJoin: "round" })
      );
      path.forEach((p) => bounds.extend(p));
    };

    const addMarker = (lat: number, lng: number, html: string) => {
      const m = new naver.maps.Marker({
        map: mapInstance.current,
        position: new naver.maps.LatLng(lat, lng),
        icon: { content: html, anchor: new naver.maps.Point(0, 0) },
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
      v.replace(/\s+/g, "").replace(/·/g, "").replace(/^수도권/, "").replace(/\(급행\)$/, "");
    const formatRouteColor = (color?: string) => {
      if (!color) return "";
      const hex = color.replace(/^#/, "").trim();
      return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : "";
    };
    const cleanBusRouteName = (name: string) =>
      (name.includes(":") ? name.split(":").at(-1)! : name).replace(/\s+/g, "");
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

    let prev = { lat: org.lat, lng: org.lng };
    for (const step of route.paths) {
      if (step.fromLat == null || step.fromLng == null) continue;
      addLine([prev, { lat: step.fromLat, lng: step.fromLng }], "#8a968e", 3, 0.7);
      const color = getRouteColor(step);
      const routeShape = step.polyline ?? [];
      const hasRouteShape = routeShape.length >= 2;
      const pts: { lat: number; lng: number }[] = hasRouteShape
        ? routeShape
        : [{ lat: step.fromLat, lng: step.fromLng }, { lat: step.toLat!, lng: step.toLng! }];

      if (step.mode === "walk") {
        addLine(pts, color, 4, 0.75);
        prev = { lat: step.toLat ?? step.fromLat, lng: step.toLng ?? step.fromLng };
        continue;
      }

      if (step.mode === "subway") {
        if (!hasRouteShape) {
          prev = { lat: step.toLat ?? step.fromLat, lng: step.toLng ?? step.fromLng };
          continue;
        }
        addLine(pts, color, 4, 0.62);
      } else {
        addLine(pts, "#132018", 10, 0.18);
        addLine(pts, color, 8, 0.92);
      }
      const markerHtml = `<div style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:3px 7px;border-radius:8px;border:2px solid rgba(0,0,0,0.15);box-shadow:0 2px 6px rgba(0,0,0,0.2);font-family:system-ui,sans-serif;white-space:nowrap;">${step.mode === "subway" ? "지하철" : "버스"} ${step.lineName}</div>`;
      addMarker(step.fromLat, step.fromLng, markerHtml);
      prev = { lat: step.toLat ?? step.fromLat, lng: step.toLng ?? step.fromLng };
    }
    addLine([prev, { lat: dst.lat, lng: dst.lng }], "#8a968e", 3, 0.7);

    addMarker(org.lat, org.lng, `<div style="background:#16A34A;color:#fff;font-weight:700;font-size:10px;padding:3px 8px;border-radius:6px;border:2px solid #15803D;box-shadow:0 2px 6px rgba(0,0,0,0.2);font-family:system-ui,sans-serif;">출발</div>`);
    addMarker(dst.lat, dst.lng, `<div style="background:#DC2626;color:#fff;font-weight:700;font-size:10px;padding:3px 8px;border-radius:6px;border:2px solid #B91C1C;box-shadow:0 2px 6px rgba(0,0,0,0.2);font-family:system-ui,sans-serif;">도착</div>`);

    bounds.extend(new naver.maps.LatLng(dst.lat, dst.lng));
    mapInstance.current.fitBounds(
      bounds,
      isMobile
        ? { top: 80, right: 32, bottom: 300, left: 32 }
        : { top: 80, right: 80, bottom: 80, left: 460 }
    );
    if (isMobile) setSidebarActiveTab(null);
  }, [clearRouteOverlay, isMobile]);

  // 사이드바에서 POI 선택 → 지도 이동 + 카드 열기
  const handleSelectPOI = (poi: POIItem) => {
    setSelected(poi);
    if (isMobile) setSidebarActiveTab(null);
    if (mapInstance.current) {
      mapInstance.current.panTo(new window.naver.maps.LatLng(poi.lat, poi.lng));
      mapInstance.current.setZoom(15);
    }
  };

  // 테마 코스 선택
  const handleSelectCourse = (course: ThemeCourse) => {
    setActiveCourse((prev) => (prev?.id === course.id ? null : course));
    if (isMobile) setSidebarActiveTab(null);
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
            onSelectCourse={handleSelectCourse}
            activeCourseId={activeCourse?.id ?? null}
            onRouteFound={handleRouteFound}
            onRouteClear={clearRouteOverlay}
            presetDest={presetDest}
            presetOrigin={presetOrigin}
            activeTab={sidebarActiveTab}
            onActiveTabChange={setSidebarActiveTab}
          />
        </div>

        <MobilePanel
          activeTab={sidebarActiveTab}
          pois={poisData}
          onClose={() => setSidebarActiveTab(null)}
          onSelectPOI={handleSelectPOI}
          onSelectCourse={handleSelectCourse}
          activeCourseId={activeCourse?.id ?? null}
          onRouteFound={handleRouteFound}
          onRouteClear={clearRouteOverlay}
          presetDest={presetDest}
          presetOrigin={presetOrigin}
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
                setSelected({ id: `course_${idx - 1}`, name: s.name, category: "테마 코스", source: "nightview", lat: s.lat, lng: s.lng, place: s.description, fee: s.duration } as POIItem);
                mapInstance.current?.panTo(new window.naver.maps.LatLng(s.lat, s.lng));
              }
            }}
            onNext={() => {
              const idx = parseInt(selected.id.replace("course_", ""), 10);
              if (idx < activeCourse.stops.length - 1) {
                const s = activeCourse.stops[idx + 1];
                setSelected({ id: `course_${idx + 1}`, name: s.name, category: "테마 코스", source: "nightview", lat: s.lat, lng: s.lng, place: s.description, fee: s.duration } as POIItem);
                mapInstance.current?.panTo(new window.naver.maps.LatLng(s.lat, s.lng));
              }
            }}
          />
        ) : selected ? (
          <PlaceCard
            poi={selected}
            isQuestTarget={isQuestTarget(selected)}
            onClose={() => setSelected(null)}
            onAskAI={() => setAiAskingPOI(selected)}
            onSetDest={() => { setPresetDest({ label: selected.name, lat: selected.lat, lng: selected.lng }); setDest({ lat: selected.lat, lng: selected.lng }); setSelected(null); }}
          />
        ) : null}

        {/* AI 정보 패널 */}
        <AIInfoPanel poi={aiAskingPOI} onClose={() => setAiAskingPOI(null)} />

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
