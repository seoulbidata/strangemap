"use client";

import type { POIItem } from "@/app/api/poi/route";
import { useLocale } from "@/i18n/LocaleContext";
import { categoryLabel } from "@/i18n/enums";
import { localizedPlaceName } from "@/i18n/placeNames";
import { localizedNightField } from "@/i18n/nightInfo";

interface Props {
  poi: POIItem;
  onClose: () => void;
  onAskAI: () => void;
  onSetDest: () => void;
  isQuestTarget?: boolean;
}

export default function PlaceCard({ poi, onClose, onAskAI, onSetDest, isQuestTarget }: Props) {
  const { t, locale } = useLocale();
  const isNight = poi.source === "nightview";

  // 야경명소는 상세 정보(주소·운영시간·지하철·요금)를 영문 오버레이로 치환한다.
  // 미등록 장소·필드는 한글 원문이 그대로 유지된다(fallback).
  const place = isNight ? localizedNightField(poi.name, "place", poi.place, locale) : poi.place;
  const hours = isNight
    ? localizedNightField(poi.name, "operating_time", poi.operating_time, locale)
    : poi.operating_time;
  const subway = isNight ? localizedNightField(poi.name, "subway", poi.subway, locale) : poi.subway;
  const fee = isNight ? localizedNightField(poi.name, "fee", poi.fee, locale) : poi.fee;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[360px] max-w-[92vw] z-20 animate-fade-up max-md:bottom-[92px] max-md:w-[calc(100vw-40px)] max-md:max-w-[340px]">
      <div className={`bg-white rounded-2xl overflow-hidden shadow-xl border ${isQuestTarget ? "border-[#2563EB]" : "border-[#E5E1D8]"}`}>
        {/* 히어로 썸네일 — 4:3 비율로 크게, 분류/퀘스트 배지를 이미지 위로 오버레이 */}
        {poi.thumbnail && (
          <div className="relative aspect-[16/9] overflow-hidden bg-[#F5F2EC]">
            <img
              src={poi.thumbnail}
              alt={poi.name}
              className="w-full h-full object-cover"
            />
            {/* 야경은 사진이 어두워지지 않게 하단만 옅은 그라데이션 */}
            {isNight && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
            )}
            {/* 좌상단: 분류 칩 */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/85 backdrop-blur-sm"
                style={{ color: isNight ? "#92400E" : "#1D4ED8" }}
              >
                {isNight ? t("placeCard.night") : t("placeCard.culture")}
              </span>
              {poi.category && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/35 text-white backdrop-blur-sm">
                  {categoryLabel(poi.category, locale)}
                </span>
              )}
            </div>
            {/* 우상단: 퀘스트 배지 */}
            {isQuestTarget && (
              <span className="absolute top-3 right-3 text-[10px] font-display font-bold bg-[#2563EB] text-white px-1.5 py-0.5 rounded">
                {t("placeCard.quest")}
              </span>
            )}
          </div>
        )}

        <div className="p-3.5">
          {/* 상단: 제목 + 닫기 (썸네일 없으면 분류 배지를 본문에) */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {!poi.thumbnail && (
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: isNight ? "#FEF3C7" : "#EFF6FF",
                      color: isNight ? "#92400E" : "#1D4ED8",
                      border: `1px solid ${isNight ? "#FDE68A" : "#BFDBFE"}`,
                    }}
                  >
                    {isNight ? t("placeCard.night") : t("placeCard.culture")}
                  </span>
                  <span className="text-[10px] text-[#9CA3AF]">{categoryLabel(poi.category, locale)}</span>
                  {isQuestTarget && (
                    <span className="text-[10px] font-display font-bold bg-[#2563EB] text-white px-1.5 py-0.5 rounded">
                      {t("placeCard.quest")}
                    </span>
                  )}
                </div>
              )}
              <h3 className="text-base font-bold text-[#1A1E2E] leading-snug">{localizedPlaceName(poi.name, locale)}</h3>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-[#F5F2EC] hover:bg-[#E5E1D8] text-[#9CA3AF] hover:text-[#6B7280] flex items-center justify-center shrink-0 transition-colors text-sm"
            >
              ✕
            </button>
          </div>

          {/* 상세 정보 */}
          <div className="mt-2.5 space-y-1 text-[12px] text-[#6B7280]">
            <div className="flex gap-1.5">
              <span className="text-[#9CA3AF] w-12 shrink-0">{t("placeCard.loc")}</span>
              <span className="text-[#1A1E2E]">{place}</span>
            </div>
            {poi.date && (
              <div className="flex gap-1.5">
                <span className="text-[#9CA3AF] w-12 shrink-0">{t("placeCard.date")}</span>
                <span className="text-[#1A1E2E]">{poi.date}</span>
              </div>
            )}
            {hours && (
              <div className="flex gap-1.5">
                <span className="text-[#9CA3AF] w-12 shrink-0">{t("placeCard.hours")}</span>
                <span className="text-[#1A1E2E]">{hours}</span>
              </div>
            )}
            {subway && (
              <div className="flex gap-1.5">
                <span className="text-[#9CA3AF] w-12 shrink-0">{t("placeCard.subway")}</span>
                <span className="text-[#1A1E2E]">{subway}</span>
              </div>
            )}
            <div className="flex gap-1.5">
              <span className="text-[#9CA3AF] w-12 shrink-0">{t("placeCard.fee")}</span>
              <span className="text-[#1A1E2E]">{fee || t("common.noInfo")}</span>
            </div>
          </div>

          {/* 버튼 영역 */}
          <div className="mt-3.5 flex flex-col gap-2">
            <button
              onClick={onAskAI}
              className="w-full h-[36px] rounded-xl text-sm font-semibold bg-[#FE9C00] text-white hover:bg-[#E08800] transition-colors"
            >
              {t("placeCard.askAI")}
            </button>
            <button
              onClick={onSetDest}
              className="w-full h-[36px] rounded-xl text-sm font-medium bg-[#FFF1F2] border border-[#FECDD3] text-[#DC2626] hover:bg-[#FFE4E6] transition-colors"
            >
              {t("placeCard.setDest")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
