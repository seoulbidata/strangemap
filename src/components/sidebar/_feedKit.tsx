"use client";

import type { ReactNode } from "react";

/**
 * 사이드바 피드 공통 디자인 키트.
 * 관광코스(CourseCollection)의 톤을 문화행사·야경명소·혼잡도 패널이 공유하기 위한 부품.
 * - 배경 #FBFAF7, 라운드 카드(rounded-[22px]) + 부드러운 그림자 + hover 인터랙션
 * - 필터는 rounded-full pill, 강조색은 다크 네이비 #16243C 단일 톤
 */

// ── 피드 셸 ────────────────────────────────────────────────────────────────────
// 패널 루트. 배경 톤을 통일한다.
export function FeedShell({ children }: { children: ReactNode }) {
  return <div className="flex flex-col h-full bg-[#FBFAF7]">{children}</div>;
}

// ── 헤더 ────────────────────────────────────────────────────────────────────────
// 데스크톱에서만 노출(md:block hidden)되는 패널 제목 영역.
export function FeedHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-6 pt-7 pb-5 md:block hidden">
      <h2 className="text-[22px] font-bold text-[#16243C] leading-tight tracking-[-0.01em]">{title}</h2>
      {subtitle && <p className="text-[13px] text-[#8B8678] mt-1">{subtitle}</p>}
    </div>
  );
}

// ── 필터 pill ────────────────────────────────────────────────────────────────────
export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  renderLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  /** 값은 한글 그대로 두고 표시 라벨만 바꿀 때(영문 모드) 사용 */
  renderLabel?: (v: T) => string;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`shrink-0 px-3.5 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all ${
              active
                ? "bg-[#16243C] text-white shadow-[0_3px_10px_rgba(22,36,60,0.18)]"
                : "bg-white text-[#5C5950] border border-[#ECE8E0] hover:border-[#D6D1C7]"
            }`}
          >
            {renderLabel ? renderLabel(opt) : opt}
          </button>
        );
      })}
    </div>
  );
}

// ── 피드 카드 셸 ──────────────────────────────────────────────────────────────────
// 관광코스 카드와 동일한 라운드/그림자/hover. 내부 콘텐츠는 각 패널이 children으로 채운다.
export function FeedCard({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="group relative rounded-[22px] bg-white overflow-hidden transition-all duration-200 hover:-translate-y-0.5 shadow-[0_6px_24px_rgba(20,30,50,0.07)] hover:shadow-[0_14px_40px_rgba(20,30,50,0.14)]">
      <button onClick={onClick} className="w-full text-left block">
        {children}
      </button>
    </div>
  );
}

// ── 히어로 위 칩 ──────────────────────────────────────────────────────────────────
export function HeroChip({
  children,
  tone = "light",
}: {
  children: ReactNode;
  tone?: "light" | "dark" | "blue";
}) {
  const cls =
    tone === "dark"
      ? "bg-[#16243C] text-white"
      : tone === "blue"
        ? "bg-[#2563EB] text-white"
        : "bg-white/85 backdrop-blur-sm text-[#16243C]";
  return <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${cls}`}>{children}</span>;
}

// ── 태그 pill ────────────────────────────────────────────────────────────────────
export function TagPill({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-medium px-2.5 py-1 bg-[#F4F2EC] text-[#8B8678] rounded-full">
      {children}
    </span>
  );
}
