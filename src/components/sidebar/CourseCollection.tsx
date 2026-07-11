"use client";

import { useMemo, useState } from "react";
import { THEME_COURSES, CATEGORY_META, type ThemeCourse, type CourseCategory } from "@/data/themeCourses";
import { buildDraftFromSuggestions, isAIDraft, type AISuggestion } from "@/lib/aiCourseDraft";
import { courseHeroBackground } from "@/lib/courseImage";
import { useCourseCollection } from "@/hooks/useCourseCollection";
import type { AIQuestCache } from "./AIQuestPanel";
import { SELECTABLE_ZONES, type SelectableZone } from "@/lib/seoulPlaces";
import { useLocale, type Locale } from "@/i18n/LocaleContext";
import { categoryLabel, chipLabel } from "@/i18n/enums";
import { getCourseText } from "@/i18n/courseText";

interface Props {
  /** 카드 클릭 시 우측 코스 디테일 패널을 연다 */
  onOpenCourse: (course: ThemeCourse) => void;
  activeCourseId: string | null;
  /** AIQuestPanel과 공유하는 입력 캐시 (칩 선택 유지용) */
  cacheRef?: React.MutableRefObject<AIQuestCache>;
}

const CATEGORIES = ["전체", "역사", "야경/자연", "서울배경 컨텐츠", "Hot플레이스", "문화", "로컬", "운동"] as const;
type CatFilter = (typeof CATEGORIES)[number];

