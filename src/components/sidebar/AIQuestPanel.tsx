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
type TimeType = "낮" | "저녁" | "밤";
type MoodType = "실내" | "실외" | "맛집" | "문화" | "휴식";

const MOCK_SUGGESTIONS: Record<string, Suggestion[]> = {
  default: [
    {
      title: "청계천 산책 후 광장시장 투어",
      place: "청계천 → 광장시장",
      duration: "약 2시간",
      description: "청계천을 따라 걸으며 서울 도심의 물길을 느끼고, 광장시장에서 전통 먹거리를 즐기세요.",
      reason: "가볍게 걷기 좋고 먹거리가 풍성해 누구에게나 추천합니다.",
      tags: ["산책", "맛집", "도심"],
    },
    {
      title: "경복궁 야간개장",
      place: "경복궁",
      duration: "약 1시간 30분",
      description: "조명이 켜진 경복궁은 낮과 전혀 다른 분위기. 사전 예약 필수입니다.",
      reason: "저녁 시간대에 가장 아름다운 서울의 야경을 만날 수 있습니다.",
      tags: ["역사", "야경", "문화"],
    },
    {
      title: "성수동 카페 & 브런치 투어",
      place: "성수동 카페거리",
      duration: "약 3시간",
      description: "공장을 개조한 독특한 카페들이 즐비. 감성적인 사진과 맛있는 브런치를 동시에.",
      reason: "서울에서 가장 힙한 동네로 새로운 감성을 찾는 분께 딱 맞습니다.",
      tags: ["카페", "브런치", "감성"],
    },
  ],
  "혼자-밤-실외": [
    {
      title: "남산 야경 드라이브 & 산책",
      place: "남산서울타워",
      duration: "약 2시간",
      description: "남산 케이블카나 버스로 올라가 서울 야경을 혼자 조용히 감상하세요.",
      reason: "혼자 밤에 걷기 안전하고, 서울 전경이 한눈에 들어와 힐링이 됩니다.",
      tags: ["야경", "혼자", "힐링"],
    },
    {
      title: "한강 야간 자전거",
      place: "여의도한강공원",
      duration: "약 2시간",
      description: "자전거 대여 후 한강변을 달리며 서울의 밤을 느끼세요.",
      reason: "혼자만의 시간을 즐기기 최적. 야간에도 불빛이 충분해 안전합니다.",
      tags: ["자전거", "한강", "야간"],
    },
  ],
  "커플-저녁-실외": [
    {
      title: "반포한강공원 달빛무지개분수",
      place: "반포한강공원",
      duration: "약 2시간",
      description: "세계 최장 교량분수의 야간 쇼와 세빛섬 야경을 함께 즐기세요.",
      reason: "커플 야경 명소 1위. 분수 쇼 시간대(20~22시)에 맞춰 방문하세요.",
      tags: ["야경", "커플", "분수"],
    },
    {
      title: "북촌 야간 골목 산책",
      place: "북촌한옥마을",
      duration: "약 1시간 30분",
      description: "골목 조명이 켜진 북촌을 둘이서 천천히 걷는 낭만적인 코스.",
      reason: "낮보다 조용하고 사람이 적어 오히려 더 운치 있는 분위기.",
      tags: ["한옥", "야간", "산책"],
    },
  ],
};

function getSuggestions(companion: CompanionType, time: TimeType, mood: MoodType): Suggestion[] {
  const key = `${companion}-${time}-${mood}`;
  return MOCK_SUGGESTIONS[key] ?? MOCK_SUGGESTIONS["default"];
}

export default function AIQuestPanel() {
  const [companion, setCompanion] = useState<CompanionType>("친구");
  const [time, setTime] = useState<TimeType>("저녁");
  const [mood, setMood] = useState<MoodType>("실외");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRecommend = async () => {
    setLoading(true);
    setSuggestions(null);
    await new Promise((r) => setTimeout(r, 1200));
    setSuggestions(getSuggestions(companion, time, mood));
    setLoading(false);
  };

  const companions: CompanionType[] = ["혼자", "친구", "커플", "가족"];
  const times: TimeType[] = ["낮", "저녁", "밤"];
  const moods: MoodType[] = ["실내", "실외", "맛집", "문화", "휴식"];

  return (
    <div className="flex flex-col h-full">
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
        <div className="px-4 py-4 space-y-4 border-b border-[#E5E1D8]">
          <ChipGroup
            label="동행"
            options={companions}
            value={companion}
            onChange={(v) => setCompanion(v as CompanionType)}
            color="#1B3A6B"
          />
          <ChipGroup
            label="시간대"
            options={times}
            value={time}
            onChange={(v) => setTime(v as TimeType)}
            color="#D97706"
          />
          <ChipGroup
            label="분위기"
            options={moods}
            value={mood}
            onChange={(v) => setMood(v as MoodType)}
            color="#16A34A"
          />
        </div>

        {/* 추천 버튼 */}
        <div className="px-4 py-3">
          <button
            onClick={handleRecommend}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#1B3A6B] text-white text-sm font-semibold hover:bg-[#153060] transition-colors disabled:opacity-60"
          >
            {loading ? "추천 생성 중..." : "AI 추천 받기"}
          </button>
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="px-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-[#E5E1D8] p-4 space-y-2 animate-pulse">
                <div className="h-3 bg-[#F0EDE8] rounded w-3/4" />
                <div className="h-2.5 bg-[#F0EDE8] rounded w-full" />
                <div className="h-2.5 bg-[#F0EDE8] rounded w-5/6" />
              </div>
            ))}
          </div>
        )}

        {/* 추천 결과 */}
        {suggestions && !loading && (
          <div className="px-4 pb-4 space-y-3 animate-fade-up">
            <p className="text-[10px] text-[#9CA3AF] pt-1">
              {companion} · {time} · {mood} 기준 추천
            </p>
            {suggestions.map((s, i) => (
              <div key={i} className="rounded-xl border border-[#E5E1D8] bg-white overflow-hidden">
                <div className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-[#1A1E2E] leading-snug">{s.title}</p>
                      <p className="text-[11px] text-[#2563EB] mt-0.5">{s.place}</p>
                    </div>
                    <span className="text-[10px] text-[#9CA3AF] shrink-0">{s.duration}</span>
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
            <p className="text-[9px] text-[#D1CEC7] text-center pb-2">AI 생성 콘텐츠 · 실제 AI 연동 예정</p>
          </div>
        )}

        {/* 초기 상태 */}
        {!suggestions && !loading && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center text-[#9CA3AF]">
            <div className="w-12 h-12 rounded-xl bg-[#F5F2EC] flex items-center justify-center mb-3">
              <AIIcon className="w-6 h-6" />
            </div>
            <p className="text-sm">상황을 선택하고 추천을 받아보세요</p>
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
  color,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  color: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">{label}</p>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border"
            style={
              value === opt
                ? { background: color, color: "#fff", borderColor: color }
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
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M6.34 6.34l1.42 1.42M16.24 16.24l1.42 1.42M6.34 17.66l1.42-1.42M16.24 7.76l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
