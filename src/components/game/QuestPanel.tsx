"use client";

import { useEffect, useState } from "react";
import type { RegionChapter, StoryQuest } from "@/types/quest";

interface QuestPanelProps {
  open: boolean;
  onClose: () => void;
  activeQuestId: string | null;
  onSelectQuest: (quest: StoryQuest) => void;
}

const DIFFICULTY_LABEL = ["", "쉬움", "보통", "어려움"] as const;

export default function QuestPanel({ open, onClose, activeQuestId, onSelectQuest }: QuestPanelProps) {
  const [chapters, setChapters] = useState<RegionChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/chapters")
      .then((r) => r.json())
      .then((d) => {
        setChapters(d.chapters);
        setExpandedChapter(d.chapters[0]?.id ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <aside
      className={`absolute top-0 bottom-0 right-0 w-[380px] max-w-[92vw] z-30 transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="h-full bg-white border-l border-[#E5E1D8] flex flex-col shadow-xl">
        {/* 헤더 */}
        <div className="px-5 pt-5 pb-4 border-b border-[#E5E1D8]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-display tracking-[0.2em] text-[#9CA3AF] uppercase">Chapter Index</p>
              <h2 className="text-lg font-bold text-[#1A1E2E] mt-0.5">서울 탐험 챕터</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-[#F5F2EC] hover:bg-[#E5E1D8] text-[#6B7280] flex items-center justify-center text-sm transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-[#9CA3AF] mt-2 leading-relaxed">
            지역별 스토리를 따라가며 서울의 숨은 이야기를 해금하세요.
          </p>
        </div>

        {/* 챕터 목록 */}
        <div className="flex-1 overflow-y-auto thin-scroll px-4 py-4 space-y-2">
          {loading && (
            <div className="text-center text-xs text-[#9CA3AF] py-12">챕터 불러오는 중...</div>
          )}

          {chapters.map((ch) => {
            const isOpen = expandedChapter === ch.id;
            return (
              <div
                key={ch.id}
                className="rounded-xl border border-[#E5E1D8] overflow-hidden"
              >
                <button
                  onClick={() => setExpandedChapter(isOpen ? null : ch.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F5F2EC] transition-colors"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${ch.color}18`, border: `1px solid ${ch.color}40` }}
                  >
                    {ch.cover}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#1A1E2E] truncate">{ch.regionName}</div>
                    <div className="text-[11px] text-[#9CA3AF] mt-0.5">퀘스트 {ch.quests.length}개</div>
                  </div>
                  <span
                    className="text-[#9CA3AF] text-xs transition-transform"
                    style={{ display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                  >
                    ▶
                  </span>
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 pt-1 space-y-2 bg-[#FAFAF8] animate-fade-up">
                    <p className="text-[11px] text-[#9CA3AF] px-1 leading-relaxed">{ch.description}</p>
                    {ch.quests.map((q) => {
                      const active = activeQuestId === q.id;
                      return (
                        <button
                          key={q.id}
                          onClick={() => onSelectQuest(q)}
                          className={`w-full text-left rounded-lg p-3 transition-all border ${
                            active
                              ? "bg-[#EFF6FF] border-[#2563EB]/40"
                              : "bg-white border-[#E5E1D8] hover:border-[#D1CEC7] hover:bg-[#F9F8F6]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-semibold text-[#1A1E2E] leading-snug">
                                {q.title}
                              </div>
                              <div className="text-[11px] text-[#6B7280] mt-1 leading-relaxed line-clamp-2">
                                {q.synopsis}
                              </div>
                            </div>
                            {active && (
                              <span className="text-[9px] font-display bg-[#2563EB] text-white px-1.5 py-0.5 rounded shrink-0">
                                진행중
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-[10px] text-[#9CA3AF]">
                            <span>{DIFFICULTY_LABEL[q.difficulty]}</span>
                            <span>약 {q.estimatedMinutes}분</span>
                            <span>장소 {q.objectives.length}곳</span>
                            <span className="ml-auto text-[#D97706] font-semibold">+{q.reward.xp} XP</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