export default function CourseCollection({ onOpenCourse, activeCourseId, cacheRef }: Props) {
  const { t, locale } = useLocale();
  const { drafts, addDraft, removeDraft } = useCourseCollection();
  const [activeCategory, setActiveCategory] = useState<CatFilter>("전체");
  const [creating, setCreating] = useState(false);

  // 추천 코스 + 이 브라우저에서 만든 AI 코스를 함께 노출 (로그인 불필요한 정적/세션 데이터)
  const aiDrafts = useMemo(() => drafts.filter(isAIDraft), [drafts]);
  const allCourses = useMemo(() => [...aiDrafts, ...THEME_COURSES], [aiDrafts]);

  const list =
    activeCategory === "전체" ? allCourses : allCourses.filter((c) => c.category === activeCategory);

  const handleOpen = (course: ThemeCourse) => {
    onOpenCourse(course);
  };

  const handleDraftCreated = (course: ThemeCourse) => {
    addDraft(course);
    setCreating(false);
    setActiveCategory("전체");
  };

  return (
    <div className="flex flex-col h-full bg-[#FBFAF7]">
      {/* 헤더 — 개인화 피드 */}
      <div className="px-6 pt-7 pb-5 md:block hidden">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#2563EB]">{t("course.forYou")}</p>
        <h2 className="text-[24px] font-bold text-[#16243C] mt-1.5 leading-tight tracking-[-0.01em]">
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
                onOpen={() => handleOpen(course)}
                onDelete={isAIDraft(course) ? () => removeDraft(course.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* AI 코스 만들기 */}
      <div className="px-5 pt-3 pb-5 bg-gradient-to-t from-[#FBFAF7] via-[#FBFAF7] to-transparent">
        <button
          onClick={() => setCreating(true)}
          className="w-full py-3.5 rounded-2xl bg-[#16243C] text-white text-[14px] font-semibold hover:bg-[#1E2F4D] transition-colors flex items-center justify-center gap-2 shadow-[0_6px_20px_rgba(22,36,60,0.22)]"
        >
          {t("course.create")}
        </button>
      </div>

      {creating && (
        <CourseCreateForm cacheRef={cacheRef} onClose={() => setCreating(false)} onCreated={handleDraftCreated} />
      )}
    </div>
  );
}

// ── 피드 카드 (Airbnb 경험 카드 톤) ────────────────────────────────────────────

function CourseFeedCard({
  course,
  isActive,
  onOpen,
  onDelete,
}: {
  course: ThemeCourse;
  isActive: boolean;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const { t, locale } = useLocale();
  const catMeta = CATEGORY_META[course.category as CourseCategory];
  const ai = isAIDraft(course);

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
          <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5">
            {ai && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#2563EB] text-white flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-white" /> AI
              </span>
            )}
            {isActive && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#16243C] text-white">{t("course.badge.active")}</span>
            )}
          </div>
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
            <MiniStat icon={<PinIcon />} value={t("course.stopsUnit", { n: course.stops.length })} label={t("course.stat.stops")} />
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

      {/* 휴지통 버튼 — 호버 시 우하단에 등장 */}
      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-white border border-[#ECE8E0] text-[#C4BDB4] hover:bg-[#FEE2E2] hover:border-[#FECACA] hover:text-[#DC2626] flex items-center justify-center transition-all duration-150 opacity-0 group-hover:opacity-100 shadow-sm z-10"
          aria-label={t("course.delete")}
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
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

// ── AI 코스 생성 폼 (칩 + 자유서술 하이브리드) ──────────────────────────────────

type CompanionType = "혼자" | "친구" | "커플" | "가족";
type AgeGroupType = "10-20대" | "20-30대" | "30-40대" | "40-50대" | "60대 이상";
type TimeType = "오전" | "오후" | "밤";
type PurposeType = "힐링" | "놀거리" | "데이트" | "관광" | "문화생활";
type RegionType = SelectableZone | "상관없음";
type CongestionType = "여유" | "보통" | "상관없음";
type PlaceCountType = "3곳" | "4곳" | "5곳";

function CourseCreateForm({
  cacheRef,
  onClose,
  onCreated,
}: {
  cacheRef?: React.MutableRefObject<AIQuestCache>;
  onClose: () => void;
  onCreated: (course: ThemeCourse) => void;
}) {
  const { t, locale } = useLocale();
  const [companion, setCompanion] = useState<CompanionType>(() => (cacheRef?.current.companion as CompanionType) ?? "친구");
  const [ageGroup, setAgeGroup] = useState<AgeGroupType>(() => (cacheRef?.current.ageGroup as AgeGroupType) ?? "20-30대");
  const [time, setTime] = useState<TimeType>(() => (cacheRef?.current.time as TimeType) ?? "오후");
  const [purpose, setPurpose] = useState<PurposeType>(() => (cacheRef?.current.purpose as PurposeType) ?? "관광");
  const [region, setRegion] = useState<RegionType>(() => (cacheRef?.current.region as RegionType) ?? "상관없음");
  const [congestion, setCongestion] = useState<CongestionType>(() => (cacheRef?.current.congestion as CongestionType) ?? "상관없음");
  const [placeCount, setPlaceCount] = useState<PlaceCountType>(() => (cacheRef?.current.placeCount as PlaceCountType) ?? "3곳");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = <T,>(setter: (v: T) => void, key: keyof AIQuestCache) => (v: T) => {
    setter(v);
    if (cacheRef) (cacheRef.current as unknown as Record<string, unknown>)[key] = v;
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companion, ageGroup, time, purpose, region, congestion, placeCount: parseInt(placeCount, 10), lang: locale }),
      });
      if (!res.ok) throw new Error("api");
      const data = await res.json();
      const suggestions = (data.suggestions ?? []) as AISuggestion[];
      const draft = buildDraftFromSuggestions(suggestions, { companion, time, purpose, region }, locale);
      if (!draft) {
        setError(t("courseForm.errNotEnough"));
        return;
      }
      onCreated(draft);
    } catch {
      setError(t("courseForm.errFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 bg-[#FBFAF7] flex flex-col animate-slide-in">
      <div className="px-6 pt-6 pb-4 flex items-start justify-between shrink-0">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#2563EB]">{t("courseForm.kicker")}</p>
          <h3 className="text-[20px] font-bold text-[#16243C] mt-1">{t("courseForm.title")}</h3>
          <p className="text-[13px] text-[#8B8678] mt-0.5">{t("courseForm.subtitle")}</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-[#F1EFEA] hover:bg-[#E7E3DA] text-[#8B8678] flex items-center justify-center text-sm transition-colors"
          aria-label={t("common.close")}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto thin-scroll px-6 py-2 space-y-5">
        {/* 칩 값은 한글 그대로 API로 전송되고, 표시 라벨만 renderLabel로 지역화한다 */}
        <ChipGroup label={t("courseForm.companion")} options={["혼자", "친구", "커플", "가족"]} value={companion} onChange={sync<CompanionType>(setCompanion, "companion")} disabled={loading} renderLabel={(v) => chipLabel(v, locale)} />
        <ChipGroup label={t("courseForm.age")} options={["10-20대", "20-30대", "30-40대", "40-50대", "60대 이상"]} value={ageGroup} onChange={sync<AgeGroupType>(setAgeGroup, "ageGroup")} disabled={loading} renderLabel={(v) => chipLabel(v, locale)} />
        <ChipGroup label={t("courseForm.time")} options={["오전", "오후", "밤"]} value={time} onChange={sync<TimeType>(setTime, "time")} disabled={loading} renderLabel={(v) => chipLabel(v, locale)} />
        <ChipGroup label={t("courseForm.purpose")} options={["힐링", "놀거리", "데이트", "관광", "문화생활"]} value={purpose} onChange={sync<PurposeType>(setPurpose, "purpose")} disabled={loading} renderLabel={(v) => chipLabel(v, locale)} />
        <ChipGroup label={t("courseForm.region")} options={[...SELECTABLE_ZONES, "상관없음"]} value={region} onChange={sync<RegionType>(setRegion, "region")} disabled={loading} renderLabel={(v) => chipLabel(v, locale)} />
        <ChipGroup label={t("courseForm.congestion")} options={["여유", "보통", "상관없음"]} value={congestion} onChange={sync<CongestionType>(setCongestion, "congestion")} disabled={loading} renderLabel={(v) => chipLabel(v, locale)} />
        <ChipGroup label={t("courseForm.placeCount")} options={["3곳", "4곳", "5곳"]} value={placeCount} onChange={sync<PlaceCountType>(setPlaceCount, "placeCount")} disabled={loading} renderLabel={(v) => chipLabel(v, locale)} />

        <div>
          <p className="text-[12px] font-semibold text-[#8B8678] mb-2">{t("courseForm.freeInput")}</p>
          <div className="w-full rounded-2xl bg-[#F4F2EC] border border-dashed border-[#DDD8CE] px-4 py-3.5 flex items-start gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-[#BDB8AD]">
              <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.7" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <p className="text-[13px] text-[#9A958A] leading-relaxed">
              {t("courseForm.freeInputNotice")}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl bg-[#FEF2F2] p-4 text-center">
            <p className="text-[13px] text-[#DC2626]">{error}</p>
          </div>
        )}
        

      </div>

      <div className="px-6 pt-3 pb-6 shrink-0">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full py-3.5 rounded-2xl bg-[#16243C] text-white text-[14px] font-semibold hover:bg-[#1E2F4D] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 shadow-[0_6px_20px_rgba(22,36,60,0.22)]"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              {t("courseForm.generating")}
            </>
          ) : (
            t("courseForm.generate")
          )}
        </button>
      </div>
    </div>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  renderLabel,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  /** 값은 한글 그대로 두고 표시 라벨만 바꿀 때(영문 모드) 사용 */
  renderLabel?: (v: T) => string;
}) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-[#8B8678] mb-2.5">{label}</p>
      <div className="flex gap-2 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => !disabled && onChange(opt)}
            disabled={disabled}
            className={`px-3.5 py-2 rounded-full text-[13px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
              value === opt
                ? "bg-[#16243C] text-white shadow-[0_3px_10px_rgba(22,36,60,0.18)]"
                : "bg-white text-[#5C5950] border border-[#ECE8E0] hover:border-[#D6D1C7]"
            }`}
          >
            {renderLabel ? renderLabel(opt) : opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"
        fill="currentColor"
      />
    </svg>
  );
}
