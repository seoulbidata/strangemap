"use client";

import { useState } from "react";
import { useLocale } from "@/i18n/LocaleContext";
import { chipLabel } from "@/i18n/enums";
import { localizedPlaceName } from "@/i18n/placeNames";

interface Suggestion {
  title: string;
  place: string;
  duration: string;
  description: string;
  reason: string;
  tags: string[];
}

type CompanionType = "혼자" | "친구" | "커플" | "가족";
type AgeGroupType = "10-20대" | "20-30대" | "30-40대" | "40-50대" | "60대 이상";
type TimeType = "오전" | "오후" | "밤";
type PurposeType = "힐링" | "놀거리" | "데이트" | "관광" | "운동" | "문화생활";
type RegionType = "강북" | "강서" | "강남" | "강동" | "상관없음";
type CongestionType = "여유" | "보통" | "상관없음";

export interface AIQuestCache {
  companion: CompanionType;
  ageGroup: AgeGroupType;
  time: TimeType;
  purpose: PurposeType;
  region: RegionType;
  congestion: CongestionType;
  /** "나만의 코스 만들기" 전용 — 코스에 담을 장소 수 칩 ("3곳"|"4곳"|"5곳") */
  placeCount?: string;
  suggestions: Suggestion[] | null;
  source: "ai" | "mock" | null;
  /** 캐시된 suggestions가 생성된 언어 — locale 전환 시 무효화 판정에 사용 */
  lang?: "ko" | "en";
}

// 카테고리별 파스텔 선택 색상 (bg, text, border)
const CHIP_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  companion: { bg: "#B8D0E8", text: "#2C5F82", border: "#9BBDD9" },
  ageGroup: { bg: "#C8BFE8", text: "#4A3575", border: "#B4A9D9" },
  time: { bg: "#F5D5A8", text: "#7A4A10", border: "#E8C285" },
  purpose: { bg: "#B8DCCC", text: "#1E5E40", border: "#98CCAD" },
  place: { bg: "#B8DBD9", text: "#1E5252", border: "#96C8C6" },
  congestion: { bg: "#F0C0C8", text: "#7A2535", border: "#E0A0A8" },
};

interface AIQuestPanelProps {
  onSetDestination?: (placeName: string) => void;
  cacheRef?: React.MutableRefObject<AIQuestCache>;
}

