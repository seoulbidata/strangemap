"use client";

import { useState, useRef, useEffect } from "react";
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleMainClick() {
    setIsOpen((v) => !v);
    if (isOpen && activeCategory) onSelectCategory(null);
  }

  function handleChipClick(cat: CultureCategory) {
    onSelectCategory(activeCategory === cat ? null : cat);
  }

  return (
    <div ref={ref} className="relative">
      {/* 메인 버튼 */}
      <button
        onClick={handleMainClick}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold shadow-md border transition-all whitespace-nowrap ${
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
        {activeCategory ? CATEGORY_LABEL[activeCategory] : "문화행사 위치"}
        <span
          className="text-[10px] ml-0.5 transition-transform duration-200 inline-block"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▼
        </span>
      </button>

      {/* 드롭다운 아이템 — 항상 렌더, stagger 애니메이션으로 아래로 등장 */}
      <div className="absolute top-full left-0 mt-1.5 flex flex-col gap-1 z-30">
        {CULTURE_CATEGORIES.map((cat, i) => {
          const color = CATEGORY_COLOR[cat];
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => handleChipClick(cat)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold shadow-md border whitespace-nowrap text-left"
              style={{
                background: isActive ? color.active : color.bg,
                color: isActive ? "#fff" : color.text,
                borderColor: isActive ? color.active : "transparent",
                opacity: isOpen ? 1 : 0,
                transform: isOpen ? "translateY(0)" : "translateY(-8px)",
                pointerEvents: isOpen ? "auto" : "none",
                transitionProperty: "opacity, transform",
                transitionDuration: "220ms",
                transitionDelay: isOpen ? `${i * 60}ms` : "0ms",
                transitionTimingFunction: isOpen
                  ? "cubic-bezier(0.34, 1.56, 0.64, 1)"
                  : "ease-in",
              }}
            >
              {CATEGORY_LABEL[cat]}
            </button>
          );
        })}
      </div>
    </div>
  );
}