"use client";

import {
  CATEGORY_META,
  hasCoords,
  isMealStop,
  MEAL_COLOR,
  MEAL_COLOR_DEEP,
  MEAL_TINT,
  type ThemeCourse,
  type CourseStop,
} from "@/data/themeCourses";
import { MEAL_KIND_LABEL, MEAL_KIND_LABEL_EN } from "@/lib/courseMeals";
import type { POIItem } from "@/app/api/poi/route";
import { useLocale } from "@/i18n/LocaleContext";
import { categoryLabel } from "@/i18n/enums";
import { getCourseText } from "@/i18n/courseText";

export interface NearbyEvent {
  poi: POIItem;
  distKm: number;
}

interface Props {
  course: ThemeCourse;
  stop: CourseStop;
  stopIndex: number;
  /** 지금 보는 이동 범위(멀티데이는 해당 일차) 안에서의 위치·총개수 */
  position: number;
  total: number;
  /** 이 장소 인근의 실시간 문화행사 (서울로 poi API, source==="culture") */
  nearbyEvents: NearbyEvent[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectEvent: (poi: POIItem) => void;
}

export default function CourseStopCard({
  course: rawCourse,
  stop: rawStop,
  stopIndex,
  position,
  total,
  nearbyEvents,
  onClose,
  onPrev,
  onNext,
  onSelectEvent,
}: Props) {
  const { t, locale } = useLocale();
  const course = getCourseText(rawCourse, locale);
  const stop = course.stops[stopIndex] ?? rawStop;
  const raw = rawCourse.stops[stopIndex] ?? rawStop;
  const catMeta = CATEGORY_META[course.category];
  // 식사 슬롯은 지도 마커와 같은 앰버로 통일 — 어떤 마커를 눌렀는지 카드에서 바로 이어진다
  const meal = isMealStop(raw);
  // 멀티데이면 그 일차 색, 아니면 코스 색으로 통일
  const accent = meal ? MEAL_COLOR : stop.day ? undefined : course.color;
  const restaurants = stop.nearbyRestaurants ?? [];
  const hasNearby = restaurants.length > 0 || nearbyEvents.length > 0;
  const mealPlace = raw.mealPlace;
  const kindLabel = locale === "en" ? MEAL_KIND_LABEL_EN : MEAL_KIND_LABEL;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[380px] max-w-[92vw] z-20 animate-fade-up max-md:bottom-[92px] max-md:w-[calc(100vw-40px)] max-md:max-w-[360px]">
      <div className="bg-white rounded-2xl overflow-hidden shadow-xl border border-[#E5E1D8]">
        {/* 상단 컬러 바 */}
        <div className="h-1 w-full" style={{ background: accent ?? course.color }} />

        <div className="p-4">
          {/* 헤더 */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {meal ? (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded border inline-flex items-center gap-1"
                    style={{ background: MEAL_TINT, color: MEAL_COLOR_DEEP, borderColor: `${MEAL_COLOR}55` }}
                  >
                    <IconFork />
                    식사
                  </span>
                ) : (
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
                    style={{ background: catMeta.bg, color: catMeta.color, borderColor: catMeta.border }}
                  >
                    {categoryLabel(catMeta.label, locale)}
                  </span>
                )}
                {stop.day ? (
                  <span className="text-[10px] text-[#9CA3AF]">{stop.day}일차</span>
                ) : (
                  <span className="text-[10px] text-[#9CA3AF] truncate">{course.title}</span>
                )}
              </div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <h3 className="text-[15px] font-bold text-[#1A1E2E] leading-snug">{stop.name}</h3>
                <span className="text-[10px] text-[#9CA3AF] shrink-0 tabular-nums">
                  {position + 1} / {total}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label={t("common.close")}
              className="w-7 h-7 rounded-lg bg-[#F5F2EC] hover:bg-[#E5E1D8] text-[#9CA3AF] hover:text-[#6B7280] flex items-center justify-center shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40"
            >
              <IconClose />
            </button>
          </div>

          {/* 체류 시간 (+ 시간표 코스는 방문 시각까지) */}
          <div className="flex items-center gap-1.5 mt-2.5">
            <IconClock />
            <span className="text-[11px] text-[#6B7280]">
              {raw.startTime && raw.endTime && (
                <span className="font-semibold tabular-nums text-[#374151]">
                  {raw.startTime} – {raw.endTime}
                  <span className="mx-1 text-[#D1D5DB]">·</span>
                </span>
              )}
              {t("stopCard.dwell", { d: stop.duration })}
            </span>
          </div>

          {/* 주변 정보 — 맛집(AI) + 인근 문화 행사(서울로 API) */}
          <div className="mt-3 space-y-3 max-h-[42vh] overflow-y-auto thin-scroll -mr-1 pr-1">
            {/* 식사 슬롯 — 이 끼니에 배정된 식당 한 곳 */}
            {meal && (
              <section>
                <SectionLabel icon={<IconFork />}>식사</SectionLabel>
                {!mealPlace ? (
                  <p className="mt-1.5 text-[11.5px] text-[#9CA3AF] leading-relaxed">
                    이 근처에서 문 연 식당을 찾지 못했어요. 시간만 비워둘게요.
                  </p>
                ) : (
                  <div
                    className="mt-1.5 rounded-lg border px-2.5 py-2"
                    style={{ background: MEAL_TINT, borderColor: `${MEAL_COLOR}66` }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[9.5px] font-bold px-1.5 py-0.5 rounded shrink-0 text-white"
                        style={{ background: MEAL_COLOR }}
                      >
                        {kindLabel[mealPlace.kind] ?? mealPlace.kind}
                      </span>
                      <span className="text-[12px] font-semibold text-[#1A1E2E] truncate">{mealPlace.title}</span>
                      {mealPlace.distKm != null && (
                        <span className="ml-auto text-[10px] text-[#9CA3AF] shrink-0 tabular-nums">
                          {mealPlace.distKm}km
                        </span>
                      )}
                    </div>
                    {mealPlace.summary && (
                      <p className="text-[10.5px] text-[#7C7870] mt-1 leading-[1.45] line-clamp-2">{mealPlace.summary}</p>
                    )}
                    {mealPlace.useTime && (
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5 truncate">{mealPlace.useTime}</p>
                    )}
                  </div>
                )}
              </section>
            )}

            {restaurants.length > 0 && (
              <section>
                <SectionLabel icon={<IconFork />}>주변 맛집</SectionLabel>
                <ul className="mt-1.5 space-y-1">
                  {restaurants.map((r, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2 text-[12px]">
                      <span className="text-[#374151] truncate">{r.title}</span>
                      {r.distKm != null && (
                        <span className="text-[10.5px] text-[#9CA3AF] shrink-0 tabular-nums">{r.distKm}km</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 식당을 못 찾은 식사 슬롯은 기준 좌표가 없어 "주변"을 말할 수 없다 → 섹션 자체를 숨긴다 */}
            {hasCoords(raw) && (
            <section>
              <SectionLabel icon={<IconCalendar />}>인근 문화 행사</SectionLabel>
              {nearbyEvents.length === 0 ? (
                <p className="mt-1.5 text-[11.5px] text-[#9CA3AF]">1km 안에서 진행 중인 문화 행사가 없어요.</p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {nearbyEvents.map(({ poi, distKm }) => (
                    <li key={poi.id}>
                      <button
                        onClick={() => onSelectEvent(poi)}
                        className="w-full text-left rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-[#F5F2EC] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[12px] font-medium text-[#374151] truncate">{poi.name}</span>
                          <span className="text-[10.5px] text-[#9CA3AF] shrink-0 tabular-nums">{distKm.toFixed(1)}km</span>
                        </div>
                        <p className="text-[10.5px] text-[#9CA3AF] truncate mt-0.5">
                          {[poi.place, poi.date].filter(Boolean).join(" · ")}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            )}

            {/* 주변 맛집 데이터가 없으면 장소 소개로 폴백 (테마코스 등) */}
            {!meal && !hasNearby && stop.description && (
              <p className="text-[12px] text-[#4B5563] leading-relaxed">{stop.description}</p>
            )}
          </div>

          {/* 코스 이동 버튼 (지금 보는 일차 안에서) */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={onPrev}
              disabled={position === 0}
              className="text-[12px] py-2.5 rounded-lg border font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-[#F5F2EC] border-[#E5E1D8] text-[#4B5563] hover:bg-[#E5E1D8] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40"
            >
              {t("stopCard.prev")}
            </button>
            <button
              onClick={onNext}
              disabled={position === total - 1}
              className="text-[12px] py-2.5 rounded-lg border font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-white hover:opacity-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40"
              style={{ background: accent ?? course.color, borderColor: accent ?? course.color }}
            >
              {t("stopCard.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#6B7280]">
      <span className="text-[#9CA3AF]">{icon}</span>
      {children}
    </div>
  );
}

// ── 아이콘 (SVG — 이모지 금지, stroke 통일) ────────────────────────────────
function IconClose() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[#9CA3AF]" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconFork() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 3v7a2 2 0 0 0 4 0V3M8 12v9M18 3c-1.5 0-3 2-3 5s1 4 3 4v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 9h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
