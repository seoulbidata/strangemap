"use client";

import { useState } from "react";

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

// 카테고리별 파스텔 선택 색상 (bg, text, border)
const CHIP_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  companion: { bg: "#B8D0E8", text: "#2C5F82", border: "#9BBDD9" },
  ageGroup:  { bg: "#C8BFE8", text: "#4A3575", border: "#B4A9D9" },
  time:      { bg: "#F5D5A8", text: "#7A4A10", border: "#E8C285" },
  purpose:   { bg: "#B8DCCC", text: "#1E5E40", border: "#98CCAD" },
  place:     { bg: "#B8DBD9", text: "#1E5252", border: "#96C8C6" },
  congestion:{ bg: "#F0C0C8", text: "#7A2535", border: "#E0A0A8" },
};

export default function AIQuestPanel() {
  const [companion, setCompanion]   = useState<CompanionType>("친구");
  const [ageGroup, setAgeGroup]     = useState<AgeGroupType>("20-30대");
  const [time, setTime]             = useState<TimeType>("오후");
  const [purpose, setPurpose]       = useState<PurposeType>("관광");
  const [region, setRegion]         = useState<RegionType>("상관없음");
  const [congestion, setCongestion] = useState<CongestionType>("상관없음");

  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [source, setSource]           = useState<"ai" | "mock" | null>(null);

  const handleRecommend = async () => {
    setLoading(true);
    setSuggestions(null);
    setError(null);
    setSource(null);

    try {
      const res = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companion, ageGroup, time, purpose, region, congestion }),
      });

      if (!res.ok) throw new Error("API 오류");

      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
      setSource(data._source ?? null);
    } catch {
      setError("추천을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const summaryLabel = [companion, ageGroup, time, purpose, region !== "상관없음" ? region : null, congestion !== "상관없음" ? `혼잡도 ${congestion}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-4 border-b border-[#E5E1D8]">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse" />
          <span className="text-[10px] font-display tracking-wider text-[#9CA3AF] uppercase">AI 추천</span>
        </div>
        <h2 className="text-base font-bold text-[#1A1E2E] mt-1">오늘 뭐 할까요?</h2>
        <p className="text-xs text-[#9CA3AF] mt-0.5">상황을 알려주시면 맞춤 활동을 추천해드립니다</p>
      </div>

      <div className="flex-1 overflow-y-auto thin-scroll">
        {/* 상황 선택 */}
        <div className="px-4 py-4 space-y-3.5 border-b border-[#E5E1D8]">
          <ChipGroup
            label="누구랑"
            options={["혼자", "친구", "커플", "가족"] as CompanionType[]}
            value={companion}
            onChange={(v) => setCompanion(v as CompanionType)}
            colorKey="companion"
            disabled={loading}
          />
          <ChipGroup
            label="나이대"
            options={["10-20대", "20-30대", "30-40대", "40-50대", "60대 이상"] as AgeGroupType[]}
            value={ageGroup}
            onChange={(v) => setAgeGroup(v as AgeGroupType)}
            colorKey="ageGroup"
            disabled={loading}
          />
          <ChipGroup
            label="시간대"
            options={["오전", "오후", "밤"] as TimeType[]}
            value={time}
            onChange={(v) => setTime(v as TimeType)}
            colorKey="time"
            disabled={loading}
          />
          <ChipGroup
            label="목적"
            options={["힐링", "놀거리", "데이트", "관광", "운동", "문화생활"] as PurposeType[]}
            value={purpose}
            onChange={(v) => setPurpose(v as PurposeType)}
            colorKey="purpose"
            disabled={loading}
          />
          <ChipGroup
            label="위치"
            options={["강북", "강서", "강남", "강동", "상관없음"] as RegionType[]}
            value={region}
            onChange={(v) => setRegion(v as RegionType)}
            colorKey="place"
            disabled={loading}
          />
          <ChipGroup
            label="혼잡도"
            options={["여유", "보통", "상관없음"] as CongestionType[]}
            value={congestion}
            onChange={(v) => setCongestion(v as CongestionType)}
            colorKey="congestion"
            disabled={loading}
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
                서울로가 컨텐츠를 생성중이에요...
              </>
            ) : (
              <>
                <AIIcon className="w-4 h-4" />
                서울로 추천 받기
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
                <p className="text-sm font-semibold text-[#1A1E2E]">오늘의 추천은...?</p>
                <p className="text-[11px] text-[#9CA3AF]">{summaryLabel} 기준으로 생성하고 있어요</p>
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
                  AI 생성
                </span>
              )}
            </div>
            {suggestions.map((s, i) => (
              <div key={i} className="rounded-xl border border-[#E5E1D8] bg-white overflow-hidden">
                <div className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-[#1A1E2E] leading-snug">{s.title}</p>
                      <p className="text-[11px] text-[#2563EB] mt-0.5">{s.place}</p>
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
            <p className="text-sm">상황을 선택하고 추천을 받아보세요</p>
            <p className="text-[11px] mt-1 text-[#C4BFB8]">현재 서울 행사도 반영됩니다</p>
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
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  colorKey: keyof typeof CHIP_COLORS;
  disabled?: boolean;
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
            {opt}
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
