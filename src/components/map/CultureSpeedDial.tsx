"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { CULTURE_CATEGORIES, CATEGORY_COLOR, type CultureCategory } from "@/lib/cultureCategories";
import { useLocale } from "@/i18n/LocaleContext";
import { categoryLabel } from "@/i18n/enums";

interface Props {
  activeCategory: CultureCategory | null;
  onSelectCategory: (cat: CultureCategory | null) => void;
}

export default function CultureSpeedDial({ activeCategory, onSelectCategory }: Props) {
  const { t, locale } = useLocale();
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

  const activeColor = activeCategory ? CATEGORY_COLOR[activeCategory].active : "#2563EB";
  const mainBtnStyle = activeCategory
    ? {
        backgroundColor: activeColor,
        borderColor: activeColor,
        color: "#ffffff",
      }
    : isOpen
    ? {
        backgroundColor: "#2563EB",
        borderColor: "#1D4ED8",
        color: "#ffffff",
      }
    : {
        backgroundColor: "#ffffff",
        borderColor: "#FDECC8",
        color: "#6B7280",
      };

  return (
    <div ref={ref} className="relative">
      {/* 메인 버튼 */}
      <button
        onClick={handleMainClick}
        style={mainBtnStyle}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold shadow-md border transition-all whitespace-nowrap"
      >
        <Image
          src="/sidebaricons/culture.png"
          alt=""
          width={18}
          height={18}
          className="object-contain shrink-0"
        />
        {activeCategory ? categoryLabel(activeCategory, locale) : t("map.cultureToggle")}
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
              {categoryLabel(cat, locale)}
            </button>
          );
        })}
      </div>
    </div>
  );
}