"use client";

import type { POIItem } from "@/app/api/poi/route";

interface Props {
  poi: POIItem;
  onClose: () => void;
  onAskAI: () => void;
  onSetOrigin: () => void;
  onSetDest: () => void;
  isQuestTarget?: boolean;
}

export default function PlaceCard({ poi, onClose, onAskAI, onSetOrigin, onSetDest, isQuestTarget }: Props) {
  const isNight = poi.source === "nightview";

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[420px] max-w-[92vw] z-20 animate-fade-up">
      <div className={`bg-white rounded-2xl overflow-hidden shadow-xl border ${isQuestTarget ? "border-[#2563EB]" : "border-[#E5E1D8]"}`}>
        {/* 썸네일 */}
        {poi.thumbnail && (
          <div className="relative h-32 overflow-hidden bg-[#F5F2EC]">
            <img
              src={poi.thumbnail}
              alt={poi.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-4">
          {/* 상단: 분류 뱃지 + 제목 */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: isNight ? "#FEF3C7" : "#EFF6FF",
                    color: isNight ? "#92400E" : "#1D4ED8",
                    border: `1px solid ${isNight ? "#FDE68A" : "#BFDBFE"}`,
                  }}
                >
                  {isNight ? "야경명소" : "문화행사"}
                </span>
                <span className="text-[10px] text-[#9CA3AF]">{poi.category}</span>
                {isQuestTarget && (
                  <span className="text-[10px] font-display font-bold bg-[#2563EB] text-white px-1.5 py-0.5 rounded">
                    퀘스트
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-[#1A1E2E] mt-1.5 leading-snug">{poi.name}</h3>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-[#F5F2EC] hover:bg-[#E5E1D8] text-[#9CA3AF] hover:text-[#6B7280] flex items-center justify-center shrink-0 transition-colors text-sm"
            >
              ✕
            </button>
          </div>

          {/* 상세 정보 */}
          <div className="mt-3 space-y-1.5 text-[12px] text-[#6B7280]">
            <div className="flex gap-1.5">
              <span className="text-[#9CA3AF] w-12 shrink-0">위치</span>
              <span className="text-[#1A1E2E]">{poi.place}</span>
            </div>
            {poi.date && (
              <div className="flex gap-1.5">
                <span className="text-[#9CA3AF] w-12 shrink-0">일시</span>
                <span className="text-[#1A1E2E]">{poi.date}</span>
              </div>
            )}
            {poi.operating_time && (
              <div className="flex gap-1.5">
                <span className="text-[#9CA3AF] w-12 shrink-0">운영</span>
                <span className="text-[#1A1E2E]">{poi.operating_time}</span>
              </div>
            )}
            {poi.subway && (
              <div className="flex gap-1.5">
                <span className="text-[#9CA3AF] w-12 shrink-0">지하철</span>
                <span className="text-[#1A1E2E]">{poi.subway}</span>
              </div>
            )}
            <div className="flex gap-1.5">
              <span className="text-[#9CA3AF] w-12 shrink-0">요금</span>
              <span className="text-[#1A1E2E]">{poi.fee || "정보 없음"}</span>
            </div>
          </div>

          {/* AI 정보 버튼 */}
          <button
            onClick={onAskAI}
            className="mt-4 w-full rounded-xl py-2.5 text-sm font-semibold bg-[#FE9C00] text-white hover:bg-[#E08800] transition-colors"
          >
            서울로에 물어보기
          </button>

          {/* 경로 설정 버튼 */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={onSetOrigin}
              className="text-[12px] py-2 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A] font-medium hover:bg-[#DCFCE7] transition-colors"
            >
              출발지로 설정
            </button>
            <button
              onClick={onSetDest}
              className="text-[12px] py-2 rounded-lg bg-[#FFF1F2] border border-[#FECDD3] text-[#DC2626] font-medium hover:bg-[#FFE4E6] transition-colors"
            >
              목적지로 설정
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}