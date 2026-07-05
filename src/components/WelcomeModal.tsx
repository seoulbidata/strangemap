"use client";

import { useEffect, useState } from "react";
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* 헤더 */}
        <div className="bg-[#1B3A6B] px-6 py-5">
          <div className="flex items-center gap-2">
            <h1 className="text-white font-bold text-lg tracking-wide">{t("welcome.appName")}</h1>
          </div>
          <p className="text-blue-200 text-xs mt-1">{t("welcome.tagline")}</p>
        </div>

        {/* 본문 */}
        <div className="px-6 py-5 space-y-4 text-sm text-[#1A1E2E]">
          <section>
            <h2 className="font-semibold text-[#1B3A6B] mb-1">{t("welcome.noticeTitle")}</h2>
            <ul className="space-y-1 text-[#44403C] leading-relaxed list-disc list-inside">
              <li>{t("welcome.notice1")}</li>
              <li>{t("welcome.notice2")}</li>
              <li>{t("welcome.notice3")}</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-[#1B3A6B] mb-1">{t("welcome.apiTitle")}</h2>
            <ul className="space-y-1 text-[#44403C] leading-relaxed list-disc list-inside">
              <li>{t("welcome.api1")}</li>
              <li>{t("welcome.api2")}</li>
              <li>{t("welcome.api3")}</li>
              <li>{t("welcome.api4")}</li>
            </ul>
          </section>

          <p className="text-xs text-[#A8A29E] border-t pt-3">{t("welcome.agree")}</p>
        </div>

        {/* 버튼 */}
        <div className="px-6 pb-5">
          <button
            onClick={dismiss}
            className="w-full bg-[#1B3A6B] hover:bg-[#15306A] active:bg-[#0f2347] text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {t("welcome.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
