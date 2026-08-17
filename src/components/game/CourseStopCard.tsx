"use client";

import {
  CATEGORY_META,
  dayColor,
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
  /** 지도에서 코스 오버레이 자체를 걷는다 — 사이드바를 모두 닫은 상태의 유일한 탈출구 */
  onEndCourse: () => void;
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
  onEndCourse,
}: Props) {
  const { t, locale } = useLocale();
  const course = getCourseText(rawCourse, locale);
  const stop = course.stops[stopIndex] ?? rawStop;
  const raw = rawCourse.stops[stopIndex] ?? rawStop;
  const catMeta = CATEGORY_META[course.category];
  // 식사 슬롯은 지도 마커와 같은 앰버로, 멀티데이는 그 일차 색으로 — 마커/타임라인과 색이 이어진다
  const meal = isMealStop(raw);
  const accent = meal ? MEAL_COLOR : stop.day ? dayColor(stop.day) : course.color;
  const restaurants = stop.nearbyRestaurants ?? [];
  const hasNearby = restaurants.length > 0 || nearbyEvents.length > 0;
  const mealPlace = raw.mealPlace;
  const kindLabel = locale === "en" ? MEAL_KIND_LABEL_EN : MEAL_KIND_LABEL;
  const timeRange = raw.startTime && raw.endTime ? `${raw.startTime} – ${raw.endTime}` : null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[380px] max-w-[92vw] z-20 animate-fade-up max-md:bottom-[92px] max-md:w-[calc(100vw-40px)] max-md:max-w-[360px]">
      <div className="bg-white rounded-[24px] overflow-hidden border border-[#ECE8E0] shadow-[0_14px_40px_rgba(22,36,60,0.16)]">
        <div className="px-5 pt-5 pb-4">
          {/* 헤더 — 타임라인·지도 마커와 같은 번호 배지로 "몇 번째 장소"를 먼저 읽힌다 */}
          <div className="flex items-start gap-3.5">
            <StopBadge number={position + 1} accent={accent} meal={meal} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[11.5px] text-[#9A958A]">
                {stop.day ? (
                  <span className="font-bold" style={{ color: accent }}>
                    {stop.day}일차
                  </span>
                ) : (
                  <span className="truncate">{course.title}</span>
                )}
                <span className="text-[#DCD7CD]">·</span>
                <span className="shrink-0 tabular-nums">
                  {position + 1} / {total}
                </span>
              </div>
              <h3 className="text-[17px] font-bold text-[#16243C] leading-[1.25] tracking-[-0.01em] mt-1">
                {stop.name}
              </h3>
            </div>

            <button
              onClick={onClose}
              aria-label={t("common.close")}
              className="w-8 h-8 rounded-full bg-[#F4F2EC] hover:bg-[#ECE8E0] text-[#8B8678] hover:text-[#16243C] flex items-center justify-center shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16243C]/25"
            >
              <IconClose />
            </button>
          </div>

          {/* 메타 칩 — 분류 / 방문 시각 / 권장 체류 */}
          <div className="flex items-center gap-1.5 flex-wrap mt-3.5">
            {meal ? (
              <span
                className="text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1"
                style={{ background: MEAL_TINT, color: MEAL_COLOR_DEEP }}
              >
                <IconFork />
                {t("stopCard.meal")}
              </span>
            ) : (
              <span
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full text-[#16243C] bg-white border border-[#E4E0D8]"
              >
                {categoryLabel(catMeta.label, locale)}
              </span>
            )}
            {timeRange && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#F4F2EC] text-[#5C5950] inline-flex items-center gap-1 tabular-nums">
                <IconClock />
                {timeRange}
              </span>
            )}
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#F7F5F0] text-[#8B8678]">
              {t("stopCard.dwell", { d: stop.duration })}
            </span>
          </div>

          {/* 주변 정보 — 식사(AI 배정) + 주변 맛집 + 인근 문화 행사(서울로 API) */}
          <div className="mt-4 space-y-4 max-h-[40vh] overflow-y-auto thin-scroll -mr-1.5 pr-1.5">
            {/* 식사 슬롯 — 이 끼니에 배정된 식당 한 곳 */}
            {meal && (
              <section>
                <SectionLabel>{t("stopCard.meal")}</SectionLabel>
                {!mealPlace ? (
                  <p className="mt-2 text-[12.5px] text-[#9A958A] leading-[1.55]">
                    {t("courseDetail.mealNone")}
                  </p>
                ) : (
                  <div className="mt-2 rounded-2xl px-3.5 py-3" style={{ background: MEAL_TINT }}>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 text-white"
                        style={{ background: MEAL_COLOR }}
                      >
                        {kindLabel[mealPlace.kind] ?? mealPlace.kind}
                      </span>
                      <span className="text-[13.5px] font-semibold text-[#16243C] truncate">
                        {mealPlace.title}
                      </span>
                      {mealPlace.distKm != null && (
                        <span className="ml-auto text-[11px] text-[#A8A398] shrink-0 tabular-nums">
                          {mealPlace.distKm}km
                        </span>
                      )}
                    </div>
                    {mealPlace.summary && (
                      <p className="text-[12px] text-[#7C7870] mt-1.5 leading-[1.55] line-clamp-2">
                        {mealPlace.summary}
                      </p>
                    )}
                    {mealPlace.useTime && (
                      <p className="text-[11.5px] text-[#A8A398] mt-1 truncate">{mealPlace.useTime}</p>
                    )}
                  </div>
                )}
              </section>
            )}

            {restaurants.length > 0 && (
              <section>
                <SectionLabel count={restaurants.length}>{t("stopCard.food")}</SectionLabel>
                <ul className="mt-2 space-y-1.5">
                  {restaurants.map((r, i) => (
                    <li
                      key={i}
                      className="flex items-baseline justify-between gap-2 rounded-xl bg-[#FBFAF7] px-3 py-2"
                    >
                      <span className="text-[13px] text-[#5C5950] truncate">{r.title}</span>
                      {r.distKm != null && (
                        <span className="text-[11px] text-[#A8A398] shrink-0 tabular-nums">{r.distKm}km</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 식당을 못 찾은 식사 슬롯은 기준 좌표가 없어 "주변"을 말할 수 없다 → 섹션 자체를 숨긴다 */}
            {hasCoords(raw) && (
              <section>
                <SectionLabel count={nearbyEvents.length || undefined}>{t("stopCard.events")}</SectionLabel>
                {nearbyEvents.length === 0 ? (
                  <p className="mt-2 text-[12.5px] text-[#9A958A] leading-[1.55]">{t("stopCard.noEvents")}</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {nearbyEvents.map(({ poi, distKm }) => (
                      <li key={poi.id}>
                        <button
                          onClick={() => onSelectEvent(poi)}
                          className="w-full text-left rounded-xl border border-[#ECE8E0] bg-[#FBFAF7] px-3 py-2.5 transition-colors hover:border-[#D6D1C7] hover:bg-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16243C]/25"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[13px] font-semibold text-[#16243C] truncate">{poi.name}</span>
                            <span className="text-[11px] text-[#A8A398] shrink-0 tabular-nums">
                              {distKm.toFixed(1)}km
                            </span>
                          </div>
                          <p className="text-[11.5px] text-[#9A958A] truncate mt-0.5">
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
              <p className="text-[13px] text-[#5C5950] leading-[1.65]">{stop.description}</p>
            )}
          </div>
        </div>

        {/* 하단 액션 — 코스 이동(지금 보는 일차 안에서) + 코스 종료 */}
        <div className="px-5 pt-3.5 pb-4 bg-[#FBFAF7] border-t border-[#F0EDE6]">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onPrev}
              disabled={position === 0}
              className="h-11 rounded-2xl text-[13px] font-semibold transition-colors disabled:opacity-35 disabled:cursor-not-allowed bg-[#F4F2EC] text-[#5C5950] hover:bg-[#ECE8E0] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16243C]/25"
            >
              {t("stopCard.prev")}
            </button>
            <button
              onClick={onNext}
              disabled={position === total - 1}
              className="h-11 rounded-2xl text-[13px] font-bold text-white transition-all hover:opacity-95 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16243C]/25"
              style={{ background: accent, boxShadow: `0 5px 16px ${accent}33` }}
            >
              {t("stopCard.next")}
            </button>
          </div>

          {/* 코스 종료 — 사이드바를 다 닫고 지도에 코스만 남은 상태에서 여기서 빠져나간다 */}
          <button
            onClick={onEndCourse}
            className="mt-2 w-full h-11 rounded-2xl text-[13px] font-semibold text-[#8B8678] bg-white border border-[#E7E3DA] hover:text-[#B91C1C] hover:border-[#F3C9C9] hover:bg-[#FEF7F7] transition-colors flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]/25"
          >
            <IconStop />
            {t("stopCard.end")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 타임라인/지도 마커와 같은 번호 배지 — 식사 슬롯은 사각 + 포크 뱃지 */
function StopBadge({ number, accent, meal }: { number: number; accent: string; meal: boolean }) {
  if (meal) {
    return (
      <div
        className="w-9 h-9 rounded-[12px] flex items-center justify-center text-[14px] font-bold text-white shrink-0 shadow-sm relative"
        style={{ background: accent }}
      >
        {number}
        <span
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white flex items-center justify-center border"
          style={{ borderColor: MEAL_COLOR_DEEP, color: MEAL_COLOR_DEEP }}
          aria-hidden
        >
          <IconFork size={9} />
        </span>
      </div>
    );
  }
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0 shadow-sm"
      style={{ background: accent }}
    >
      {number}
    </div>
  );
}

function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-center gap-1.5 text-[12px] font-bold tracking-[0.04em] text-[#16243C]">
      {children}
      {count != null && <span className="text-[#B5B0A6] font-semibold tabular-nums">{count}</span>}
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
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconFork({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
      <path
        d="M6 3v7a2 2 0 0 0 4 0V3M8 12v9M18 3c-1.5 0-3 2-3 5s1 4 3 4v9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconStop() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
