"use client";

import { useState } from "react";
import { CULTURE_CATEGORIES, CATEGORY_COLOR, type CultureCategory } from "@/lib/cultureCategories";

interface Props {
  activeCategory: CultureCategory | null;
  onSelectCategory: (cat: CultureCategory | null) => void;
}

const CATEGORY_LABEL: Record<CultureCategory, string> = {
  공연: "공연",
  전시: "전시",
  "교육/체험": "교육/체험",
  축제: "축제",
  음악: "음악",
};

export default function CultureSpeedDial({ activeCategory, onSelectCategory }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  function handleMainClick() {
    setIsOpen((v) => !v);
    if (isOpen && activeCategory) {
      onSelectCategory(null);
    }
  }

  function handleChipClick(cat: CultureCategory) {
    onSelectCategory(activeCategory === cat ? null : cat);
  }

  return (
    <div className="flex items-center gap-2">
      {/* 카테고리 칩들 — 왼쪽 방향으로 펼쳐짐 */}
      <div className="flex items-center gap-1.5">
        {CULTURE_CATEGORIES.map((cat, i) => {
          const color = CATEGORY_COLOR[cat];
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => handleChipClick(cat)}
              className="whitespace-nowrap text-[11px] font-semibold px-3 py-1.5 rounded-full shadow-md border transition-all duration-200"
              style={{
                background: isActive ? color.active : color.bg,
                color: isActive ? "#fff" : color.text,
                borderColor: isActive ? color.active : "transparent",
                opacity: isOpen ? 1 : 0,
                transform: isOpen ? "translateX(0)" : "translateX(32px)",
                pointerEvents: isOpen ? "auto" : "none",
                transitionProperty: "opacity, transform",
                transitionDuration: "250ms",
                transitionDelay: isOpen ? `${i * 80}ms` : "0ms",
                transitionTimingFunction: isOpen ? "cubic-bezier(0.34, 1.56, 0.64, 1)" : "ease-in",
              }}
            >
              {CATEGORY_LABEL[cat]}
            </button>
          );
        })}
      </div>

      {/* 메인 버튼 */}
      <button
        onClick={handleMainClick}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold shadow-md border transition-all ${
          isOpen || activeCategory
            ? "bg-[#2563EB] text-white border-[#1D4ED8]"
            : "bg-white text-[#6B7280] border-[#FDECC8] hover:border-[#2563EB] hover:text-[#2563EB]"
        }`}
      >
        <span
          className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
          style={{
            background: isOpen || activeCategory ? "#fff" : "#2563EB",
            border: `2px solid ${isOpen || activeCategory ? "rgba(255,255,255,0.5)" : "#1D4ED8"}`,
          }}
        />
        문화행사
      </button>
    </div>
  );
}