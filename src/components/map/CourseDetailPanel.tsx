"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CATEGORY_META,
  dayColor,
  isMealStop,
  stopSlotType,
  MEAL_COLOR,
  MEAL_COLOR_DEEP,
  MEAL_TINT,
  type CourseCategory,
  type CourseStop,
  type MealPlace,
  type ThemeCourse,
} from "@/data/themeCourses";
import { courseLegs, MEAL_KIND_LABEL, MEAL_KIND_LABEL_EN, type CourseLeg } from "@/lib/courseMeals";
import { SEOUL_PLACES } from "@/lib/seoulPlaces";
import { isAIDraft } from "@/lib/aiCourseDraft";
import { courseHeroBackground } from "@/lib/courseImage";
import { useLocale, type Locale } from "@/i18n/LocaleContext";
import { categoryLabel, chipLabel, congestionLabel, difficultyLabel, ADTAG_EN } from "@/i18n/enums";
import { getCourseText } from "@/i18n/courseText";

interface Props {
  course: ThemeCourse;
  /** 현재 지도에 그려진(진행 중) 코스인지 */
  isActive: boolean;
  /** 내 코스(저장)에 담겨있는지 */
  saved: boolean;
  /** 멀티데이 코스에서 보고 있는 일차 (1부터). 지도와 공유. */
  selectedDay?: number;
  onSelectDay?: (day: number) => void;
  onClose: () => void;
  onToggleStart: () => void;
  onToggleSave: () => void;
  onSelectStop: (stopIndex: number) => void;
}

type CongestionLevel = "여유" | "보통" | "약간 붐빔" | "붐빔" | "매우 붐빔";

const CONGESTION_STYLE: Record<string, { bg: string; text: string }> = {
  "여유": { bg: "#ECFDF3", text: "#15803D" },
  "보통": { bg: "#FEF6E7", text: "#B45309" },
  "약간 붐빔": { bg: "#FFF3EA", text: "#C2410C" },
  "붐빔": { bg: "#FEF0F0", text: "#DC2626" },
  "매우 붐빔": { bg: "#FDECEC", text: "#B91C1C" },
};

function areaNameFor(stopName: string): string | null {
  const p =
    SEOUL_PLACES.find((x) => x.displayName === stopName || x.areaName === stopName) ??
    SEOUL_PLACES.find((x) => stopName.includes(x.displayName) || x.displayName.includes(stopName));
  return p?.areaName ?? null;
}

// 방문 시각 "19:00" → ko "19시" / en "19:00" (예상 혼잡도 라벨 시각 표기용)
function hourLabel(hhmm: string | undefined, locale: string): string | null {
  if (!hhmm) return null;
  const h = parseInt(hhmm.split(":")[0], 10);
  if (Number.isNaN(h)) return null;
  return locale === "en" ? `${String(h).padStart(2, "0")}:00` : `${h}시`;
}

