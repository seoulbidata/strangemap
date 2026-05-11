"use client";

import { useEffect, useRef, useState } from "react";
import type { AIPlaceInfo } from "@/types/quest";
import type { POIItem } from "@/app/api/poi/route";

interface Props {
  poi: POIItem | null;
  onClose: () => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-[12px]">
      <span className="shrink-0 font-bold text-[#374151] w-14">{label}</span>
      <span className="text-[#6B7280] leading-relaxed break-words">{value}</span>
    </div>
  );
}

const LOADING_STEPS = [
  "장소를 살펴보는 중",
  "방문자 데이터 분석 중",
  "역사·문화 자료 탐색 중",
  "볼거리·추천 코스 정리 중",
  "안내 문구 작성 중",
  "최적의 방문 정보 준비 중"
];

function AILoadingState({ placeName }: { placeName: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [dotCount, setDotCount] = useState(1);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const dotTimer = setInterval(() => {
      setDotCount((d) => (d % 3) + 1);
    }, 500);
    return () => clearInterval(dotTimer);
  }, []);

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setStepIdx((i) => (i + 1) % LOADING_STEPS.length);
        setFade(true);
      }, 200);
    }, 1800);
    return () => clearInterval(stepTimer);
  }, []);

  const dots = ".".repeat(dotCount);

  return (
    <div className="py-6 space-y-5">
      {/* 서울로 아바타 */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <span className="absolute inset-0 rounded-full bg-[#FE9C00] opacity-20 animate-ping" />
          <span className="absolute inset-[-6px] rounded-full bg-[#FDECC8] opacity-40 animate-ping" style={{ animationDelay: "0.4s" }} />
          <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-[#FE9C00] to-[#E08800] flex items-center justify-center shadow-lg shadow-amber-100">
            <span className="font-display text-white text-[11px] font-bold tracking-widest">AI</span>
          </div>
        </div>
        <div className="text-center">
          <p className="text-[11px] font-display tracking-[0.15em] text-[#FE9C00] uppercase font-semibold">
            서울로 AI
          </p>
          <p className="text-[12px] text-[#78716C] mt-0.5 font-medium">
            <span className="text-[#1A1E2E] font-bold">{placeName}</span>을(를) 조사 중
          </p>
        </div>
      </div>

      {/* 현재 단계 표시 */}
      <div
        className="mx-auto max-w-[240px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[#FFFBF0] border border-[#FDECC8] transition-opacity duration-200"
        style={{ opacity: fade ? 1 : 0 }}
      >
        <span className="text-[11px] text-[#92400E] font-medium">
          {LOADING_STEPS[stepIdx]}{dots}
        </span>
      </div>

      {/* 진행 단계 인디케이터 */}
      <div className="flex justify-center gap-1.5">
        {LOADING_STEPS.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === stepIdx ? "20px" : "6px",
              height: "6px",
              background: i === stepIdx ? "#FE9C00" : "#FDECC8",
            }}
          />
        ))}
      </div>

      {/* 시머 스켈레톤 */}
      <div className="space-y-2.5 px-1">
        {[92, 78, 85, 65, 80, 55].map((w, i) => (
          <div
            key={i}
            className="relative h-3 rounded-full overflow-hidden bg-[#FEF3C7]"
            style={{ width: `${w}%` }}
          >
            <div
              className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          </div>
        ))}
      </div>

      <p className="text-center text-[10px] text-[#A8A29E]">
        서울로가 최적의 방문 정보를 준비하고 있어요
      </p>
    </div>
  );
}

