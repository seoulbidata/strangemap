"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useLocale } from "@/i18n/LocaleContext";

const STORAGE_KEY = "seoulro_welcome_dismissed";
const CACHE_MINUTES = 60;

export default function WelcomeModal() {
  const [visible, setVisible] = useState(false);
  const { t } = useLocale();

  useEffect(() => {

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { dismissedAt } = JSON.parse(raw);
      const elapsed = (Date.now() - dismissedAt) / 1000 / 60;
      if (elapsed < CACHE_MINUTES) return;
    }
    setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dismissedAt: Date.now() }));
    setVisible(false);
  }

  if (!visible) return null;

  const features = [
    { icon: "/sidebaricons/night.png", title: t("welcome.feature1Title"), desc: t("welcome.feature1Desc") },
    { icon: "/sidebaricons/course.png", title: t("welcome.feature2Title"), desc: t("welcome.feature2Desc") },
    { icon: "/sidebaricons/now.png", title: t("welcome.feature3Title"), desc: t("welcome.feature3Desc") },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#1A1E2E]/60 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden ring-1 ring-black/5">
        {/* 헤더 */}
        <div className="bg-gradient-to-b from-[#FFFBEB] to-white px-6 pt-8 pb-6 text-center border-b border-[#FDECC8]">
          <h1 className="font-display text-[#1B3A6B] text-2xl font-extrabold tracking-tight">
            {t("welcome.appName")}
          </h1>
          <p className="text-[#B45309] text-sm font-medium mt-2">{t("welcome.tagline")}</p>
        </div>

        {/* 본문 */}
        <div className="px-6 py-6">
          <p className="text-[13.5px] text-[#57534E] leading-relaxed text-center mb-5">
            {t("welcome.intro")}
          </p>

          <ul className="divide-y divide-[#FDECC8]">
            {features.map((f) => (
              <li key={f.title} className="flex items-center gap-3.5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FE9C00]/15 overflow-hidden">
                  <Image src={f.icon} alt="" width={24} height={24} className="object-contain" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-[#1A1E2E] text-sm">{f.title}</p>
                  <p className="text-xs text-[#8A857C] mt-0.5 leading-relaxed">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* 버튼 */}
        <div className="px-6 pb-6">
          <button
            onClick={dismiss}
            className="w-full bg-[#FE9C00] hover:bg-[#E58900] active:bg-[#D97706] text-white font-semibold py-3.5 rounded-xl transition-colors"
          >
            {t("welcome.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