export default function AIQuestPanel({ onSetDestination, cacheRef }: AIQuestPanelProps) {
  const { t, locale } = useLocale();
  const [companion, setCompanionState] = useState<CompanionType>(() => cacheRef?.current.companion ?? "친구");
  const [ageGroup, setAgeGroupState] = useState<AgeGroupType>(() => cacheRef?.current.ageGroup ?? "20-30대");
  const [time, setTimeState] = useState<TimeType>(() => cacheRef?.current.time ?? "오후");
  const [purpose, setPurposeState] = useState<PurposeType>(() => cacheRef?.current.purpose ?? "관광");
  const [region, setRegionState] = useState<RegionType>(() => cacheRef?.current.region ?? "상관없음");
  const [congestion, setCongestionState] = useState<CongestionType>(() => cacheRef?.current.congestion ?? "상관없음");

  // 다른 언어로 생성된 캐시는 재사용하지 않는다 (locale별 캐시 분리)
  const [suggestions, setSuggestionsState] = useState<Suggestion[] | null>(() =>
    cacheRef && cacheRef.current.lang !== undefined && cacheRef.current.lang !== locale
      ? null
      : cacheRef?.current.suggestions ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSourceState] = useState<"ai" | "mock" | null>(() => cacheRef?.current.source ?? null);

  const setCompanion = (v: CompanionType) => { setCompanionState(v); if (cacheRef) cacheRef.current.companion = v; };
  const setAgeGroup = (v: AgeGroupType) => { setAgeGroupState(v); if (cacheRef) cacheRef.current.ageGroup = v; };
  const setTime = (v: TimeType) => { setTimeState(v); if (cacheRef) cacheRef.current.time = v; };
  const setPurpose = (v: PurposeType) => { setPurposeState(v); if (cacheRef) cacheRef.current.purpose = v; };
  const setRegion = (v: RegionType) => { setRegionState(v); if (cacheRef) cacheRef.current.region = v; };
  const setCongestion = (v: CongestionType) => { setCongestionState(v); if (cacheRef) cacheRef.current.congestion = v; };
  const setSuggestions = (v: Suggestion[] | null) => {
    setSuggestionsState(v);
    if (cacheRef) {
      cacheRef.current.suggestions = v;
      cacheRef.current.lang = locale;
    }
  };
  const setSource = (v: "ai" | "mock" | null) => { setSourceState(v); if (cacheRef) cacheRef.current.source = v; };

  const handleRecommend = async () => {
    setLoading(true);
    setSuggestions(null);
    setError(null);
    setSource(null);

    try {
      const res = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companion, ageGroup, time, purpose, region, congestion, lang: locale }),
      });

      if (!res.ok) throw new Error("API 오류");

      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
      setSource(data._source ?? null);
    } catch {
      setError(t("aiQuest.error"));
    } finally {
      setLoading(false);
    }
  };

  const summaryLabel = [
    chipLabel(companion, locale),
    chipLabel(ageGroup, locale),
    chipLabel(time, locale),
    chipLabel(purpose, locale),
    region !== "상관없음" ? chipLabel(region, locale) : null,
    congestion !== "상관없음" ? t("aiQuest.congestionPrefix", { v: chipLabel(congestion, locale) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-4 border-b border-[#E5E1D8] md:block hidden">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse" />
          <span className="text-[10px] font-display tracking-wider text-[#9CA3AF] uppercase">{t("aiQuest.kicker")}</span>
        </div>
        <h2 className="text-base font-bold text-[#1A1E2E] mt-1">{t("aiQuest.title")}</h2>
        <p className="text-xs text-[#9CA3AF] mt-0.5">{t("aiQuest.subtitle")}</p>
      </div>

      <div className="flex-1 overflow-y-auto thin-scroll">
        {/* 상황 선택 */}
        <div className="px-4 py-4 space-y-3.5 border-b border-[#E5E1D8]">
          {/* 칩 값은 한글 그대로 API로 전송, 표시 라벨만 지역화 */}
          <ChipGroup
            label={t("courseForm.companion")}
            options={["혼자", "친구", "커플", "가족"] as CompanionType[]}
            value={companion}
            onChange={(v) => setCompanion(v as CompanionType)}
            colorKey="companion"
            disabled={loading}
            renderLabel={(v) => chipLabel(v, locale)}
          />
          <ChipGroup
            label={t("courseForm.age")}
            options={["10-20대", "20-30대", "30-40대", "40-50대", "60대 이상"] as AgeGroupType[]}
            value={ageGroup}
            onChange={(v) => setAgeGroup(v as AgeGroupType)}
            colorKey="ageGroup"
            disabled={loading}
            renderLabel={(v) => chipLabel(v, locale)}
          />
          <ChipGroup
            label={t("courseForm.time")}
            options={["오전", "오후", "밤"] as TimeType[]}
            value={time}
            onChange={(v) => setTime(v as TimeType)}
            colorKey="time"
            disabled={loading}
            renderLabel={(v) => chipLabel(v, locale)}
          />
          <ChipGroup
            label={t("courseForm.purpose")}
            options={["힐링", "놀거리", "데이트", "관광", "운동", "문화생활"] as PurposeType[]}
            value={purpose}
            onChange={(v) => setPurpose(v as PurposeType)}
            colorKey="purpose"
            disabled={loading}
            renderLabel={(v) => chipLabel(v, locale)}
          />
          <ChipGroup
            label={t("courseForm.region")}
            options={["강북", "강서", "강남", "강동", "상관없음"] as RegionType[]}
            value={region}
            onChange={(v) => setRegion(v as RegionType)}
            colorKey="place"
            disabled={loading}
            renderLabel={(v) => chipLabel(v, locale)}
          />
          <ChipGroup
            label={t("courseForm.congestion")}
            options={["여유", "보통", "상관없음"] as CongestionType[]}
            value={congestion}
            onChange={(v) => setCongestion(v as CongestionType)}
            colorKey="congestion"
            disabled={loading}
            renderLabel={(v) => chipLabel(v, locale)}
          />
        </div>

        {/* 추천 버튼 */}
        <div className="px-4 py-3">
          <button
            onClick={handleRecommend}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#FE9C00] text-white text-sm font-semibold hover:bg-[#E58900] transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                {t("aiQuest.generating")}
              </>
            ) : (
              <>
                {t("aiQuest.recommend")}
              </>
            )}
          </button>
        </div>

        {/* 로딩 UI */}
        {loading && (
          <div className="px-4 pb-6">
            <div className="rounded-2xl border border-[#FDECC8] bg-[#FFFBF0] p-5 flex flex-col items-center gap-3">
              {/* 아이콘 + 펄스 링 */}
              <div className="relative flex items-center justify-center">
                <span className="absolute w-14 h-14 rounded-full bg-[#FE9C00]/10 animate-ping" />
                <div className="w-11 h-11 rounded-full bg-[#FE9C00]/15 flex items-center justify-center z-10">
                  <AIIcon className="w-6 h-6 text-[#FE9C00]" />
                </div>
              </div>
              {/* 텍스트 */}
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-[#1A1E2E]">{t("aiQuest.loadingTitle")}</p>
                <p className="text-[11px] text-[#9CA3AF]">{t("aiQuest.loadingDesc", { summary: summaryLabel })}</p>
              </div>
              {/* 점 애니메이션 */}
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#FE9C00]"
                    style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 에러 */}
        {error && !loading && (
          <div className="px-4 pb-4">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
              <p className="text-[12px] text-red-600">{error}</p>
            </div>
          </div>
        )}

        {/* 추천 결과 */}
        {suggestions && !loading && (
          <div className="px-4 pb-4 space-y-3 animate-fade-up">
            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-[#9CA3AF]">{summaryLabel}</p>
              {source === "ai" && (
                <span className="flex items-center gap-1 text-[9px] text-[#2563EB]">
                  <span className="w-1 h-1 rounded-full bg-[#2563EB] animate-pulse" />
                  {t("aiQuest.aiGenerated")}
                </span>
              )}
            </div>
            {suggestions.map((s, i) => (
              <div key={i} className="rounded-xl border border-[#E5E1D8] bg-white overflow-hidden">
                <div className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-[#1A1E2E] leading-snug">{s.title}</p>
                      <p className="text-[11px] text-[#2563EB] mt-0.5">{localizedPlaceName(s.place, locale)}</p>
                    </div>
                    <span className="text-[10px] text-[#9CA3AF] shrink-0 mt-0.5">{s.duration}</span>
                  </div>
                  <p className="text-[12px] text-[#6B7280] mt-2 leading-relaxed">{s.description}</p>
                  <div className="mt-2.5 p-2.5 bg-[#FFFBEB] rounded-lg border border-[#FDE68A]">
                    <p className="text-[11px] text-[#92400E] leading-relaxed">{s.reason}</p>
                  </div>
                  <div className="mt-2.5 flex gap-1.5 flex-wrap">
                    {s.tags.map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 bg-[#F5F2EC] text-[#6B7280] rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>
                  {onSetDestination && (
                    <button
                      onClick={() => onSetDestination(s.place)}
                      className="mt-3 w-full py-2 rounded-lg bg-[#FE9C00] text-white text-[12px] font-semibold hover:bg-[#E58900] transition-colors flex items-center justify-center gap-1.5"
                    >
                      <RouteIcon className="w-3.5 h-3.5" />
                      {t("aiQuest.setDest")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 초기 상태 */}
        {!suggestions && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center text-[#9CA3AF]">
            <div className="w-12 h-12 rounded-xl bg-[#F5F2EC] flex items-center justify-center mb-3">
              <AIIcon className="w-6 h-6" />
            </div>
            <p className="text-sm">{t("aiQuest.initial")}</p>
            <p className="text-[11px] mt-1 text-[#C4BFB8]">{t("aiQuest.initialHint")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ChipGroup({
  label,
  options,
  value,
  onChange,
  colorKey,
  disabled,
  renderLabel,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  colorKey: keyof typeof CHIP_COLORS;
  disabled?: boolean;
  /** 값은 한글 그대로 두고 표시 라벨만 바꿀 때(영문 모드) 사용 */
  renderLabel?: (v: string) => string;
}) {
  const active = CHIP_COLORS[colorKey];
  return (
    <div>
      <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">{label}</p>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => !disabled && onChange(opt)}
            disabled={disabled}
            className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border disabled:cursor-not-allowed disabled:opacity-60"
            style={
              value === opt
                ? { background: active.bg, color: active.text, borderColor: active.border }
                : { background: "#F5F2EC", color: "#6B7280", borderColor: "#E5E1D8" }
            }
          >
            {renderLabel ? renderLabel(opt) : opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function AIIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M6.34 6.34l1.42 1.42M16.24 16.24l1.42 1.42M6.34 17.66l1.42-1.42M16.24 7.76l1.42-1.42"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function RouteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="19" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 17V13C6 10 9 9 12 9H14C17 9 18 8 18 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
