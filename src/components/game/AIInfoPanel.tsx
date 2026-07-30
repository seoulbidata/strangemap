"use client";

import { useEffect, useRef, useState } from "react";
import type { AIPlaceInfo } from "@/types/quest";
import type { POIItem } from "@/app/api/poi/route";
import { useLocale } from "@/i18n/LocaleContext";
import type { UIKey } from "@/i18n/ui.ko";
import { localizedPlaceName } from "@/i18n/placeNames";

interface Props {
  poi: POIItem | null;
  onClose: () => void;
}

// ── 패널 공통 톤 — 관광코스/나만의 코스 패널과 같은 값을 쓴다 (warm paper + navy·blue) ──
//
// 예전 이 패널은 섹션마다 다른 파스텔(앰버·초록·하늘·파랑)을 깔아 앱의 다른 화면과 겉돌았다.
// 규칙을 하나로 줄인다: **색은 섹션 라벨만 갖고, 본문 텍스트는 항상 뉴트럴(#5C5950)**.
// 카드 배경은 세 가지뿐 — 흰 카드(기본) / 파랑 틴트(AI 인사이트) / 크림 틴트(시간·행사).
const CARD = "rounded-2xl border p-3.5";
const CARD_PLAIN = `${CARD} bg-white border-[#ECE8E0] shadow-[0_1px_3px_rgba(0,0,0,0.04)]`;
const CARD_BLUE = `${CARD} bg-[#F3F7FF] border-[#DCE7FF]`;
const CARD_CREAM = `${CARD} bg-[#FFFBF0] border-[#FDECC8]`;

const BODY = "text-[12.5px] text-[#5C5950] leading-relaxed";

/** 섹션 라벨 — 이 패널의 유일한 색 사용처. tone으로 섹션 성격만 구분한다. */
function SectionLabel({
  children,
  tone = "muted",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "muted" | "blue" | "amber";
  className?: string;
}) {
  const color =
    tone === "blue" ? "text-[#2563EB]" : tone === "amber" ? "text-[#B26A00]" : "text-[#B5B0A6]";
  return (
    <p className={`text-[10px] font-bold tracking-[0.14em] uppercase ${color} ${className}`}>
      {children}
    </p>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-[12px]">
      <span className="shrink-0 font-bold text-[#8B8678] w-14">{label}</span>
      <span className="text-[#5C5950] leading-relaxed break-words">{value}</span>
    </div>
  );
}

const LOADING_STEP_KEYS: UIKey[] = [
  "aiInfo.step1",
  "aiInfo.step2",
  "aiInfo.step3",
  "aiInfo.step4",
  "aiInfo.step5",
  "aiInfo.step6",
];

function AILoadingState({ placeName }: { placeName: string }) {
  const { t } = useLocale();
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
        setStepIdx((i) => (i + 1) % LOADING_STEP_KEYS.length);
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
          <span className="absolute inset-0 rounded-full bg-[#2563EB] opacity-15 animate-ping" />
          <span
            className="absolute inset-[-6px] rounded-full bg-[#DCE7FF] opacity-50 animate-ping"
            style={{ animationDelay: "0.4s" }}
          />
          <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-[#2563EB] to-[#16243C] flex items-center justify-center shadow-[0_6px_18px_rgba(22,36,60,0.22)]">
            <span className="font-display text-white text-[11px] font-bold tracking-widest">AI</span>
          </div>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-bold tracking-[0.14em] text-[#2563EB] uppercase">
            {t("aiInfo.brand")}
          </p>
          <p className="text-[12px] text-[#8B8678] mt-1">
            {t("aiInfo.researching", { place: placeName })}
          </p>
        </div>
      </div>

      {/* 현재 단계 표시 */}
      <div
        className="mx-auto max-w-[240px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-white border border-[#ECE8E0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-opacity duration-200"
        style={{ opacity: fade ? 1 : 0 }}
      >
        <span className="text-[11.5px] text-[#5C5950] font-semibold">
          {t(LOADING_STEP_KEYS[stepIdx])}{dots}
        </span>
      </div>

      {/* 진행 단계 인디케이터 */}
      <div className="flex justify-center gap-1.5">
        {LOADING_STEP_KEYS.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === stepIdx ? "20px" : "6px",
              height: "6px",
              background: i === stepIdx ? "#2563EB" : "#E3DED4",
            }}
          />
        ))}
      </div>

      {/* 시머 스켈레톤 */}
      <div className="space-y-2.5 px-1">
        {[92, 78, 85, 65, 80, 55].map((w, i) => (
          <div
            key={i}
            className="relative h-3 rounded-full overflow-hidden bg-[#EDE9E1]"
            style={{ width: `${w}%` }}
          >
            <div
              className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          </div>
        ))}
      </div>

      <p className="text-center text-[11px] text-[#B5B0A6]">
        {t("aiInfo.preparing")}
      </p>
    </div>
  );
}

