"use client";

import { CATEGORY_META, type ThemeCourse, type CourseStop } from "@/data/themeCourses";

interface Props {
  course: ThemeCourse;
  stop: CourseStop;
  stopIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function CourseStopCard({ course, stop, stopIndex, onClose, onPrev, onNext }: Props) {
  const catMeta = CATEGORY_META[course.category];
  const total = course.stops.length;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[380px] max-w-[92vw] z-20 animate-fade-up">
      <div className="bg-white rounded-2xl overflow-hidden shadow-xl border border-[#E5E1D8]">
        {/* 상단 컬러 바 */}
        <div className="h-1 w-full" style={{ background: course.color }} />

        <div className="p-4">
          {/* 헤더 */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
                  style={{ background: catMeta.bg, color: catMeta.color, borderColor: catMeta.border }}
                >
                  {catMeta.label}
                </span>
                <span className="text-[10px] text-[#9CA3AF] truncate">{course.title}</span>
              </div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <h3 className="text-[15px] font-bold text-[#1A1E2E] leading-snug">{stop.name}</h3>
                <span className="text-[10px] text-[#9CA3AF] shrink-0">{stopIndex + 1} / {total}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-[#F5F2EC] hover:bg-[#E5E1D8] text-[#9CA3AF] hover:text-[#6B7280] flex items-center justify-center shrink-0 transition-colors text-sm"
            >
              ✕
            </button>
          </div>

          {/* 체류 시간 */}
          <div className="flex items-center gap-1.5 mt-2.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-[#9CA3AF]">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span className="text-[11px] text-[#6B7280]">권장 체류 {stop.duration}</span>
          </div>

          {/* 추천 이유 / 이 장소에서 느낄 것 */}
          <p className="text-[12px] text-[#4B5563] mt-3 leading-relaxed">{stop.description}</p>

          {/* Tip */}
          {stop.tip && (
            <div className="mt-2.5 border-l-2 pl-3 py-0.5" style={{ borderColor: course.color + "60" }}>
              <p className="text-[11px] text-[#6B7280] leading-relaxed">{stop.tip}</p>
            </div>
          )}

          {/* 코스 이동 버튼 */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={onPrev}
              disabled={stopIndex === 0}
              className="text-[12px] py-2 rounded-lg border font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-[#F5F2EC] border-[#E5E1D8] text-[#4B5563] hover:bg-[#E5E1D8]"
            >
              ← 이전 코스
            </button>
            <button
              onClick={onNext}
              disabled={stopIndex === total - 1}
              className="text-[12px] py-2 rounded-lg border font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-white hover:opacity-90"
              style={{ background: course.color, borderColor: course.color }}
            >
              다음 코스 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
