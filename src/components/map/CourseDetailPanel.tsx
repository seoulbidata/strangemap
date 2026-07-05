"use client";

import { useEffect, useState } from "react";
import { CATEGORY_META, type CourseCategory, type ThemeCourse } from "@/data/themeCourses";
import { SEOUL_PLACES } from "@/lib/seoulPlaces";
import { isAIDraft } from "@/lib/aiCourseDraft";
import { courseHeroBackground } from "@/lib/courseImage";
import { useLocale } from "@/i18n/LocaleContext";
import { categoryLabel, congestionLabel, difficultyLabel, ADTAG_EN } from "@/i18n/enums";
import { getCourseText } from "@/i18n/courseText";

interface Props {
  course: ThemeCourse;
  /** 현재 지도에 그려진(진행 중) 코스인지 */
  isActive: boolean;
  /** 내 코스(저장)에 담겨있는지 */
  saved: boolean;
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

export default function CourseDetailPanel({
  course: rawCourse,
  isActive,
  saved,
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

  // 혼잡도는 스탑 index로 보관 — 영문 모드에서도 한글 원본 name으로 매칭한다
  const [congestion, setCongestion] = useState<Record<number, CongestionLevel>>({});

  useEffect(() => {
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
  }, [rawCourse]);

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
        <div className="absolute top-4 left-5 flex items-center gap-1.5">
          <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-white/85 backdrop-blur-sm text-[#16243C]">
            {categoryLabel(catMeta.label, locale)}
          </span>
          {ai && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#2563EB] text-white flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-white" /> {t("courseDetail.aiGenerated")}
            </span>
          )}
        </div>

        {/* 히어로 위 타이틀 */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-5">
          <h2 className="text-[27px] font-bold text-white leading-[1.15] tracking-[-0.015em] drop-shadow-sm">
            {course.title}
          </h2>
          <p className="text-[14px] text-white/85 mt-1.5">{course.subtitle}</p>
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
          <h3 className="text-[13px] font-bold tracking-[0.04em] text-[#16243C] mb-4">
            {t("courseDetail.checkpoints")} <span className="text-[#B5B0A6] font-semibold">{course.stops.length}</span>
          </h3>

          <div>
            {course.stops.map((stop, i) => {
              const level = congestion[i];
              const cStyle = level ? CONGESTION_STYLE[level] : null;
              const isLast = i === course.stops.length - 1;
              return (
                <button key={i} onClick={() => onSelectStop(i)} className="w-full text-left flex gap-4 group">
                  <div className="flex flex-col items-center shrink-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0 shadow-sm"
                      style={{ background: course.color }}
                    >
                      {i + 1}
                    </div>
                    {!isLast && (
                      <div className="w-[2px] flex-1 my-1.5 rounded-full" style={{ background: `${course.color}26`, minHeight: 34 }} />
                    )}
                  </div>

                  <div className={`flex-1 min-w-0 ${isLast ? "pb-1" : "pb-6"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[16px] font-semibold text-[#16243C] group-hover:text-[#2563EB] transition-colors flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{stop.name}</span>
                        {stop.adTag && (
                          <span
                            title={stop.adTag.disclosure}
                            className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
                            style={{ background: course.color }}
                          >
                            {locale === "en" ? ADTAG_EN[stop.adTag.label] ?? stop.adTag.label : stop.adTag.label}
                          </span>
                        )}
                      </p>
                      <span className="text-[12px] font-medium text-[#A8A398] shrink-0">{stop.duration}</span>
                    </div>
                    <p className="text-[14px] text-[#7C7870] mt-1.5 leading-[1.6]">{stop.description}</p>
                    {cStyle && (
                      <span
                        className="inline-flex items-center gap-1.5 mt-2.5 text-[12px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: cStyle.bg, color: cStyle.text }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: cStyle.text }} />
                        {t("courseDetail.realtime", { level: congestionLabel(level, locale) })}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 하단 액션 */}
      <div className="shrink-0 px-5 py-4 flex items-center gap-3 bg-white shadow-[0_-8px_24px_rgba(20,30,50,0.06)]">
        <button
          onClick={onToggleSave}
          className={`shrink-0 h-12 px-4 rounded-2xl text-[14px] font-semibold transition-colors flex items-center gap-2 ${
            saved ? "bg-[#EEF3FF] text-[#2563EB]" : "bg-[#F4F2EC] text-[#5C5950] hover:bg-[#ECE8E0]"
          }`}
        >
          <BookmarkIcon className="w-4 h-4" filled={saved} />
          {saved ? t("courseDetail.saved") : t("courseDetail.save")}
        </button>
        <button
          onClick={onToggleStart}
          className={`flex-1 h-12 rounded-2xl text-[15px] font-bold text-white transition-all hover:opacity-95 shadow-[0_6px_20px_rgba(22,36,60,0.22)] ${
            isActive ? "bg-[#3A4860]" : "bg-[#16243C]"
          }`}
        >
          {isActive ? t("courseDetail.end") : t("courseDetail.view")}
        </button>
      </div>
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

function BookmarkIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}>
      <path d="M6 4h12v16l-6-4-6 4V4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
