"use client";

import Image from "next/image";

export type MobileTabId = "culture" | "night" | "course" | "now" | "search" | "route";

const TABS: { id: MobileTabId; label: string; icon: string }[] = [
  { id: "culture", label: "문화행사", icon: "/sidebaricons/culture.png" },
  { id: "night", label: "야경명소", icon: "/sidebaricons/night.png" },
  { id: "course", label: "코스", icon: "/sidebaricons/course.png" },
  { id: "now", label: "혼잡도", icon: "/sidebaricons/now.png" },
];

interface Props {
  activeTab: MobileTabId | null;
  onTabChange: (tab: MobileTabId | null) => void;
}

export default function MobileNavigation({ activeTab, onTabChange }: Props) {
  const toggle = (id: MobileTabId) => {
    onTabChange(activeTab === id ? null : id);
  };

  return (
    <nav className="fixed left-0 right-0 bottom-0 z-40 border-t border-[#FDECC8] bg-white/95 backdrop-blur-md shadow-[0_-8px_24px_rgba(0,0,0,0.06)] md:hidden">
      <div className="flex items-center justify-around px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => toggle(tab.id)}
              className={`h-12 min-w-0 flex-1 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive
                  ? "bg-[#FE9C00]/10 text-[#D97706]"
                  : "text-[#6B7280] hover:bg-[#FFF8E7]/50"
              }`}
              title={tab.label}
            >
              <div className={`p-1 rounded-lg transition-transform ${isActive ? "scale-110" : ""}`}>
                <Image
                  src={tab.icon}
                  alt=""
                  width={22}
                  height={22}
                  className={`object-contain ${isActive ? "" : "opacity-75 grayscale-[20%]"}`}
                />
              </div>
              <span className={`text-[9px] font-bold leading-none ${isActive ? "text-[#D97706]" : "text-[#6B7280]"}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
