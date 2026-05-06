"use client";

import { useEffect, useState } from "react";
import type { AIPlaceInfo } from "@/types/quest";
import type { POIItem } from "@/app/api/poi/route";

interface Props {
  poi: POIItem | null;
  onClose: () => void;
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex gap-2.5 text-[12px]">
      <span className="shrink-0 text-[14px] mt-0.5">{icon}</span>
      <div className="min-w-0">
        <span className="text-[10px] text-[#9CA3AF] mr-1">{label}</span>
        <span className="text-[#374151] leading-relaxed break-words">{value}</span>
      </div>
    </div>
  );
}

export default function AIInfoPanel({ poi, onClose }: Props) {
  const [info, setInfo] = useState<AIPlaceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!poi) return;
    setInfo(null);
    setDisplayed("");
    setLoading(true);

    const params = new URLSearchParams({ place: poi.name });
    if (poi.operating_time) params.set("operating_time", poi.operating_time);
    if (poi.fee) params.set("fee", poi.fee);
    if (poi.subway) params.set("subway", poi.subway);

    fetch(`/api/ai-info?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setInfo(d.info))
      .finally(() => setLoading(false));
  }, [poi]);

  useEffect(() => {
    if (!info) return;
    let i = 0;
    const full = info.summary;
    const id = setInterval(() => {
      i++;
      setDisplayed(full.slice(0, i));
      if (i >= full.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [info]);

  if (!poi) return null;

  return (
    <aside className="absolute top-0 bottom-0 right-0 w-[420px] max-w-[94vw] z-40 animate-fade-up">
      <div className="h-full bg-white border-l border-[#E5E1D8] flex flex-col shadow-xl">
        {/* 헤더 */}
        <div className="px-5 pt-5 pb-4 border-b border-[#E5E1D8]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex w-2 h-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2563EB] opacity-60" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-[#2563EB]" />
                </span>
                <span className="text-[10px] font-display tracking-[0.2em] text-[#9CA3AF] uppercase">AI 장소 안내</span>
              </div>
              <h2 className="text-lg font-bold text-[#1A1E2E] mt-1.5">{poi.name}</h2>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5 truncate">{poi.place}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-[#F5F2EC] hover:bg-[#E5E1D8] text-[#6B7280] flex items-center justify-center transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto thin-scroll px-5 py-4 space-y-5">

          {/* 정적 정보 */}
          <div className="rounded-xl bg-[#F9F8F5] border border-[#E5E1D8] p-3.5 space-y-2.5">
            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">장소 정보</p>
            {poi.operating_time && (
              <InfoRow icon="🕐" label="운영시간" value={poi.operating_time} />
            )}
            {poi.fee && (
              <InfoRow icon="💰" label="요금" value={poi.fee} />
            )}
            {poi.subway && (
              <InfoRow icon="🚇" label="지하철" value={poi.subway} />
            )}
            {poi.bus && (
              <InfoRow icon="🚌" label="버스" value={poi.bus} />
            )}
            {poi.tel && (
              <InfoRow icon="📞" label="전화" value={poi.tel} />
            )}
            {poi.parking && (
              <InfoRow icon="🅿️" label="주차" value={poi.parking} />
            )}
            {poi.link && (
              <div className="flex gap-2.5 text-[12px]">
                <span className="shrink-0 text-[14px] mt-0.5">🔗</span>
                <a
                  href={poi.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#2563EB] underline truncate"
                >
                  공식 홈페이지
                </a>
              </div>
            )}
          </div>

          {/* AI 섹션 */}
          {loading && (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
                <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse" />
                <span>장소 정보 분석 중...</span>
              </div>
              <div className="space-y-2">
                {[100, 85, 92, 70].map((w, i) => (
                  <div
                    key={i}
                    className="h-3 bg-[#F5F2EC] rounded animate-pulse"
                    style={{ width: `${w}%`, animationDelay: `${i * 100}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {info && (
            <>
              {/* 태그 */}
              <div className="flex items-center gap-2 flex-wrap">
                {info.era && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E]">
                    {info.era}
                  </span>
                )}
                {info.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[#F5F2EC] border border-[#E5E1D8] text-[#6B7280]"
                  >
                    #{t}
                  </span>
                ))}
              </div>

              {/* 요약 — 타이프라이터 */}
              <div>
                <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">개요</p>
                <p className="text-[13px] text-[#1A1E2E] leading-relaxed">
                  {displayed}
                  {displayed.length < info.summary.length && (
                    <span className="inline-block w-1 h-3.5 bg-[#2563EB] ml-0.5 animate-pulse align-middle" />
                  )}
                </p>
              </div>

              {/* 하이라이트 */}
              <div>
                <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">주요 볼거리</p>
                <ul className="space-y-2">
                  {info.highlights.map((h, i) => (
                    <li
                      key={i}
                      className="text-[12px] text-[#374151] flex gap-2.5 leading-relaxed animate-fade-up"
                      style={{ animationDelay: `${400 + i * 100}ms`, animationFillMode: "both" }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0 mt-1.5" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 탐험 팁 */}
              <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3.5">
                <p className="text-[10px] font-semibold text-[#92400E] uppercase tracking-wider mb-1.5">탐험 팁</p>
                <p className="text-[12px] text-[#78350F] leading-relaxed">{info.tip}</p>
              </div>

              <p className="text-[9px] text-[#D1CEC7] text-center pt-1">AI 생성 콘텐츠 · 참고용</p>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}