export default function CourseDetailPanel({
  course: rawCourse,
  isActive,
  saved,
  selectedDay,
  onSelectDay,
  onClose,
  onToggleStart,
  onToggleSave,
  onSelectStop,
}: Props) {
  const { t, locale } = useLocale();
  // 표시는 로케일 병합본, 혼잡도 매칭 등 로직은 한글 원본(rawCourse) 기준
  const course = getCourseText(rawCourse, locale);
  const catMeta = CATEGORY_META[course.category as CourseCategory];
  const ai = isAIDraft(course);

  // 멀티데이 코스: 일차 선택으로 한 번에 한 일차만 본다 (지도와 동일한 selectedDay 공유)
  const days = rawCourse.days ?? 1;
  const isMulti = days > 1;
  const curDay = selectedDay ?? 1;
  const lineColor = isMulti ? dayColor(curDay) : course.color;
  // 현재 표시할 스톱의 (원본 배열 기준) 인덱스 목록 — 지도 마커/onSelectStop과 인덱스를 맞춘다.
  // stops[] 는 이미 방문 순서다 — 여기서 절대 재정렬하지 않는다 (서버가 순서의 단일 소유자).
  const visibleIdxs = course.stops
    .map((_, i) => i)
    .filter((i) => !isMulti || (rawCourse.stops[i]?.day ?? 1) === curDay);
  // 시간표에 앉은 슬롯(장소·식사)과 못 앉은 자유 방문 제안(flex)을 분리해 보여준다
  const timedIdxs = visibleIdxs.filter((i) => stopSlotType(rawCourse.stops[i]) !== "flex");
  const flexIdxs = visibleIdxs.filter((i) => stopSlotType(rawCourse.stops[i]) === "flex");
  // 구간 이동 — 서버 travel_min 은 장소→장소 기준이라 식사가 끼면 프론트가 다시 잰다(courseLegs 주석)
  const legs = useMemo(() => courseLegs(rawCourse.stops), [rawCourse.stops]);
  const mealCount = rawCourse.stops.filter(isMealStop).length;
  const kindLabel = locale === "en" ? MEAL_KIND_LABEL_EN : MEAL_KIND_LABEL;

  // 혼잡도는 스탑 index로 보관 — 영문 모드에서도 한글 원본 name으로 매칭한다
  const [congestion, setCongestion] = useState<Record<number, CongestionLevel>>({});

  useEffect(() => {
    // AI 코스는 lewisai가 실어준 '방문 시각 예상 혼잡도(예보)'를 쓰므로 실시간 재조회하지 않는다.
    // (미래에 방문할 코스라 지금의 실시간 값은 의미가 없다 — 예보가 맞는 값)
    if (ai) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/places/congestion");
        if (!res.ok) return;
        const map = (await res.json()) as Record<string, { level: CongestionLevel }>;
        if (cancelled) return;
        const next: Record<number, CongestionLevel> = {};
        rawCourse.stops.forEach((s, i) => {
          const area = areaNameFor(s.name);
          if (area && map[area]) next[i] = map[area].level;
        });
        setCongestion(next);
      } catch {
        /* 혼잡도 없으면 뱃지 생략 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rawCourse, ai]);

  return (
    <div className="fixed z-30 bg-white flex flex-col inset-0 md:inset-y-0 md:right-0 md:left-auto md:w-[440px] shadow-[-12px_0_40px_rgba(20,30,50,0.12)] animate-slide-in pointer-events-auto">
      {/* 히어로 (이미지 → 없으면 테마 그라데이션) */}
      <div
        className="relative h-56 shrink-0 bg-center bg-cover"
        style={{ backgroundImage: courseHeroBackground(course, "detail") }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/85 backdrop-blur-sm hover:bg-white text-[#16243C] flex items-center justify-center shadow-sm transition-colors"
          aria-label={t("common.close")}
        >
          ✕
        </button>
        {/* 목적 칩이 3개까지 붙으므로 줄바꿈 허용 + 우상단 닫기 버튼 자리를 비워 둔다 */}
        <div className="absolute top-4 left-5 right-16 flex flex-wrap items-center gap-1.5">
          {/*
            AI 코스는 카테고리 뱃지 대신 사용자가 고른 목적 칩을 그대로, 고른 순서로 최대 3개.
            파스텔 히어로 위에서는 반투명 흰 알약이 묻혀 윤곽을 잃는다 → 불투명 흰색 + 헤어라인.
          */}
          {ai && course.purposes?.length ? (
            course.purposes.slice(0, 3).map((p) => (
              <span
                key={p}
                className="text-[11px] font-semibold px-3 py-1 rounded-full text-[#16243C] bg-white border border-[#E4E0D8]"
              >
                {chipLabel(p, locale)}
              </span>
            ))
          ) : (
            <span
              className={`text-[11px] font-semibold px-3 py-1 rounded-full text-[#16243C] ${
                ai ? "bg-white border border-[#E4E0D8]" : "bg-white/85 backdrop-blur-sm"
              }`}
            >
              {categoryLabel(catMeta.label, locale)}
            </span>
          )}
          {ai && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#2563EB] text-white flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-white" /> {t("courseDetail.aiGenerated")}
            </span>
          )}
        </div>

        {/* 히어로 위 타이틀 — AI 코스 히어로는 파스텔 단색(밝음)이라 글자를 어두운 색으로 뒤집는다 */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-5">
          <h2
            className={`text-[27px] font-bold leading-[1.15] tracking-[-0.015em] ${
              ai ? "text-[#16243C]" : "text-white drop-shadow-sm"
            }`}
          >
            {course.title}
          </h2>
          <p className={`text-[14px] mt-1.5 ${ai ? "text-[#5C5950]" : "text-white/85"}`}>{course.subtitle}</p>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto thin-scroll">
        {/* 요약 스탯 */}
        <div className="px-6 pt-6">
          <div className="flex items-stretch rounded-2xl bg-[#F7F5F0]">
            <Stat label={t("courseDetail.stat.distance")} value={course.distance} />
            <Divider />
            <Stat label={t("courseDetail.stat.duration")} value={course.totalDuration} />
            <Divider />
            <Stat label={t("courseDetail.stat.difficulty")} value={difficultyLabel(course.difficulty, locale)} />
          </div>

          {course.description && (
            <p className="text-[15px] text-[#5C5950] leading-[1.65] mt-5">{course.description}</p>
          )}
        </div>

        {/* 체크포인트 타임라인 */}
        <div className="px-6 pt-7 pb-6">
          {/* 멀티데이: 일차 선택 — 한 번에 한 일차만 표시 (지도도 함께 그 일차로) */}
          {isMulti && (
            <div className="mb-5">
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: days }, (_, k) => k + 1).map((d) => {
                  const on = d === curDay;
                  return (
                    <button
                      key={d}
                      onClick={() => onSelectDay?.(d)}
                      className="px-3.5 py-2 rounded-full text-[12.5px] font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                      style={
                        on
                          ? { background: dayColor(d), color: "#fff", boxShadow: `0 3px 10px ${dayColor(d)}44` }
                          : { background: "#F4F2EC", color: "#8B8678" }
                      }
                    >
                      {d}일차
                    </button>
                  );
                })}
              </div>
              {rawCourse.dayAreas?.[curDay] && (
                <p className="mt-2.5 text-[12.5px] text-[#9A958A]">
                  <span className="font-semibold" style={{ color: lineColor }}>{curDay}일차</span> · {rawCourse.dayAreas[curDay]}
                </p>
              )}
              {/* 일차별 설명 — 선택한 일차 탭에 맞춰 그 날의 흐름만 보여준다 */}
              {rawCourse.dayDescriptions?.[curDay] && (
                <p className="mt-3 text-[14px] text-[#5C5950] leading-[1.65]">
                  {rawCourse.dayDescriptions[curDay]}
                </p>
              )}
            </div>
          )}

          <h3 className="text-[13px] font-bold tracking-[0.04em] text-[#16243C] mb-4 flex items-center gap-2">
            {t("courseDetail.checkpoints")}{" "}
            <span className="text-[#B5B0A6] font-semibold">
              {timedIdxs.filter((i) => !isMealStop(rawCourse.stops[i])).length}
            </span>
            {/* 식사 슬롯은 "장소 수"가 아니라 별도 축이라 따로 센다 */}
            {mealCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: MEAL_TINT, color: MEAL_COLOR_DEEP }}
              >
                <IconFork className="w-3 h-3" />
                {t("courseDetail.mealCount", { n: String(mealCount) })}
              </span>
            )}
          </h3>

          <div>
            {timedIdxs.map((i, pos) => (
              <TimelineRow
                key={i}
                stop={course.stops[i]}
                raw={rawCourse.stops[i]}
                index={i}
                // 번호는 시간표에 앉은 슬롯 기준 — 지도 마커 번호와 같은 규칙 (flex는 번호 없음)
                number={pos + 1}
                leg={legs[i]}
                isLast={pos === timedIdxs.length - 1}
                lineColor={lineColor}
                courseColor={course.color}
                ai={ai}
                locale={locale}
                t={t}
                kindLabel={kindLabel}
                realtimeLevel={congestion[i]}
                onSelectStop={onSelectStop}
              />
            ))}
          </div>

          {/* 시간표에 못 앉힌 자유 방문 제안 — 시각이 없으므로 위 타임라인과 분리해 보여준다 */}
          {flexIdxs.length > 0 && (
            <div className="mt-6 pt-5 border-t border-dashed border-[#E7E3DA]">
              <h3 className="text-[13px] font-bold tracking-[0.04em] text-[#16243C]">
                {t("courseDetail.flexTitle")} <span className="text-[#B5B0A6] font-semibold">{flexIdxs.length}</span>
              </h3>
              <p className="mt-1 text-[12px] text-[#9A958A] leading-relaxed">{t("courseDetail.flexHint")}</p>
              <div className="mt-3 space-y-2">
                {flexIdxs.map((i) => {
                  const stop = course.stops[i];
                  const raw = rawCourse.stops[i];
                  return (
                    <button
                      key={i}
                      onClick={() => onSelectStop(i)}
                      className="w-full text-left rounded-2xl border border-[#ECE8E0] bg-[#FBFAF7] px-3.5 py-3 transition-colors hover:border-[#D6D1C7] hover:bg-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[14.5px] font-semibold text-[#16243C] truncate">{stop.name}</p>
                        <span className="text-[11.5px] text-[#A8A398] shrink-0">{stop.duration}</span>
                      </div>
                      {stop.description && (
                        <p className="text-[12.5px] text-[#7C7870] mt-1 leading-[1.55] line-clamp-2">{stop.description}</p>
                      )}
                      {ai && raw?.reason && (
                        <p className="text-[12px] mt-1.5 text-[#8B8678] leading-[1.5] line-clamp-2">{raw.reason}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 하단 액션 */}
      <div className="shrink-0 px-5 py-4 flex items-center gap-3 bg-white shadow-[0_-8px_24px_rgba(20,30,50,0.06)]">
        <button
          onClick={onToggleSave}
          className={`shrink-0 h-12 px-4 rounded-2xl text-[14px] font-semibold transition-colors flex items-center gap-2 ${saved ? "bg-[#EEF3FF] text-[#2563EB]" : "bg-[#F4F2EC] text-[#5C5950] hover:bg-[#ECE8E0]"
            }`}
        >
          <BookmarkIcon className="w-4 h-4" filled={saved} />
          {saved ? t("courseDetail.saved") : t("courseDetail.save")}
        </button>
        <button
          onClick={onToggleStart}
          className={`flex-1 h-12 rounded-2xl text-[15px] font-bold text-white transition-all hover:opacity-95 shadow-[0_6px_20px_rgba(22,36,60,0.22)] ${isActive ? "bg-[#3A4860]" : "bg-[#16243C]"
            }`}
        >
          {isActive ? t("courseDetail.end") : t("courseDetail.view")}
        </button>
      </div>
    </div>
  );
}


function TimelineRow({
  stop, raw, index, number, leg, isLast, lineColor, courseColor, ai, locale, t,
  kindLabel, realtimeLevel, onSelectStop,
}: {
  stop: CourseStop;
  raw: CourseStop | undefined;
  index: number;
  number: number;
  leg: CourseLeg | null;
  isLast: boolean;
  lineColor: string;
  courseColor: string;
  ai: boolean;
  locale: Locale;
  t: ReturnType<typeof useLocale>["t"];
  kindLabel: Record<string, string>;
  realtimeLevel?: CongestionLevel;
  onSelectStop: (i: number) => void;
}) {
  const meal = isMealStop(raw ?? stop);
  const accent = meal ? MEAL_COLOR : lineColor;
  // AI 코스: 방문 시각 예상 혼잡도(예보) 우선. 없으면(테마코스) 실시간 조회값.
  const forecastLevel = raw?.congestion;
  const level = (forecastLevel ?? realtimeLevel) as CongestionLevel | undefined;
  const cStyle = level ? CONGESTION_STYLE[level] : null;
  const forecastHour = forecastLevel ? hourLabel(raw?.startTime, locale) : null;
  // 시간표 코스의 방문 슬롯 — 혼잡도 유무와 무관하게 항상 보여준다.
  const timeRange = raw?.startTime ? (raw.endTime ? `${raw.startTime} – ${raw.endTime}` : raw.startTime) : null;
  const reason = raw?.reason;
  const activities = raw?.activities ?? [];
  const mealPlace = raw?.mealPlace;

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center shrink-0">
        {meal ? (
          <div
            className="w-7 h-7 rounded-[9px] flex items-center justify-center text-[12px] font-bold text-white shrink-0 shadow-sm relative"
            style={{ background: accent }}
          >
            {number}
            <span
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center border"
              style={{ borderColor: MEAL_COLOR_DEEP }}
              aria-hidden
            >
              <IconFork className="w-2 h-2" style={{ color: MEAL_COLOR_DEEP }} />
            </span>
          </div>
        ) : (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0 shadow-sm"
            style={{ background: accent }}
          >
            {number}
          </div>
        )}
        {!isLast && (
          <div className="w-[2px] flex-1 my-1.5 rounded-full" style={{ background: `${accent}26`, minHeight: 34 }} />
        )}
      </div>

      <div className={`flex-1 min-w-0 ${isLast ? "pb-1" : "pb-6"}`}>
        {/* 직전 스톱에서 여기까지의 이동 — 시간표 코스에서만 값이 있다 */}
        {leg && (
          <p className="text-[11px] text-[#A8A398] mb-1.5 flex items-center gap-1">
            {leg.mode === "walk" ? <IconWalk /> : <IconTransit />}
            {t(leg.mode === "walk" ? "courseDetail.legWalk" : "courseDetail.legTransit", { n: String(leg.min) })}
          </p>
        )}
        {timeRange && (
          <p className="text-[11.5px] font-bold tabular-nums mb-0.5" style={{ color: accent }}>
            {timeRange}
          </p>
        )}
        <button onClick={() => onSelectStop(index)} className="w-full text-left group cursor-pointer">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[16px] font-semibold text-[#16243C] group-hover:text-[#2563EB] transition-colors flex items-center gap-1.5 min-w-0">
              <span className="truncate">{stop.name}</span>
              {stop.adTag && (
                <span
                  title={stop.adTag.disclosure}
                  className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
                  style={{ background: courseColor }}
                >
                  {locale === "en" ? ADTAG_EN[stop.adTag.label] ?? stop.adTag.label : stop.adTag.label}
                </span>
              )}
            </p>
            <span className="text-[12px] font-medium text-[#A8A398] shrink-0">{stop.duration}</span>
          </div>
          {stop.description && <p className="text-[14px] text-[#7C7870] mt-1.5 leading-[1.6]">{stop.description}</p>}
          {/* AI 코스: 선정 이유 + 여기서 할 일 (업그레이드된 상세) */}
          {ai && reason && (
            <p className="text-[13px] mt-2 leading-[1.55] flex gap-1.5">
              <span className="font-bold text-[#2563EB] shrink-0">추천 이유</span>
              <span className="text-[#5C5950]">{reason}</span>
            </p>
          )}
          {ai && activities.length > 0 && (
            <p className="text-[12.5px] mt-1.5 leading-[1.5] flex gap-1.5">
              <span className="font-bold text-[#2563EB] shrink-0">추천 행동</span>
              <span className="text-[#8B8678]">{activities.join(" · ")}</span>
            </p>
          )}
          {cStyle && level && (
            <span
              className="inline-flex items-center gap-1.5 mt-2.5 text-[12px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: cStyle.bg, color: cStyle.text }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: cStyle.text }} />
              {forecastHour
                ? t("courseDetail.forecast", { time: forecastHour, level: congestionLabel(level, locale) })
                : t("courseDetail.realtime", { level: congestionLabel(level, locale) })}
            </span>
          )}
        </button>

        {/* 식사 슬롯 — 이 끼니에 배정된 식당 한 곳 */}
        {meal && (
          <div className="mt-2.5">
            {mealPlace ? (
              <MealPlaceCard place={mealPlace} kindLabel={kindLabel} />
            ) : (
              <p
                className="text-[12.5px] leading-relaxed rounded-xl px-3 py-2.5"
                style={{ background: MEAL_TINT, color: MEAL_COLOR_DEEP }}
              >
                {t("courseDetail.mealNone")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 이 끼니의 식당 카드 — 이름·요약·거리·영업시간·종류 배지. (고르는 UI 없이 확정된 한 곳) */
function MealPlaceCard({ place, kindLabel }: { place: MealPlace; kindLabel: Record<string, string> }) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{ background: MEAL_TINT, borderColor: `${MEAL_COLOR}66` }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 text-white"
          style={{ background: MEAL_COLOR }}
        >
          {kindLabel[place.kind] ?? place.kind}
        </span>
        <span className="text-[13.5px] font-semibold text-[#16243C] truncate">{place.title}</span>
      </div>
      {place.summary && (
        <p className="text-[11.5px] text-[#7C7870] mt-1 leading-[1.5] line-clamp-2">{place.summary}</p>
      )}
      <p className="text-[10.5px] text-[#A8A398] mt-1 tabular-nums flex flex-wrap items-center gap-x-1.5">
        {place.distKm != null && <span>{place.distKm}km</span>}
        {place.distKm != null && place.useTime && <span className="text-[#E0DBD1]">·</span>}
        {place.useTime && <span className="truncate">{place.useTime}</span>}
      </p>
      {place.address && <p className="text-[10.5px] text-[#B5B0A6] mt-0.5 truncate">{place.address}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 px-2 py-4 text-center">
      <p className="text-[16px] font-bold text-[#16243C] leading-tight">{value}</p>
      <p className="text-[12px] text-[#9A958A] mt-1">{label}</p>
    </div>
  );
}

function Divider() {
  return <div className="w-px my-3 bg-[#E7E3DA]" />;
}

// ── 아이콘 (SVG — 색맹 대비로 색뿐 아니라 모양으로도 구분되게) ─────────────────
function IconFork({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 3v7a2 2 0 0 0 4 0V3M8 12v9M18 3c-1.5 0-3 2-3 5s1 4 3 4v9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconWalk() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
      <circle cx="13" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 21l2.5-5.5L9.5 12l-.5-3.5 4-1 2.5 3 2.5 1.2M11.5 15.5L15 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconTransit() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
      <rect x="5" y="3.5" width="14" height="13" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 11h14M8.5 20l-1.5 1.5M15.5 20l1.5 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="14" r="1" fill="currentColor" />
      <circle cx="15" cy="14" r="1" fill="currentColor" />
    </svg>
  );
}

function BookmarkIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}>
      <path d="M6 4h12v16l-6-4-6 4V4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
