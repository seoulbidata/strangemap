"use client";

import { useState } from "react";
import { THEME_COURSES, type ThemeCourse } from "@/data/themeCourses";

interface Props {
  onSelectCourse: (course: ThemeCourse) => void;
  activeCourseId: string | null;
}

const DIFFICULTY_COLOR = {
  "쉬움": { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
  "보통": { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  "어려움": { bg: "#FFF1F2", text: "#DC2626", border: "#FECDD3" },
};

export default function ThemeCoursePanel({ onSelectCourse, activeCourseId }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-4 border-b border-[#E5E1D8]">
        <h2 className="text-base font-bold text-[#1A1E2E]">테마 코스</h2>
        <p className="text-xs text-[#9CA3AF] mt-0.5">서울로가 추천하는 코스 {THEME_COURSES.length}개</p>
      </div>

      <div className="flex-1 overflow-y-auto thin-scroll py-2">
        {THEME_COURSES.map((course) => {
          const isExpanded = expanded === course.id;
          const isActive = activeCourseId === course.id;
          const diff = DIFFICULTY_COLOR[course.difficulty];

          return (
            <div
              key={course.id}
              className={`mx-3 mb-2 rounded-xl border overflow-hidden transition-all ${
                isActive ? "border-[#1B3A6B] shadow-sm" : "border-[#E5E1D8]"
              }`}
            >
              {/* 카드 헤더 */}
              <button
                onClick={() => setExpanded(isExpanded ? null : course.id)}
                className="w-full text-left px-4 py-3.5 hover:bg-[#F5F2EC] transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* 색상 인디케이터 */}
                  <div
                    className="w-1 h-12 rounded-full shrink-0 mt-0.5"
                    style={{ background: course.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[#1A1E2E] leading-snug">{course.title}</p>
                        <p className="text-[11px] text-[#9CA3AF] mt-0.5">{course.subtitle}</p>
                      </div>
                      {isActive && (
                        <span className="text-[9px] font-display bg-[#1B3A6B] text-white px-1.5 py-0.5 rounded shrink-0">
                          진행중
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded border font-medium"
                        style={{ background: diff.bg, color: diff.text, borderColor: diff.border }}
                      >
                        {course.difficulty}
                      </span>
                      <span className="text-[10px] text-[#9CA3AF]">{course.totalDuration}</span>
                      <span className="text-[10px] text-[#9CA3AF]">{course.distance}</span>
                      <span className="text-[10px] text-[#9CA3AF]">경유 {course.stops.length}곳</span>
                    </div>
                  </div>
                </div>
              </button>

              {/* 펼침 내용 */}
              {isExpanded && (
                <div className="px-4 pb-4 bg-[#FAFAF8] border-t border-[#E5E1D8] animate-fade-up">
                  <p className="text-[12px] text-[#6B7280] py-3 leading-relaxed">{course.description}</p>

                  {/* 태그 */}
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {course.tags.map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 bg-white border border-[#E5E1D8] text-[#6B7280] rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>

                  {/* 경유지 목록 */}
                  <div className="space-y-0">
                    {course.stops.map((stop, i) => (
                      <div key={i} className="flex gap-3">
                        {/* 스텝 인디케이터 */}
                        <div className="flex flex-col items-center shrink-0">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                            style={{ background: course.color }}
                          >
                            {i + 1}
                          </div>
                          {i < course.stops.length - 1 && (
                            <div className="w-px flex-1 bg-[#E5E1D8] my-1" style={{ minHeight: 16 }} />
                          )}
                        </div>
                        {/* 내용 */}
                        <div className="pb-3 flex-1">
                          <p className="text-[12px] font-semibold text-[#1A1E2E]">{stop.name}</p>
                          <p className="text-[11px] text-[#9CA3AF] mt-0.5 leading-relaxed">{stop.description}</p>
                          <p className="text-[10px] text-[#6B7280] mt-0.5">{stop.duration}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 지도에서 보기 버튼 */}
                  <button
                    onClick={() => onSelectCourse(course)}
                    className="mt-2 w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{ background: course.color }}
                  >
                    {isActive ? "끝내기" : "지도에서 코스 보기"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