export default function AIInfoPanel({ poi, onClose }: Props) {
  const [info, setInfo] = useState<AIPlaceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [displayed, setDisplayed] = useState("");

  // Client-side session cache: 재클릭 시 즉시 표시
  const sessionCache = useRef<Map<string, AIPlaceInfo>>(new Map());

  useEffect(() => {
    if (!poi) return;

    const cached = sessionCache.current.get(poi.id);
    if (cached) {
      setInfo(cached);
      setDisplayed(cached.summary);
      setLoading(false);
      return;
    }

    setInfo(null);
    setDisplayed("");
    setLoading(true);

    const params = new URLSearchParams({ place: poi.name });
    if (poi.source === "culture") params.set("type", "culture");
    if (poi.operating_time) params.set("operating_time", poi.operating_time);
    if (poi.fee) params.set("fee", poi.fee);
    if (poi.subway) params.set("subway", poi.subway);
    if (poi.place) params.set("addr", poi.place);
    if (poi.lat) params.set("lat", String(poi.lat));
    if (poi.lng) params.set("lng", String(poi.lng));
    if (poi.viewpoint?.length) params.set("viewpoint", poi.viewpoint.join("||"));

    fetch(`/api/ai-info?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setInfo(d.info);
        sessionCache.current.set(poi.id, d.info);
      })
      .finally(() => setLoading(false));
  }, [poi]);

  // Typewriter effect for summary
  useEffect(() => {
    if (!info) return;
    const full = info.summary;
    if (displayed === full) return;
    let i = displayed.length;
    const id = setInterval(() => {
      i++;
      setDisplayed(full.slice(0, i));
      if (i >= full.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [info]); // eslint-disable-line react-hooks/exhaustive-deps

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
                <span className="text-[10px] font-display tracking-[0.2em] text-[#9CA3AF] uppercase">
                  AI 장소 안내
                </span>
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
            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">
              장소 정보
            </p>
            {poi.operating_time && <InfoRow label="운영시간" value={poi.operating_time} />}
            {poi.fee && <InfoRow label="요금" value={poi.fee} />}
            {poi.subway && <InfoRow label="지하철" value={poi.subway} />}
            {poi.bus && <InfoRow label="버스" value={poi.bus} />}
            {poi.tel && <InfoRow label="전화" value={poi.tel} />}
            {poi.parking && <InfoRow label="주차" value={poi.parking} />}
            {poi.link && (
              <div className="flex gap-3 text-[12px]">
                <span className="shrink-0 font-bold text-[#374151] w-14">홈페이지</span>
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

          {/* 뷰포인트 */}
          {poi.viewpoint && poi.viewpoint.length > 0 && (
            <div className="rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] p-3.5">
              <p className="text-[10px] font-semibold text-[#1D4ED8] uppercase tracking-wider mb-2">
                추천 뷰포인트
              </p>
              <ul className="space-y-1.5">
                {poi.viewpoint.map((v, i) => (
                  <li key={i} className="flex gap-2 text-[12px] text-[#1E40AF] leading-relaxed">
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI 로딩 */}
          {loading && <AILoadingState placeName={poi.name} />}

          {info && (
            <>
              {/* 태그 / era / vibe */}
              <div className="flex items-center gap-2 flex-wrap">
                {info.era && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E]">
                    {info.era}
                  </span>
                )}
                {(info.tags ?? []).map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[#F5F2EC] border border-[#E5E1D8] text-[#6B7280]"
                  >
                    #{t}
                  </span>
                ))}
                {(info.vibe ?? []).map((v) => (
                  <span
                    key={v}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8]"
                  >
                    {v}
                  </span>
                ))}
              </div>

              {/* 지금 방문 추천 */}
              {info.right_now && (
                <div className="rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] p-3.5">
                  <p className="text-[10px] font-semibold text-[#15803D] uppercase tracking-wider mb-1">
                    지금 방문하기
                  </p>
                  <p className="text-[12px] text-[#166534] leading-relaxed">{info.right_now}</p>
                </div>
              )}

              {/* 요약 — 타이프라이터 */}
              <div>
                <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">
                  서울로의 소개
                </p>
                <p className="text-[13px] text-[#1A1E2E] leading-relaxed">
                  {displayed}
                  {displayed.length < info.summary.length && (
                    <span className="inline-block w-1 h-3.5 bg-[#2563EB] ml-0.5 animate-pulse align-middle" />
                  )}
                </p>
              </div>

              {/* 주요 볼거리 */}
              <div>
                <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">
                  행동 추천
                </p>
                <ul className="space-y-2">
                  {(info.highlights ?? []).map((h, i) => (
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

              {/* 야경 감상 가이드 */}
              {info.viewpoint_guide && (
                <div className="rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] p-3.5">
                  <p className="text-[10px] font-semibold text-[#15803D] uppercase tracking-wider mb-1.5">
                    야경 감상 가이드
                  </p>
                  <p className="text-[12px] text-[#166534] leading-relaxed">
                    {info.viewpoint_guide}
                  </p>
                </div>
              )}

              {/* 방문 전략: 최적 시간 + 혼잡 팁 */}
              {(info.best_time || info.crowd_tip) && (
                <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3.5 space-y-2.5">
                  <p className="text-[10px] font-semibold text-[#92400E] uppercase tracking-wider">
                    방문 Tip
                  </p>
                  {info.best_time && (
                    <div className="flex gap-2 text-[12px] text-[#78350F]">
                      <span className="leading-relaxed">{info.best_time}</span>
                    </div>
                  )}
                  {info.crowd_tip && (
                    <div className="flex gap-2 text-[12px] text-[#78350F]">
                      <span className="leading-relaxed">{info.crowd_tip}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 탐험 팁 */}
              <div className="rounded-xl bg-[#F0F9FF] border border-[#BAE6FD] p-3.5">
                <p className="text-[10px] font-semibold text-[#0369A1] uppercase tracking-wider mb-1.5">
                  현지인이 알려주는 Tip
                </p>
                <p className="text-[12px] text-[#0C4A6E] leading-relaxed">{info.tip}</p>
              </div>

              {/* 인근 추천 장소 */}
              {info.nearby && info.nearby.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">
                    함께 가볼 만한 곳
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {info.nearby.map((n, i) => (
                      <span
                        key={i}
                        className="text-[12px] px-3 py-1.5 rounded-full bg-[#F5F2EC] border border-[#E5E1D8] text-[#374151] animate-fade-up"
                        style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
                      >
                         {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* AI 행사 추천 */}
              {info.event_pick && (
                <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3.5">
                  <p className="text-[10px] font-semibold text-[#92400E] uppercase tracking-wider mb-1.5">
                    서울로의 행사 추천
                  </p>
                  <p className="text-[12px] text-[#78350F] leading-relaxed">{info.event_pick}</p>
                </div>
              )}

              {/* 관련 문화 행사 */}
              {info.events && info.events.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
                      인근 문화 행사
                    </p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#15803D]">
                      서울시 공공데이터
                    </span>
                  </div>
                  <div className="space-y-2">
                    {info.events.map((ev, i) => (
                      <div
                        key={i}
                        className="rounded-lg bg-[#F9F8F5] border border-[#E5E1D8] p-3 animate-fade-up"
                        style={{ animationDelay: `${600 + i * 100}ms`, animationFillMode: "both" }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-[12px] font-semibold text-[#1A1E2E] leading-snug">
                            {ev.title}
                          </p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] shrink-0 whitespace-nowrap">
                            {ev.period}
                          </span>
                        </div>
                        {ev.desc && (
                          <p className="text-[11px] text-[#6B7280] leading-relaxed">{ev.desc}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {ev.fee && (
                            <span className="text-[10px] text-[#6B7280]">{ev.fee}</span>
                          )}
                          {ev.link && (
                            <a
                              href={ev.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-[#2563EB] underline"
                            >
                              상세보기
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[9px] text-[#D1CEC7] text-center pt-1">
                AI 생성 콘텐츠 · 참고용 · 문화행사는 서울시 공공데이터 기준
              </p>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
