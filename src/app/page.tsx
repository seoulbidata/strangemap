"use client";

import dynamic from "next/dynamic";
import WelcomeModal from "@/components/WelcomeModal";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#F5F2EC]">
      <div className="text-[#1B3A6B] font-display tracking-[0.2em] text-sm animate-pulse">
        지도 불러오는 중...
      </div>
    </div>
  ),
});

export default function Home() {
  return (
    <main style={{ width: "100%", height: "100vh", overflow: "hidden" }} className="bg-[#F5F2EC]">
      <WelcomeModal />
      <MapView />
    </main>
  );
}
