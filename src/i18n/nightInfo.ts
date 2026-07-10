/**
 * 야경명소(public/data/nightview.json) 상세 정보의 영문 오버레이.
 *
 * nightview.json은 한글 원문을 값으로 유지하고(=== 비교·API body·캐시 키 안정성),
 * en 로케일로 렌더할 때만 이 표로 상세 필드를 치환한다. (라벨/값 분리 규약)
 * 미등록 장소·필드는 한글 원문을 그대로 노출한다(placeNames와 동일한 fallback 정책).
 *
 * ⚠️ 규약: nightview.json에 항목을 추가할 때는 이름 로마자 표기
 * (placeNames.PLACE_NAME_EN)와 함께 이 표에 상세 정보 영문을 등록한다.
 */
import type { Locale } from "./enums";

interface NightInfoEn {
  place?: string;
  operating_time?: string;
  fee?: string;
  subway?: string;
  bus?: string;
}

export const NIGHT_INFO_EN: Record<string, NightInfoEn> = {
  "흥인지문공원": {
    place: "70 Jongno 6-ga, Jongno-gu, Seoul",
    operating_time: "Open all year",
    fee: "Free",
    subway:
      "Dongdaemun Stn. (Line 1) Exit 1, or Dongdaemun Stn. (Line 4) Exit 10, then a short walk",
    bus: "Get off at the Dongdaemun stop and walk",
  },
  "테크노마트 하늘공원": {
    place: "85 Gwangnaru-ro 56-gil, Gwangjin-gu, Seoul (Gangbyeon Technomart rooftop)",
    operating_time: "10:00 – 22:00 (rooftop garden hours; may vary with building operations)",
    fee: "Free",
    subway:
      "Gangbyeon Stn. (Line 2) Exit 1, via the connecting passage to Gangbyeon Technomart",
    bus: "Get off at the Gangbyeon Stn. / Gangbyeon Technomart stop and walk",
  },
};

/**
 * 야경명소 상세 필드를 로케일에 맞게 반환.
 * en이고 오버레이에 등록돼 있으면 영문, 아니면 한글 원문(koValue)을 그대로 반환한다.
 */
export function localizedNightField(
  name: string,
  field: keyof NightInfoEn,
  koValue: string | null | undefined,
  locale: Locale,
): string | null | undefined {
  if (locale !== "en") return koValue;
  return NIGHT_INFO_EN[name]?.[field] ?? koValue;
}
