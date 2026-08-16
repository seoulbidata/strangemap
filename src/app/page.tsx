"use client";

import dynamic from "next/dynamic";
import WelcomeModal from "@/components/WelcomeModal";
import FeedbackButton from "@/components/FeedbackButton";
import { LocaleProvider } from "@/i18n/LocaleContext";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#F5F2EC]">
      <div className="text-[#1B3A6B] font-display tracking-[0.2em] text-sm animate-pulse">
        Loading…
      </div>
    </div>
  ),
});

export default function Home() {
  return (
    // .app-shell — globals.css 가 이 클래스를 보고 body 스크롤을 잠근다(지도 화면 전용)
    <main
      style={{ width: "100%", height: "100vh", overflow: "hidden" }}
      className="app-shell bg-[#F5F2EC]"
    >
      <LocaleProvider>
        <WelcomeModal />
        <MapView />
        <FeedbackButton />
      </LocaleProvider>
    </main>
  );
}
