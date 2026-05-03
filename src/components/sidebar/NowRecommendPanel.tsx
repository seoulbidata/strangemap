"use client";

import { useState, useEffect } from "react";
import type { POIItem } from "@/app/api/poi/route";

interface Props {
  onSelectPOI: (poi: POIItem) => void;
}

type TimePeriod = "아침" | "낮" | "저녁" | "밤";
type CongestionLevel = "여유" | "보통" | "혼잡";

interface RecommendedSpot {
  name: string;
  category: string;
  place: string;
  congestion: CongestionLevel;
  reason: string;
  bestFor: string;
  lat: number;
  lng: number;
}

const CONGESTION_STYLE: Record<CongestionLevel, { bg: string; text: string; border: string }> = {
  여유: { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
  보통: { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  혼잡: { bg: "#FFF1F2", text: "#DC2626", border: "#FECDD3" },
};

const MOCK_BY_PERIOD: Record<TimePeriod, RecommendedSpot[]> = {
  아침: [
    { name: "남산공원", category: "공원", place: "중구 남산동", congestion: "여유", reason: "이른 아침엔 등산객이 적어 조용히 산책할 수 있습니다", bestFor: "산책·조깅", lat: 37.5512, lng: 126.9882 },
    { name: "청계천", category: "수변공간", place: "종로구 서린동", congestion: "여유", reason: "출근 전 직장인 산책 코스로 인기. 아침 공기가 맑습니다", bestFor: "산책", lat: 37.5697, lng: 126.9786 },
    { name: "서울숲", category: "공원", place: "성동구 성수동", congestion: "여유", reason: "아침엔 사람이 거의 없어 여유롭게 자연을 즐길 수 있습니다", bestFor: "산책·사진", lat: 37.5444, lng: 127.0374 },
  ],
  낮: [
    { name: "국립중앙박물관", category: "박물관", place: "용산구 서빙고로", congestion: "보통", reason: "점심 시간대는 적당히 한산. 상설전시 무료 관람 가능합니다", bestFor: "문화·교육", lat: 37.5239, lng: 126.9800 },
    { name: "경복궁", category: "궁궐", place: "종로구 세종로", congestion: "보통", reason: "낮 관람이 가장 아름다운 궁궐. 한복 입으면 무료 입장", bestFor: "역사·사진", lat: 37.5796, lng: 126.9770 },
    { name: "인사동", category: "전통거리", place: "종로구 인사동", congestion: "보통", reason: "갤러리와 전통 공예점이 밀집. 점심 후 산책하기 좋습니다", bestFor: "쇼핑·문화", lat: 37.5744, lng: 126.9855 },
  ],
  저녁: [
    { name: "반포한강공원", category: "한강공원", place: "서초구 반포동", congestion: "보통", reason: "20~22시 달빛무지개분수 쇼. 저녁 노을도 함께 즐길 수 있습니다", bestFor: "야경·데이트", lat: 37.5102, lng: 126.9995 },
    { name: "광화문광장", category: "광장", place: "종로구 세종로", congestion: "여유", reason: "퇴근 후 저녁엔 조명이 켜져 낮과 전혀 다른 분위기", bestFor: "산책·사진", lat: 37.5720, lng: 126.9769 },
    { name: "명동", category: "쇼핑거리", place: "중구 명동", congestion: "혼잡", reason: "저녁 야시장이 활기차게 열립니다. 먹거리 다양", bestFor: "맛집·쇼핑", lat: 37.5635, lng: 126.9858 },
  ],
  밤: [
    { name: "남산서울타워", category: "전망대", place: "중구 남산동", congestion: "보통", reason: "밤 11시까지 운영. 서울 야경을 360도로 감상할 수 있습니다", bestFor: "야경·데이트", lat: 37.5512, lng: 126.9882 },
    { name: "성수동 카페거리", category: "카페거리", place: "성동구 성수동", congestion: "보통", reason: "밤늦게까지 영업하는 감성 카페들이 즐비합니다", bestFor: "카페·사진", lat: 37.5444, lng: 127.0564 },
    { name: "뚝섬한강공원", category: "한강공원", place: "광진구 자양동", congestion: "여유", reason: "야간엔 비교적 한산. 한강 불빛을 여유롭게 감상 가능", bestFor: "야경·힐링", lat: 37.5296, lng: 127.0686 },
  ],
};

function getTimePeriod(hour: number): TimePeriod {
  if (hour >= 6 && hour < 11) return "아침";
  if (hour >= 11 && hour < 17) return "낮";
  if (hour >= 17 && hour < 21) return "저녁";
  return "밤";
}

export default function NowRecommendPanel({ onSelectPOI }: Props) {
  const [now, setNow] = useState(new Date());
  const [period, setPeriod] = useState<TimePeriod>(getTimePeriod(new Date().getHours()));
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNow(d);
      setPeriod(getTimePeriod(d.getHours()));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setRefreshing(false);
  };

  const spots = MOCK_BY_PERIOD[period];
  const timeStr = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const PERIODS: TimePeriod[] = ["아침", "낮", "저녁", "밤"];

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-4 border-b border-[#E5E1D8]">
        <h2 className="text-base font-bold text-[#1A1E2E]">지금 추천</h2>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-[#9CA3AF]">현재 시간 · 혼잡도 기반 추천</p>
          <div className="flex items-center gap-1.5 text-xs text-[#1B3A6B] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] inline-block animate-pulse" />
            {timeStr}
          </div>
        </div>
      </div>

      {/* 시간대 탭 */}
      <div className="px-4 py-3 border-b border-[#E5E1D8]">
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                period === p
                  ? "bg-[#1B3A6B] text-white"
                  : "bg-[#F5F2EC] text-[#6B7280] hover:bg-[#E5E1D8]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* 데이터 출처 안내 */}
      <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-start gap-2">
        <span className="text-[#2563EB] text-[11px] shrink-0 mt-0.5">i</span>
        <p className="text-[10px] text-[#1D4ED8] leading-relaxed">
          실시간 혼잡도 데이터 연동 예정. 현재는 시간대별 통계 기반 추정값입니다.
        </p>
      </div>

      {/* 추천 목록 */}
      <div className="flex-1 overflow-y-auto thin-scroll py-3">
        {refreshing ? (
          <div className="px-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-[#E5E1D8] p-4 space-y-2 animate-pulse">
                <div className="h-3 bg-[#F0EDE8] rounded w-2/3" />
                <div className="h-2.5 bg-[#F0EDE8] rounded w-full" />
                <div className="h-2.5 bg-[#F0EDE8] rounded w-4/5" />
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 space-y-2.5">
            {spots.map((spot, i) => {
              const cStyle = CONGESTION_STYLE[spot.congestion];
              return (
                <button
                  key={i}
                  onClick={() =>
                    onSelectPOI({
                      id: `now_${i}`,
                      name: spot.name,
                      category: spot.category,
                      source: "nightview",
                      lat: spot.lat,
                      lng: spot.lng,
                      place: spot.place,
                      fee: "",
                    })
                  }
                  className="w-full text-left rounded-xl border border-[#E5E1D8] bg-white hover:border-[#1B3A6B] hover:shadow-sm transition-all p-4 animate-fade-up"
                  style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[#1A1E2E]">{spot.name}</p>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded border font-medium"
                          style={{ background: cStyle.bg, color: cStyle.text, borderColor: cStyle.border }}
                        >
                          {spot.congestion}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#9CA3AF] mt-0.5">{spot.category} · {spot.place}</p>
                    </div>
                    <span className="text-[10px] text-[#2563EB] font-medium shrink-0 bg-[#EFF6FF] px-2 py-1 rounded-lg">
                      {spot.bestFor}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6B7280] mt-2.5 leading-relaxed">{spot.reason}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 새로고침 */}
      <div className="px-4 py-3 border-t border-[#E5E1D8]">
        <button
          onClick={handleRefresh}
          className="w-full py-2 rounded-lg border border-[#E5E1D8] text-xs text-[#6B7280] hover:bg-[#F5F2EC] transition-colors"
        >
          {refreshing ? "업데이트 중..." : "새로고침"}
        </button>
      </div>
    </div>
  );
}
