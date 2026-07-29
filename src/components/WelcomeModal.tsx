"use client";

/**
 * 첫 진입 웰컴 다이얼로그.
 *
 * SEED Design(당근)의 다이얼로그 규칙 — 헤더(제목·설명) / 본문 / 액션, 한 화면에 solid 액션 하나 —
 * 을 따르되, 모바일 시트가 아니라 "웹사이트 다이얼로그"로 짰다. 웹에서만 성립하는 것들:
 *  · 가로를 쓰는 2단 구성 — 왼쪽 브랜드 패널 / 오른쪽 기능 2×2 그리드 (모바일에선 세로로 쌓임)
 *  · ESC 닫기 · 바깥 클릭 닫기 · 우상단 X — 앱 시트엔 없고 웹에만 있는 해제 수단
 *  · 포커스 이동/복원 + Tab 포커스 트랩, 열려 있는 동안 배경 스크롤 잠금
 *  · hover/focus-visible 등 포인터·키보드 전용 상태
 * 색은 앱 브랜드 그대로 — 네이비 #16243C 패널, 오렌지 #FE9C00 CTA(사이드바 활성 탭과 같은 값).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useLocale } from "@/i18n/LocaleContext";

const STORAGE_KEY = "seoulro_welcome_dismissed";
const CACHE_MINUTES = 60;

export default function WelcomeModal() {
  const [visible, setVisible] = useState(false);
  const { t } = useLocale();
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { dismissedAt } = JSON.parse(raw);
      const elapsed = (Date.now() - dismissedAt) / 1000 / 60;
      if (elapsed < CACHE_MINUTES) return;
    }
    setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dismissedAt: Date.now() }));
    setVisible(false);
  }, []);

  // 열려 있는 동안 — 배경 스크롤 잠금 · 포커스 이동/복원 · ESC 닫기 · Tab 트랩
  useEffect(() => {
    if (!visible) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    // body 인라인 overflow 를 건드리는 곳은 이 컴포넌트뿐이라, 닫을 때 "직전 값 복원"이 아니라
    // 빈 값으로 되돌린다 — 개발 모드 이펙트 재실행처럼 마운트가 겹쳐도 hidden 이 남지 않는다.
    document.body.style.overflow = "hidden";
    // 버튼이 아니라 다이얼로그 자체에 포커스를 준다 — 스크린리더/키보드 진입점은 확보하면서
    // 마우스로 들어온 사람에게 버튼 포커스 링이 뜨진 않게.
    dialogRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // 포커스 트랩 — 다이얼로그 밖(지도·사이드바)으로 탭이 새어나가지 않게 양끝을 이어붙인다
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      restoreFocusRef.current?.focus?.();
    };
  }, [visible, dismiss]);

  if (!visible) return null;

  const features = [
    { icon: "/sidebaricons/night.png", title: t("welcome.feature1Title"), desc: t("welcome.feature1Desc") },
    { icon: "/sidebaricons/course.png", title: t("welcome.feature4Title"), desc: t("welcome.feature4Desc") },
    { icon: "/sidebaricons/ai.png", title: t("welcome.feature2Title"), desc: t("welcome.feature2Desc") },
    { icon: "/sidebaricons/now.png", title: t("welcome.feature3Title"), desc: t("welcome.feature3Desc") },
  ];

  return (
    <div
      className="wm-backdrop fixed inset-0 z-[9999] flex items-center justify-center bg-[#0E1420]/60 backdrop-blur-[3px] p-4 sm:p-6 overflow-y-auto"
      // 바깥 클릭으로 닫기 — mousedown 기준이라 다이얼로그 안에서 시작한 드래그로는 닫히지 않는다
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-intro"
        tabIndex={-1}
        className="wm-dialog focus:outline-none relative w-full max-w-[900px] my-auto rounded-[26px] bg-white shadow-[0_32px_90px_rgba(10,16,28,0.34)] ring-1 ring-black/5 overflow-hidden grid md:grid-cols-[318px_1fr]"
      >
        {/* ── 왼쪽 · 브랜드 패널 (모바일에선 위쪽 밴드) ───────────────────── */}
        <aside className="relative overflow-hidden bg-[linear-gradient(165deg,#1E3055_0%,#16243C_52%,#101A2C_100%)] px-7 py-8 md:py-9 text-white">
          <RouteMotif />

          <div className="relative">
            {/* 원본이 1MB대라 dev 최적화가 느리다 — 사이드바 로고와 같은 48px 요청으로 맞춰
                최적화 결과를 공유하고, 첫 화면이라 priority 로 먼저 받는다. */}
            <Image
              src="/icons/logo.png"
              alt=""
              width={48}
              height={48}
              priority
              className="rounded-2xl ring-1 ring-white/15 shadow-[0_6px_18px_rgba(0,0,0,0.28)]"
            />
            <h1
              id="welcome-title"
              className="font-display mt-4 text-[26px] font-extrabold tracking-tight leading-tight"
            >
              {t("welcome.appName")}
            </h1>
            <p className="mt-1 text-[13px] font-semibold text-[#FDBA55]">{t("welcome.tagline")}</p>

            <div className="mt-5 h-px w-10 bg-white/20" aria-hidden />

            <p id="welcome-intro" className="mt-5 text-[12.5px] leading-[1.85] text-white/70">
              {t("welcome.intro")}
            </p>
          </div>
        </aside>

        {/* ── 오른쪽 · 기능 그리드 + 액션 ─────────────────────────────────── */}
        <section className="relative px-7 py-8 md:py-9 md:pl-9">
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("welcome.close")}
            className="absolute top-4 right-4 w-9 h-9 rounded-full text-[#A8A398] flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-[#F4F2EC] hover:text-[#16243C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16243C]/35"
          >
            <IconClose />
          </button>

          <h2 className="text-[11px] font-bold tracking-[0.07em] text-[#2563EB] uppercase">
            {t("welcome.featuresLabel")}
          </h2>

          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {features.map((f) => (
              <li
                key={f.title}
                className="rounded-2xl border border-[#F0EDE6] bg-[#FBFAF7] px-4 py-3.5 transition-colors duration-200 hover:border-[#E3DED4] hover:bg-white"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
                  <Image src={f.icon} alt="" width={24} height={24} className="object-contain" />
                </span>
                <p className="mt-2.5 text-[13.5px] font-extrabold text-[#16243C] leading-snug">{f.title}</p>
                <p className="mt-1 text-[11.5px] text-[#8B8678] leading-relaxed">{f.desc}</p>
              </li>
            ))}
          </ul>

          {/* 액션 — 다이얼로그의 유일한 solid. 웹 관례대로 오른쪽 아래 정렬 */}
          <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="hidden sm:block text-[11.5px] text-[#B5B0A6]">{t("welcome.escHint")}</p>
            <button
              type="button"
              onClick={dismiss}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-[#FE9C00] text-white text-[14px] font-bold cursor-pointer shadow-[0_8px_22px_rgba(254,156,0,0.32)] transition-colors duration-200 hover:bg-[#E58900] active:bg-[#D97706] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE9C00]/50 focus-visible:ring-offset-2"
            >
              {t("welcome.start")}
              <IconArrowRight />
            </button>
          </div>
        </section>
      </div>

      <style jsx global>{`
        @keyframes wmFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes wmPop { from { opacity: 0; transform: translateY(12px) scale(0.985); } to { opacity: 1; transform: none; } }
        .wm-backdrop { animation: wmFade 0.22s ease both; }
        .wm-dialog { animation: wmPop 0.32s cubic-bezier(0.3, 0.7, 0.3, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .wm-backdrop, .wm-dialog { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

/** 브랜드 패널 배경의 동선 모티프 — 지도 앱이라는 걸 글자 없이 보여주는 장식(장식이라 aria-hidden). */
function RouteMotif() {
  return (
    <svg
      className="pointer-events-none absolute right-3 bottom-3 w-[188px] h-[188px] text-white"
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden
    >
      <path
        d="M24 168C24 132 62 138 78 116C94 94 62 66 84 44C100 28 132 34 150 24"
        stroke="currentColor"
        strokeOpacity="0.16"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="24" cy="168" r="7" stroke="currentColor" strokeOpacity="0.28" strokeWidth="3" />
      <circle cx="78" cy="116" r="5" stroke="currentColor" strokeOpacity="0.22" strokeWidth="3" />
      <circle cx="84" cy="44" r="5" stroke="currentColor" strokeOpacity="0.22" strokeWidth="3" />
      <circle cx="150" cy="24" r="7" fill="#FE9C00" fillOpacity="0.55" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h13M12.5 5.5L19 12l-6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
