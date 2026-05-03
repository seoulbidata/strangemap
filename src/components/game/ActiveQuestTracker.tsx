"use client";

import type { StoryQuest } from "@/types/quest";

interface Props {
  quest: StoryQuest;
  currentIndex: number;
  onFocusObjective: (index: number) => void;
  onAbandon: () => void;
}

export default function ActiveQuestTracker({ quest, currentIndex, onFocusObjective, onAbandon }: Props) {
  const current = quest.objectives[currentIndex];
  const progress = Math.round((currentIndex / quest.objectives.length) * 100);

  return (
    <div className="absolute top-24 left-4 z-20 w-[300px] animate-fade-up">
      <div className="bg-white rounded-xl shadow-lg border border-[#E5E1D8] overflow-hidden">
        {/* 헤더 */}
        <div className="px-4 pt-3 pb-2 border-b border-[#E5E1D8]">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-display tracking-[0.2em] text-[#9CA3AF] uppercase">진행 중인 퀘스트</span>
            <button
              onClick={onAbandon}
              className="text-[11px] text-[#9CA3AF] hover:text-[#6B7280] px-1 transition-colors"
              title="퀘스트 종료"
            >
              ✕
            </button>
          </div>
          <div className="text-[13px] font-bold text-[#1A1E2E] mt-1 leading-snug">{quest.title}</div>
          {/* 진행률 바 */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-[#E5E1D8] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#16A34A] rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-[#9CA3AF] shrink-0">
              {currentIndex}/{quest.objectives.length}
            </span>
          </div>
        </div>

        {/* 현재 목표 */}
        {current && (
          <div className="px-4 py-3 bg-[#F0F9FF] border-b border-[#E0F2FE]">
            <div className="flex items-center gap-1.5 text-[10px] text-[#0369A1] font-semibold mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse inline-block" />
              다음 목적지
            </div>
            <div className="text-sm font-bold text-[#1A1E2E]">{current.title}</div>
            <div className="text-[11px] text-[#6B7280] mt-1 leading-relaxed">{current.hint}</div>
            <div className="text-[10px] text-[#2563EB] mt-1.5 font-medium">{current.poiName}</div>
          </div>
        )}

        {/* 목표 목록 */}
        <div className="px-2 py-2">
          {quest.objectives.map((o, i) => (
            <button
              key={o.id}
              onClick={() => onFocusObjective(i)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[11px] transition-colors ${
                i < currentIndex
                  ? "text-[#16A34A]"
                  : i === currentIndex
                  ? "bg-[#EFF6FF] text-[#1D4ED8] font-semibold"
                  : "text-[#9CA3AF] hover:text-[#6B7280]"
              }`}
            >
              <span className="w-4 text-center shrink-0">
                {i < currentIndex ? "✓" : i === currentIndex ? "▶" : "○"}
              </span>
              <span className="flex-1 truncate">{o.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
