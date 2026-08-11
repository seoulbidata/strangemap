import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BEST_TIME_LABEL, getSpots, getSpotsByCategory } from "@/lib/content/spots";
import { SITE_NAME, absoluteUrl, breadcrumbLd, clampDescription, jsonLd } from "@/lib/seo";

const TITLE = "서울 명소";

export const metadata: Metadata = {
  title: `${TITLE} — 가볼만한 곳 ${getSpots().length}곳 총정리`,
  description: clampDescription(
    `고궁·전망대·한강·공원·미술관까지 서울에서 가볼만한 곳 ${getSpots().length}곳의 위치, 운영시간, 입장료, 대중교통을 한곳에 정리했습니다. 지금 붐비는 정도는 실시간 지도에서 확인하세요.`
  ),
  keywords: ["서울 가볼만한곳", "서울 명소", "서울 관광지", "서울 데이트 장소", "서울 야경 명소"],
  alternates: { canonical: "/spots" },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: "고궁·전망대·한강·공원·미술관까지, 서울에서 가볼만한 곳의 운영시간과 교통편 총정리.",
    url: absoluteUrl("/spots"),
    type: "website",
  },
};

export default function SpotsPage() {
  const all = getSpots();
  const grouped = getSpotsByCategory();

  const structuredData = [
    breadcrumbLd([
      { name: "홈", path: "/" },
      { name: "서울 명소", path: "/spots" },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${TITLE} ${all.length}곳`,
      numberOfItems: all.length,
      itemListElement: all.map((spot, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absoluteUrl(`/spots/${spot.slug}`),
        name: spot.name,
      })),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <nav aria-label="현재 위치" className="mb-4 text-xs text-[#A8A29E]">
          <Link href="/" className="hover:text-[#B45309]">
            홈
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-[#78716C]">서울 명소</span>
        </nav>

        <h1 className="text-3xl font-extrabold tracking-tight text-[#1B3A6B] sm:text-4xl">
          {TITLE} — 가볼만한 곳 {all.length}곳
        </h1>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-[#57534E]">
          조선의 궁궐부터 남산·북악의 전망대, 한강 다리와 공원, 도심 골목과 미술관까지.
          서울에서 한 번쯤 가볼 만한 곳들을 대분류로 묶고 주소·운영시간·입장료·대중교통 정보를
          정리했습니다. 각 명소 페이지에서 그곳을 지나는{" "}
          <Link href="/courses" className="font-semibold text-[#B45309] underline underline-offset-2">
            테마 여행 코스
          </Link>
          와 주변 명소도 함께 볼 수 있습니다.
        </p>

        <nav aria-label="분류 바로가기" className="mt-6 flex flex-wrap gap-2">
          {grouped.map(({ category, spots }) => (
            <a
              key={category}
              href={`#${encodeURIComponent(category)}`}
              className="rounded-full border border-[#FDECC8] bg-white px-3 py-1.5 text-xs font-semibold text-[#78716C] transition-colors hover:border-[#FE9C00] hover:text-[#B45309]"
            >
              {category} {spots.length}
            </a>
          ))}
        </nav>

        {grouped.map(({ category, spots }) => (
          <section key={category} id={encodeURIComponent(category)} className="mt-12 scroll-mt-20">
            <h2 className="text-xl font-bold text-[#1A1E2E]">
              {category}
              <span className="ml-2 text-sm font-medium text-[#A8A29E]">{spots.length}곳</span>
            </h2>

            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {spots.map((spot) => (
                <li key={spot.id}>
                  <Link
                    href={`/spots/${spot.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[#FDECC8] bg-white shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="relative aspect-[3/2] w-full overflow-hidden bg-[#F5F2EC]">
                      <Image
                        src={spot.image}
                        alt={`${spot.name} 전경`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-3.5">
                      <h3 className="text-[15px] font-bold text-[#1A1E2E]">{spot.name}</h3>
                      <p className="mt-1 line-clamp-1 text-xs text-[#A8A29E]">{spot.place}</p>
                      <p className="mt-2 text-xs text-[#78716C]">
                        추천 시간대 {BEST_TIME_LABEL[spot.bestTime]} · {spot.category}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
