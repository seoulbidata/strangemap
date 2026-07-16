/**
 * 서울명소(public/data/seoulSpots.json) 상세 정보의 영문 오버레이.
 *
 * seoulSpots.json은 한글 원문을 값으로 유지하고(=== 비교·API body·캐시 키 안정성),
 * en 로케일로 렌더할 때만 이 표로 상세 필드를 치환한다. (라벨/값 분리 규약)
 * 미등록 장소·필드는 한글 원문을 그대로 노출한다(placeNames와 동일한 fallback 정책).
 *
 * ⚠️ 규약: seoulSpots.json에 항목을 추가할 때는 이름 로마자 표기
 * (placeNames.PLACE_NAME_EN)와 함께 이 표에 상세 정보 영문을 등록한다.
 */
import type { Locale } from "./enums";

interface SpotInfoEn {
  place?: string;
  operating_time?: string;
  fee?: string;
  subway?: string;
  bus?: string;
}

export const SPOT_INFO_EN: Record<string, SpotInfoEn> = {
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
  "소월로": {
    place: "1-1179, Yongsan-dong 2(i)-ga, Yongsan-gu, Seoul",
    operating_time: "Open all year",
    fee: "Free",
    subway: "Noksapyeong Stn. (Line 6) Exit 2, then a short walk",
  },
  "국립중앙박물관": {
    place: "137 Seobinggo-ro, Yongsan-gu, Seoul",
    operating_time:
      "Mon, Tue, Thu, Fri, Sun: 09:30 – 17:30 / Wed, Sat: 09:30 – 21:00",
    fee: "Permanent exhibits free (special exhibits may charge admission)",
    subway: "Ichon Stn. (Line 4 / Gyeongui-Jungang Line) Exit 2, connecting passage",
    bus: "Get off at the National Museum of Korea stop and walk",
  },
  "서울숲": {
    place: "273 Ttukseom-ro, Seongdong-gu, Seoul",
    operating_time: "Open all year (indoor facilities operate separately)",
    fee: "Free",
    subway:
      "Seoul Forest Stn. (Suin-Bundang Line) Exit 3, 5-min walk, or Ttukseom Stn. (Line 2) Exit 8, 15-min walk",
    bus: "Get off at the Seoul Forest stop and walk",
  },
  "석촌호수(송파나루공원)": {
    place: "136 Samhaksa-ro, Songpa-gu, Seoul",
    operating_time: "Open all year",
    fee: "Free",
    subway:
      "Jamsil Stn. (Lines 2 & 8) Exit 2, 5-min walk (East Lake), or Exit 3, 5-min walk (West Lake)",
    bus: "Get off at the Seokchon Lake / Lotte World stop and walk",
  },
};

/**
 * 서울명소 상세 필드를 로케일에 맞게 반환.
 * en이고 오버레이에 등록돼 있으면 영문, 아니면 한글 원문(koValue)을 그대로 반환한다.
 */
export function localizedSpotField(
  name: string,
  field: keyof SpotInfoEn,
  koValue: string | null | undefined,
  locale: Locale,
): string | null | undefined {
  if (locale !== "en") return koValue;
  return SPOT_INFO_EN[name]?.[field] ?? koValue;
}
