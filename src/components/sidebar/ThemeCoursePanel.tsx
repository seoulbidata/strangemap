"use client";

import { useState } from "react";
import { THEME_COURSES, CATEGORY_META, type ThemeCourse, type CourseCategory } from "@/data/themeCourses";

interface Props {
  onSelectCourse: (course: ThemeCourse) => void;
  activeCourseId: string | null;
}

const DIFFICULTY_STYLE = {
  "쉬움":   { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
  "보통":   { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  "어려움": { bg: "#FFF1F2", text: "#DC2626", border: "#FECDD3" },
};

const CATEGORIES = ["전체", "역사", "야경/자연", "서울배경 컨텐츠", "Hot플레이스", "문화"] as const;
type FilterCategory = (typeof CATEGORIES)[number];

export default function ThemeCoursePanel({ onSelectCourse, activeCourseId }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("전체");

  const filtered =
    activeCategory === "전체"
      ? THEME_COURSES
      : THEME_COURSES.filter((c) => c.category === activeCategory);

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-3 border-b border-[#E5E1D8]">
        <h2 className="text-base font-bold text-[#1A1E2E]">테마 코스</h2>
        <p className="text-xs text-[#9CA3AF] mt-0.5">
          {activeCategory === "전체" ? `전체 ${THEME_COURSES.length}개` : `${activeCategory} ${filtered.length}개`} 코스
        </p>
      </div>

      {/* 카테고리 필터 */}
      <div className="px-3 py-2.5 border-b border-[#E5E1D8]">
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                activeCategory === cat
                  ? "bg-[#1B3A6B] text-white"
                  : "bg-[#F5F2EC] text-[#6B7280] hover:bg-[#E5E1D8]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 코스 목록 */}
      <div className="flex-1 overflow-y-auto thin-scroll py-2">
        {filtered.length === 0 && (
          <p className="text-xs text-[#9CA3AF] text-center mt-10">해당 카테고리 코스가 없어요.</p>
        )}
        {filtered.map((course) => {
          const isExpanded = expanded === course.id;
          const isActive = activeCourseId === course.id;
          const diff = DIFFICULTY_STYLE[course.difficulty];
          const catMeta = CATEGORY_META[course.category as CourseCategory];

          return (
            <div
              key={course.id}
              className={`mx-3 mb-2 rounded-xl border bg-white overflow-hidden transition-all ${
                isActive
                  ? "border-[#1B3A6B] shadow-sm"
                  : "border-[#E5E1D8] hover:border-[#C8C4BB]"
              }`}
            >
              {/* 카드 — 클릭으로 펼침 */}
              <button
                onClick={() => setExpanded(isExpanded ? null : course.id)}
                className="w-full text-left"
              >
                {/* 카테고리 색상 상단 바 */}
                <div className="h-0.5 w-full" style={{ background: course.color }} />

                <div className="px-4 pt-3.5 pb-3.5">
                  {/* 상단: 카테고리 + 진행중 */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
                      style={{ background: catMeta.bg, color: catMeta.color, borderColor: catMeta.border }}
                    >
                      {catMeta.label}
                    </span>
                    {isActive && (
                      <span className="text-[9px] font-semibold bg-[#1B3A6B] text-white px-1.5 py-0.5 rounded">
                        진행중
                      </span>
                    )}
                  </div>

                  {/* 제목 */}
                  <p className="text-[14px] font-bold text-[#1A1E2E] leading-snug">{course.title}</p>
                  <p className="text-[11px] text-[#9CA3AF] mt-0.5">{course.subtitle}</p>

                  {/* 관련 작품명 */}
                  {course.mediaTitle && (
                    <p
                      className="text-[10px] mt-1.5 truncate font-medium"
                      style={{ color: course.color }}
                    >
                      {course.mediaTitle}
                    </p>
                  )}

                  {/* 구분선 */}
                  <div className="border-t border-[#F0EDE8] mt-3 pt-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[#9CA3AF]">난이도</span>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
                        style={{ background: diff.bg, color: diff.text, borderColor: diff.border }}
                      >
                        {course.difficulty}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[#9CA3AF]">예상 소요시간</span>
                      <span className="text-[11px] text-[#4B5563] font-medium">{course.totalDuration}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[#9CA3AF]">총 코스</span>
                      <span className="text-[11px] text-[#4B5563] font-medium">{course.stops.length}곳</span>
                    </div>
                  </div>
                </div>
              </button>

              {/* 펼침 — 상세 내용 */}
              {isExpanded && (
                <div className="border-t border-[#F0EDE8] bg-[#FAFAF8]">
                  <div className="px-4 py-4 space-y-4">
                    {/* 코스 설명 */}
                    <p className="text-[12px] text-[#6B7280] leading-relaxed">{course.description}</p>

                    {/* 예상 비용 */}
                    <div className="bg-white border border-[#E5E1D8] rounded-lg px-3 py-2.5">
                      <p className="text-[9px] text-[#9CA3AF] mb-0.5 uppercase tracking-wide">예상 비용</p>
                      <p className="text-[11px] font-semibold text-[#1A1E2E]">{course.estimatedCost}</p>
                    </div>

                    {/* 태그 */}
                    <div className="flex gap-1 flex-wrap">
                      {course.tags.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-2 py-0.5 bg-white border border-[#E5E1D8] text-[#6B7280] rounded-full"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    {/* 경유지 타임라인 */}
                    <div>
                      <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide mb-3">코스 경유지</p>
                      <div>
                        {course.stops.map((stop, i) => (
                          <div key={i} className="flex gap-3">
                            {/* 스텝 인디케이터 */}
                            <div className="flex flex-col items-center shrink-0">
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                                style={{ background: course.color }}
                              >
                                {i + 1}
                              </div>
                              {i < course.stops.length - 1 && (
                                <div
                                  className="w-px flex-1 my-1"
                                  style={{ background: `${course.color}30`, minHeight: 14 }}
                                />
                              )}
                            </div>

                            {/* 정보 */}
                            <div className="pb-3.5 flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="text-[12px] font-semibold text-[#1A1E2E]">{stop.name}</p>
                                <p className="text-[10px] text-[#9CA3AF] shrink-0">{stop.duration}</p>
                              </div>
                              <p className="text-[11px] text-[#6B7280] mt-0.5 leading-relaxed">{stop.preview}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* CTA 버튼 */}
                    <button
                      onClick={() => onSelectCourse(course)}
                      className="w-full py-2.5 rounded-lg text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ background: isActive ? "#374151" : course.color }}
                    >
                      {isActive ? "코스 종료" : "지도에서 코스 보기"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
