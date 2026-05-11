"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "seoulro_welcome_dismissed";
const CACHE_MINUTES = 60;

export default function WelcomeModal() {
  const [visible, setVisible] = useState(false);

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
            <span className="text-[#FE9C00] text-xl">🗺️</span>
            <h1 className="text-white font-bold text-lg tracking-wide">서울로 StrangeMap</h1>
          </div>
          <p className="text-blue-200 text-xs mt-1">서울 야경·문화·퀘스트 탐험 앱</p>
        </div>

        {/* 본문 */}
        <div className="px-6 py-5 space-y-4 text-sm text-[#1A1E2E]">
          <section>
            <h2 className="font-semibold text-[#1B3A6B] mb-1">📋 서비스 유의사항</h2>
            <ul className="space-y-1 text-[#44403C] leading-relaxed list-disc list-inside">
              <li>본 서비스는 서울시 빅데이터 경진대회 출품 목적의 시범 서비스입니다.</li>
              <li>제공되는 정보(혼잡도·버스·지하철 등)는 실시간 공공데이터 기반으로, 실제 현장과 차이가 있을 수 있습니다.</li>
              <li>AI 추천 정보는 참고용이며, 이동 전 현장 상황을 직접 확인하세요.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-[#1B3A6B] mb-1">⚡ API 사용 제한 안내</h2>
            <ul className="space-y-1 text-[#44403C] leading-relaxed list-disc list-inside">
              <li>AI 장소 정보 조회는 과도한 사용 시 일시적으로 제한될 수 있습니다.</li>
              <li>지하철·버스 실시간 정보는 서울 공공데이터 API를 사용하며, 일일 호출 한도가 있습니다.</li>
              <li>서비스 안정성을 위해 동일 요청의 반복 호출은 자제해 주세요.</li>
            </ul>
          </section>

          <p className="text-xs text-[#A8A29E] border-t pt-3">
            본 서비스를 이용함으로써 위 내용에 동의한 것으로 간주됩니다.
          </p>
        </div>

        {/* 버튼 */}
        <div className="px-6 pb-5">
          <button
            onClick={dismiss}
            className="w-full bg-[#1B3A6B] hover:bg-[#15306A] active:bg-[#0f2347] text-white font-semibold py-3 rounded-xl transition-colors"
          >
            확인하고 시작하기
          </button>
        </div>
      </div>
    </div>
  );
}