"use client";

import { useState, useMemo } from "react";
import type { POIItem } from "@/app/api/poi/route";
import { NIGHT_CATEGORIES } from "@/lib/nightCategories";
import { FeedShell, FeedHeader, FilterPills, FeedCard } from "./_feedKit";
import { useLocale } from "@/i18n/LocaleContext";
import { categoryLabel } from "@/i18n/enums";
import { localizedPlaceName } from "@/i18n/placeNames";

interface Props {
  pois: POIItem[];
  onSelectPOI: (poi: POIItem) => void;
}

const TYPE_FILTERS = ["전체", ...NIGHT_CATEGORIES] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

function PlaceholderImage({ name }: { name: string }) {
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#0F1F3D] to-[#1B3A6B] flex flex-col items-center justify-center gap-1">
      <span className="text-2xl">🌃</span>
      <span className="text-[10px] text-white/50 text-center px-2 leading-tight">{name}</span>
    </div>
  );
}

export default function NightviewPanel({ pois, onSelectPOI }: Props) {
  const { t, locale } = useLocale();
  const [activeType, setActiveType] = useState<TypeFilter>("전체");

  const nightPOIs = useMemo(() => {
    return pois
      .filter((p) => p.source === "nightview")
      .filter((p) => activeType === "전체" || p.nightCategory === activeType);
  }, [pois, activeType]);

  const totalCount = pois.filter((p) => p.source === "nightview").length;

  return (
    <FeedShell>
      <FeedHeader title={t("night.title")} subtitle={t("night.subtitle", { n: totalCount })} />

      {/* 풍경 유형 필터 */}
      <div className="px-5 pb-3 md:pt-0 pt-5">
        <FilterPills
          options={TYPE_FILTERS}
          value={activeType}
          onChange={setActiveType}
          renderLabel={(v) => categoryLabel(v, locale)}
        />
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pt-2 pb-4">
        {nightPOIs.length === 0 ? (
          <p className="text-[13px] text-[#A8A398] text-center mt-16 leading-relaxed">
            {t("night.empty")}
          </p>
        ) : (
          <>
            <p className="text-[11px] text-[#A8A398] pb-3">{t("night.count", { n: nightPOIs.length })}</p>
            <div className="space-y-5">
              {nightPOIs.map((poi) => (
                <NightviewCard key={poi.id} poi={poi} onSelect={() => onSelectPOI(poi)} />
              ))}
            </div>
          </>
        )}
      </div>
    </FeedShell>
  );
}

function NightviewCard({ poi, onSelect }: { poi: POIItem; onSelect: () => void }) {
  const { locale } = useLocale();
  const [imgError, setImgError] = useState(false);

  return (
    <FeedCard onClick={onSelect}>
      {/* 히어로 */}
      <div className="relative h-44 overflow-hidden bg-[#0F1F3D]">
        {poi.thumbnail && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poi.thumbnail}
            alt={poi.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <PlaceholderImage name={poi.name} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        <span className="absolute top-3.5 right-3.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-black/40 text-white/90 backdrop-blur-sm">
          {categoryLabel(poi.nightCategory ?? poi.category, locale)}
        </span>
      </div>

      {/* 본문 */}
      <div className="px-5 pt-4 pb-5">
        <h3 className="text-[18px] font-semibold leading-snug tracking-[-0.01em] line-clamp-2 text-[#16243C] group-hover:text-[#1E2F4D] transition-colors duration-150">
          {localizedPlaceName(poi.name, locale)}
        </h3>
        <p className="text-[13px] text-[#9A958A] mt-1.5 line-clamp-1">{poi.place}</p>
      </div>
    </FeedCard>
  );
}