export default function AIInfoPanel({ poi, onClose }: Props) {
  const { t, locale } = useLocale();
  const [info, setInfo] = useState<AIPlaceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [displayed, setDisplayed] = useState("");

  // Client-side session cache: 재클릭 시 즉시 표시 (locale별로 분리)
  const sessionCache = useRef<Map<string, AIPlaceInfo>>(new Map());

  useEffect(() => {
    if (!poi) return;

    // id만으로는 테마코스 간 충돌(코스마다 course_0…) — name까지 포함
    const cacheKey = `${locale}|${poi.id}|${poi.name}`;
    const cached = sessionCache.current.get(cacheKey);
    if (cached) {
      setInfo(cached);
      setDisplayed(cached.summary);
      setLoading(false);
      return;
    }

    setInfo(null);
    setDisplayed("");
    setLoading(true);

    const params = new URLSearchParams({ place: poi.name, lang: locale });
    if (poi.source === "culture") params.set("type", "culture");
    if (poi.operating_time) params.set("operating_time", poi.operating_time);
    // 테마코스 경유지는 fee에 체류시간, place에 감성 묘사가 들어있어 요금/주소로 오인 방지
    const isCourseStop = !!poi.courseCtx;
    if (poi.fee && !isCourseStop) params.set("fee", poi.fee);
    if (poi.subway) params.set("subway", poi.subway);
    if (poi.place && !isCourseStop) params.set("addr", poi.place);
    if (poi.lat) params.set("lat", String(poi.lat));
    if (poi.lng) params.set("lng", String(poi.lng));
    if (poi.viewpoint?.length) params.set("viewpoint", poi.viewpoint.join("||"));
    if (poi.bus) params.set("bus", poi.bus);
    if (poi.tel) params.set("tel", poi.tel);
    if (poi.parking) params.set("parking", poi.parking);
    if (poi.category) params.set("category", poi.category);
    if (poi.spotCategory) params.set("spot_category", poi.spotCategory);
    if (poi.bestTime) params.set("best_time", poi.bestTime);
    if (poi.date) params.set("date", poi.date);
    if (poi.endDate) params.set("end_date", poi.endDate);
    if (poi.courseCtx) {
      const c = poi.courseCtx;
      params.set("course_title", c.courseTitle);
      params.set("course_desc", c.stopDescription.slice(0, 300));
      if (c.stopTip) params.set("course_tip", c.stopTip);
      if (c.bestTime) params.set("course_best_time", c.bestTime);
      if (c.duration) params.set("course_duration", c.duration);
    }

    fetch(`/api/ai-info?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setInfo(d.info);
        sessionCache.current.set(cacheKey, d.info);
      })
      .finally(() => setLoading(false));
  }, [poi, locale]);

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
    <aside className="absolute top-0 bottom-0 right-0 w-[420px] max-w-[94vw] z-40 animate-fade-up max-md:fixed max-md:inset-0 max-md:w-screen max-md:max-w-none">
      <div className="h-full bg-[#FBFAF7] border-l border-[#ECE8E0] flex flex-col shadow-[-8px_0_28px_rgba(20,30,50,0.08)] max-md:border-l-0">
        {/* 헤더 */}
        <div className="px-5 pt-5 pb-4 bg-white border-b border-[#ECE8E0]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="relative flex w-2 h-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2563EB] opacity-60" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-[#2563EB]" />
                </span>
                <span className="text-[10px] font-bold tracking-[0.14em] text-[#2563EB] uppercase">
                  {t("aiInfo.header")}
                </span>
              </div>
              <h2 className="text-[20px] leading-[1.3] font-bold tracking-[-0.01em] text-[#16243C] mt-1.5">
                {localizedPlaceName(poi.name, locale)}
              </h2>
              <p className="text-[11.5px] text-[#8B8678] mt-1 truncate">{poi.place}</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full border border-[#ECE8E0] bg-white text-[#16243C] flex items-center justify-center shrink-0 cursor-pointer transition-colors duration-200 hover:border-[#16243C] hover:bg-[#FBFAF7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto thin-scroll px-5 py-5 space-y-5">

          {/* 정적 정보 */}
          <div className={`${CARD_PLAIN} space-y-2.5`}>
            <SectionLabel className="mb-1">{t("aiInfo.placeInfo")}</SectionLabel>
            {poi.operating_time && <InfoRow label={t("aiInfo.hours")} value={poi.operating_time} />}
            {poi.fee && <InfoRow label={t("aiInfo.fee")} value={poi.fee} />}
            {poi.subway && <InfoRow label={t("aiInfo.subway")} value={poi.subway} />}
            {poi.bus && <InfoRow label={t("aiInfo.bus")} value={poi.bus} />}
            {poi.tel && <InfoRow label={t("aiInfo.tel")} value={poi.tel} />}
            {poi.parking && <InfoRow label={t("aiInfo.parking")} value={poi.parking} />}
            {poi.link && (
              <div className="flex gap-3 text-[12px]">
                <span className="shrink-0 font-bold text-[#8B8678] w-14">{t("aiInfo.homepage")}</span>
                <a
                  href={poi.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#2563EB] font-semibold underline underline-offset-2 truncate"
                >
                  {t("aiInfo.officialSite")}
                </a>
              </div>
            )}
          </div>

          {/* 뷰포인트 */}
          {poi.viewpoint && poi.viewpoint.length > 0 && (
            <div className={CARD_BLUE}>
              <SectionLabel tone="blue" className="mb-2">{t("aiInfo.viewpoints")}</SectionLabel>
              <ul className="space-y-1.5">
                {poi.viewpoint.map((v, i) => (
                  <li key={i} className={`flex gap-2 ${BODY}`}>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI 로딩 */}
          {loading && <AILoadingState placeName={localizedPlaceName(poi.name, locale)} />}

          {info && (
            <>
              {/* 태그 / era / vibe */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {info.era && (
                  <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full bg-[#FFFBF0] border border-[#FDECC8] text-[#B26A00]">
                    {info.era}
                  </span>
                )}
                {(info.tags ?? []).map((t) => (
                  <span
                    key={t}
                    className="text-[10.5px] font-medium px-2.5 py-1 rounded-full bg-[#F4F2EC] text-[#8B8678]"
                  >
                    #{t}
                  </span>
                ))}
                {(info.vibe ?? []).map((v) => (
                  <span
                    key={v}
                    className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full bg-[#F3F7FF] border border-[#DCE7FF] text-[#2563EB]"
                  >
                    {v}
                  </span>
                ))}
              </div>

              {/* 지금 방문 추천 */}
              {info.right_now && (
                <div className={CARD_BLUE}>
                  <SectionLabel tone="blue" className="mb-1.5">{t("aiInfo.rightNow")}</SectionLabel>
                  <p className={BODY}>{info.right_now}</p>
                </div>
              )}

              {/* 요약 — 타이프라이터 */}
              <div>
                <SectionLabel className="mb-2">{t("aiInfo.intro")}</SectionLabel>
                <p className="text-[13.5px] text-[#16243C] leading-[1.7]">
                  {displayed}
                  {displayed.length < info.summary.length && (
                    <span className="inline-block w-1 h-3.5 bg-[#2563EB] ml-0.5 animate-pulse align-middle" />
                  )}
                </p>
              </div>

              {/* 주요 볼거리 */}
              <div>
                <SectionLabel className="mb-2">{t("aiInfo.actions")}</SectionLabel>
                <ul className="space-y-2">
                  {(info.highlights ?? []).map((h, i) => (
                    <li
                      key={i}
                      className={`${BODY} flex gap-2.5 animate-fade-up`}
                      style={{ animationDelay: `${400 + i * 100}ms`, animationFillMode: "both" }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0 mt-[7px]" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 감상 포인트 가이드 */}
              {info.viewpoint_guide && (
                <div className={CARD_BLUE}>
                  <SectionLabel tone="blue" className="mb-1.5">{t("aiInfo.viewpointGuide")}</SectionLabel>
                  <p className={BODY}>{info.viewpoint_guide}</p>
                </div>
              )}

              {/* 방문 전략: 최적 시간 + 혼잡 팁 */}
              {(info.best_time || info.crowd_tip) && (
                <div className={`${CARD_CREAM} space-y-2.5`}>
                  <SectionLabel tone="amber">{t("aiInfo.visitTip")}</SectionLabel>
                  {info.best_time && (
                    <div className={`flex gap-2 ${BODY}`}>
                      <span>{info.best_time}</span>
                    </div>
                  )}
                  {info.crowd_tip && (
                    <div className={`flex gap-2 ${BODY}`}>
                      <span>{info.crowd_tip}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 탐험 팁 */}
              <div className={CARD_BLUE}>
                <SectionLabel tone="blue" className="mb-1.5">{t("aiInfo.localTip")}</SectionLabel>
                <p className={BODY}>{info.tip}</p>
              </div>

              {/* 인근 추천 장소 */}
              {info.nearby && info.nearby.length > 0 && (
                <div>
                  <SectionLabel className="mb-2">{t("aiInfo.nearby")}</SectionLabel>
                  <div className="flex gap-2 flex-wrap">
                    {info.nearby.map((n, i) => (
                      <span
                        key={i}
                        className="text-[12px] font-semibold px-3 py-1.5 rounded-full bg-white border border-[#ECE8E0] text-[#5C5950] shadow-[0_1px_3px_rgba(0,0,0,0.04)] animate-fade-up"
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
                <div className={CARD_CREAM}>
                  <SectionLabel tone="amber" className="mb-1.5">{t("aiInfo.eventPick")}</SectionLabel>
                  <p className={BODY}>{info.event_pick}</p>
                </div>
              )}

              {/* 관련 문화 행사 */}
              {info.events && info.events.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <SectionLabel>{t("aiInfo.nearbyEvents")}</SectionLabel>
                    <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-[#F4F2EC] text-[#8B8678]">
                      {t("aiInfo.publicData")}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {info.events.map((ev, i) => (
                      <div
                        key={i}
                        className="rounded-2xl bg-white border border-[#ECE8E0] p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] animate-fade-up"
                        style={{ animationDelay: `${600 + i * 100}ms`, animationFillMode: "both" }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-[12.5px] font-bold text-[#16243C] leading-snug flex-1">
                            {ev.title}
                          </p>
                          <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FFFBF0] border border-[#FDECC8] text-[#B26A00] whitespace-nowrap">
                              {ev.period}
                            </span>
                            {ev.time && (
                              <span className="text-[9.5px] font-semibold px-2 py-0.5 rounded-full bg-[#F3F7FF] border border-[#DCE7FF] text-[#2563EB] whitespace-nowrap tabular-nums">
                                {ev.time}
                              </span>
                            )}
                          </div>
                        </div>
                        {ev.desc && (
                          <p className="text-[11.5px] text-[#8B8678] leading-relaxed">{ev.desc}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {ev.fee && (
                            <span className="text-[10.5px] text-[#A8A398]">{ev.fee}</span>
                          )}
                          {ev.link && (
                            <a
                              href={ev.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10.5px] font-semibold text-[#2563EB] underline underline-offset-2"
                            >
                              {t("aiInfo.details")}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-[#C4BDB4] text-center pt-1">
                {t("aiInfo.disclaimer")}
              </p>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
