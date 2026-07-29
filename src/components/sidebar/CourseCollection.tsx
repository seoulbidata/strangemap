"use client";

import { useState } from "react";
import { THEME_COURSES, CATEGORY_META, placeStopCount, type ThemeCourse, type CourseCategory } from "@/data/themeCourses";
import { courseHeroBackground } from "@/lib/courseImage";
import { useLocale, type Locale } from "@/i18n/LocaleContext";
import { categoryLabel } from "@/i18n/enums";
import { getCourseText } from "@/i18n/courseText";

interface Props {
  /** 카드 클릭 시 우측 코스 디테일 패널을 연다 */
  onOpenCourse: (course: ThemeCourse) => void;
  activeCourseId: string | null;
  /** "나만의 코스 만들기" CTA → 나만의 코스 탭으로 이동 (없으면 CTA 미노출 — 모바일) */
  onCreateMyCourse?: () => void;
}

const CATEGORIES = ["전체", "역사", "야경/자연", "서울배경 컨텐츠", "Hot플레이스", "문화", "로컬", "운동"] as const;
type CatFilter = (typeof CATEGORIES)[number];

export default function CourseCollection({ onOpenCourse, activeCourseId, onCreateMyCourse }: Props) {
  const { t, locale } = useLocale();
  const [activeCategory, setActiveCategory] = useState<CatFilter>("전체");

  const list =
    activeCategory === "전체" ? THEME_COURSES : THEME_COURSES.filter((c) => c.category === activeCategory);

  return (
    <div className="flex flex-col h-full bg-[#FBFAF7]">
      {/* 헤더 — 개인화 피드 */}
      <div className="px-6 pt-7 pb-5 md:block hidden">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#2563EB]">{t("course.forYou")}</p>
        <h2 className="text-[22px] font-bold text-[#16243C] mt-1.5 leading-tight tracking-[-0.01em]">
          {t("course.title")}
        </h2>
        <p className="text-[14px] text-[#8B8678] mt-1">{t("course.subtitle")}</p>
      </div>

      {/* 카테고리 필터 */}
      <div className="px-5 pb-3 md:pt-0 pt-5">
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
          {CATEGORIES.map((cat) => {
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-3.5 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all ${
                  active
                    ? "bg-[#16243C] text-white shadow-[0_3px_10px_rgba(22,36,60,0.18)]"
                    : "bg-white text-[#5C5950] border border-[#ECE8E0] hover:border-[#D6D1C7]"
                }`}
              >
                {categoryLabel(cat, locale)}
              </button>
            );
          })}
        </div>
      </div>

      {/* 피드 */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pt-2 pb-4">
        {list.length === 0 ? (
          <p className="text-[13px] text-[#A8A398] text-center mt-16 leading-relaxed">
            {t("course.emptyCategory")}
          </p>
        ) : (
          <div className="space-y-5">
            {list.map((course) => (
              <CourseFeedCard
                key={course.id}
                course={getCourseText(course, locale)}
                isActive={activeCourseId === course.id}
                onOpen={() => onOpenCourse(course)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 나만의 코스 만들기 → 나만의 코스 탭 (칩 위저드) */}
      {onCreateMyCourse && (
        <div className="px-5 pt-3 pb-5 bg-gradient-to-t from-[#FBFAF7] via-[#FBFAF7] to-transparent">
          <button
            onClick={onCreateMyCourse}
            className="w-full py-3.5 rounded-2xl bg-[#16243C] text-white text-[14px] font-semibold hover:bg-[#1E2F4D] transition-colors flex items-center justify-center gap-2 shadow-[0_6px_20px_rgba(22,36,60,0.22)]"
          >
            {t("course.create")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── 피드 카드 (Airbnb 경험 카드 톤) ────────────────────────────────────────────

function CourseFeedCard({
  course,
  isActive,
  onOpen,
}: {
  course: ThemeCourse;
  isActive: boolean;
  onOpen: () => void;
}) {
  const { t, locale } = useLocale();
  const catMeta = CATEGORY_META[course.category as CourseCategory];

  return (
    <div
      className={`group relative rounded-[22px] bg-white overflow-hidden transition-all duration-200 hover:-translate-y-0.5 ${
        isActive
          ? "shadow-[0_0_0_2px_#16243C,0_10px_32px_rgba(22,36,60,0.18)]"
          : "shadow-[0_6px_24px_rgba(20,30,50,0.07)] hover:shadow-[0_14px_40px_rgba(20,30,50,0.14)]"
      }`}
    >
      <button onClick={onOpen} className="w-full text-left block">
        {/* 히어로 (이미지 → 없으면 테마 그라데이션) */}
        <div
          className="relative h-44 bg-center bg-cover overflow-hidden"
          style={{ backgroundImage: courseHeroBackground(course, "card") }}
        >
          <div className="absolute top-3.5 left-3.5">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/85 backdrop-blur-sm text-[#16243C]">
              {categoryLabel(catMeta.label, locale)}
            </span>
          </div>
          {isActive && (
            <div className="absolute top-3.5 right-3.5">
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#16243C] text-white">{t("course.badge.active")}</span>
            </div>
          )}
        </div>

        {/* 본문 */}
        <div className="px-5 pt-4 pb-5">
          <h3 className={`text-[18px] font-semibold leading-snug tracking-[-0.01em] line-clamp-2 transition-colors duration-150 ${isActive ? "text-[#16243C]" : "text-[#16243C] group-hover:text-[#1E2F4D]"}`}>
            {course.title}
          </h3>
          <p className="text-[14px] text-[#9A958A] mt-1 line-clamp-1">{course.subtitle}</p>

          {/* 작은 스탯 카드 — 거리 / 소요시간 / 총 코스 */}
          <div className="grid grid-cols-3 gap-2 mt-3.5">
            <MiniStat icon={<RouteIcon />} value={shortDistance(course.distance)} label={t("course.stat.distance")} />
            <MiniStat icon={<ClockIcon />} value={shortDuration(course.totalDuration, locale)} label={t("course.stat.duration")} />
            <MiniStat icon={<PinIcon />} value={/* 식사 슬롯은 "N곳"에 넣지 않는다 */ t("course.stopsUnit", { n: placeStopCount(course) })} label={t("course.stat.stops")} />
          </div>

          <div className="mt-3.5 flex gap-1.5 flex-wrap">
            {course.tags.slice(0, 3).map((t) => (
              <span key={t} className="text-[11px] font-medium px-2.5 py-1 bg-[#F4F2EC] text-[#8B8678] rounded-full">
                {t}
              </span>
            ))}
          </div>
        </div>
      </button>
    </div>
  );
}

// 긴 원문(예: "8.1km (도보 + 대중교통 병행 권장)")에서 핵심 수치만 뽑아 작은 카드에 맞춘다.
function shortDistance(s: string): string {
  const km = s.match(/(\d+(?:\.\d+)?)\s*km/);
  if (km) return `${km[1]}km`;
  return s.split(/[\s(]/)[0] || s;
}

function shortDuration(s: string, locale: Locale): string {
  const hourUnit = locale === "en" ? "h" : "시간";
  const dayUnit = locale === "en" ? "d" : "일";
  // ko/en 표기 모두 파싱 (en 코스 텍스트는 "About 4 hours" 형태)
  const d = s.match(/(\d+)\s*(?:일|day)/i);
  if (d) return `${d[1]}${dayUnit}`;
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:시간|hour|hr|h\b)/i);
  const m = s.match(/(\d+)\s*(?:분|min)/i);
  if (h) {
    const hours = parseFloat(h[1]) + (m ? parseInt(m[1], 10) / 60 : 0);
    const val = Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
    return `${val}${hourUnit}`;
  }
  if (m) return locale === "en" ? `${m[1]}min` : `${m[1]}분`;
  return s.replace(/^(약|About|Approx\.?)\s*/i, "");
}

function MiniStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-xl bg-[#F7F5F0] px-1.5 py-2.5 flex flex-col items-center gap-1 overflow-hidden">
      <span className="text-[#A8A398]">{icon}</span>
      <span className="text-[13px] font-bold text-[#16243C] leading-none max-w-full truncate">{value}</span>
      <span className="text-[10px] text-[#9A958A] leading-none max-w-full truncate">{label}</span>
    </div>
  );
}

function RouteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="19" r="2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="18" cy="5" r="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 17V13C6 10.5 9 9.5 12 9.5H14C17 9.5 18 8.5 18 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 8v4.2l2.6 1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M12 21c4-4.2 6-7.4 6-10a6 6 0 1 0-12 0c0 2.6 2 5.8 6 10z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
