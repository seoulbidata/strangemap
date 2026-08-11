import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCoursesContainingPlace } from "@/lib/content/courses";
import { BEST_TIME_LABEL, getNearbySpots, getSpotBySlug, getSpots } from "@/lib/content/spots";
import { SITE_NAME, absoluteUrl, breadcrumbLd, clampDescription, jsonLd } from "@/lib/seo";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getSpots().map((spot) => ({ slug: spot.slug }));
}

/** 명소 데이터엔 설명 문장이 없어, 있는 사실만으로 검색결과용 요약을 만든다(허위 서술 방지). */
function summarize(spot: NonNullable<ReturnType<typeof getSpotBySlug>>): string {
  const parts = [
    `${spot.name}(${spot.spotCategory})은(는) ${spot.place}에 있습니다.`,
    spot.operating_time && `운영시간 ${spot.operating_time}.`,
    spot.fee && `이용요금 ${spot.fee}.`,
    spot.subway && `${spot.subway}`,
  ].filter(Boolean);
  return clampDescription(parts.join(" "));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const spot = getSpotBySlug(slug);
  if (!spot) return {};

  const path = `/spots/${spot.slug}`;
  return {
    title: `${spot.name} — 위치·운영시간·입장료·가는 법`,
    description: summarize(spot),
    keywords: [spot.name, `${spot.name} 가는 법`, `${spot.name} 운영시간`, spot.spotCategory, "서울 가볼만한곳"],
    alternates: { canonical: path },
    openGraph: {
      title: `${spot.name} | ${SITE_NAME}`,
      description: summarize(spot),
      url: absoluteUrl(path),
      type: "article",
      images: [{ url: spot.image, alt: `${spot.name} 전경` }],
    },
    twitter: { card: "summary_large_image", images: [spot.image] },
  };
}

export default async function SpotDetailPage({ params }: Props) {
  const { slug } = await params;
  const spot = getSpotBySlug(slug);
  if (!spot) notFound();

  const nearby = getNearbySpots(spot);
  const courses = getCoursesContainingPlace(spot.name);

  const facts: [string, string | null][] = [
    ["주소", spot.place],
    ["운영시간", spot.operating_time],
    ["이용요금", spot.fee],
    ["추천 시간대", BEST_TIME_LABEL[spot.bestTime]],
    ["문의", spot.tel],
    ["주차", spot.parking],
  ];

  const structuredData = [
    breadcrumbLd([
      { name: "홈", path: "/" },
      { name: "서울 명소", path: "/spots" },
      { name: spot.name, path: `/spots/${spot.slug}` },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "TouristAttraction",
      name: spot.name,
      description: summarize(spot),
      url: absoluteUrl(`/spots/${spot.slug}`),
      image: absoluteUrl(spot.image),
      address: {
        "@type": "PostalAddress",
        streetAddress: spot.place,
        addressLocality: "서울",
        addressCountry: "KR",
      },
      geo: { "@type": "GeoCoordinates", latitude: spot.lat, longitude: spot.lng },
      ...(spot.tel ? { telephone: spot.tel } : {}),
      ...(spot.url ? { sameAs: [spot.url] } : {}),
      ...(spot.operating_time ? { openingHours: spot.operating_time } : {}),
      isAccessibleForFree: /무료|없음/.test(spot.fee ?? ""),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />

      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <nav aria-label="현재 위치" className="mb-4 text-xs text-[#A8A29E]">
          <Link href="/" className="hover:text-[#B45309]">
            홈
          </Link>
          <span className="mx-1.5">/</span>
          <Link href="/spots" className="hover:text-[#B45309]">
            서울 명소
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-[#78716C]">{spot.name}</span>
        </nav>

        <p className="text-xs font-bold text-[#B45309]">{spot.spotCategory}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1B3A6B] sm:text-4xl">
          {spot.name}
        </h1>
        <p className="mt-2 text-[15px] text-[#78716C]">{spot.place}</p>

        <div className="relative mt-6 aspect-[3/2] w-full overflow-hidden rounded-2xl bg-[#F5F2EC]">
          <Image
            src={spot.image}
            alt={`${spot.name} 전경`}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
            priority
          />
        </div>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-[#1B3A6B]">기본 정보</h2>
          <dl className="mt-4 divide-y divide-[#FDECC8] overflow-hidden rounded-2xl border border-[#FDECC8] bg-white">
            {facts
              .filter(([, value]) => Boolean(value))
              .map(([label, value]) => (
                <div key={label} className="flex gap-4 px-4 py-3">
                  <dt className="w-24 shrink-0 text-sm font-medium text-[#A8A29E]">{label}</dt>
                  <dd className="text-sm leading-relaxed text-[#1A1E2E]">{value}</dd>
                </div>
              ))}
            {spot.url && (
              <div className="flex gap-4 px-4 py-3">
                <dt className="w-24 shrink-0 text-sm font-medium text-[#A8A29E]">공식 홈페이지</dt>
                <dd className="min-w-0 text-sm">
                  <a
                    href={spot.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="break-all text-[#B45309] underline underline-offset-2"
                  >
                    {spot.url}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-extrabold text-[#1B3A6B]">가는 방법</h2>
          <dl className="mt-4 space-y-3">
            {spot.subway && (
              <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-[#FDECC8]">
                <dt className="text-xs font-bold text-[#2563EB]">지하철</dt>
                <dd className="mt-1 text-sm leading-relaxed text-[#44403C]">{spot.subway}</dd>
              </div>
            )}
            {spot.bus && (
              <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-[#FDECC8]">
                <dt className="text-xs font-bold text-[#16A34A]">버스</dt>
                <dd className="mt-1 text-sm leading-relaxed text-[#44403C]">{spot.bus}</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-sm text-[#78716C]">
            <Link href="/" className="font-semibold text-[#B45309] underline underline-offset-2">
              실시간 혼잡도 지도
            </Link>
            에서 {spot.name} 주변이 지금 얼마나 붐비는지, 어느 지하철·버스 노선이 여유로운지 확인할 수
            있습니다.
          </p>
        </section>

        {spot.viewpoint && spot.viewpoint.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-extrabold text-[#1B3A6B]">사진 찍기 좋은 지점</h2>
            <ul className="mt-4 space-y-2">
              {spot.viewpoint.map((v) => (
                <li
                  key={v}
                  className="rounded-xl bg-[#FFFBEB] px-4 py-3 text-sm leading-relaxed text-[#92400E]"
                >
                  {v}
                </li>
              ))}
            </ul>
          </section>
        )}

        {courses.length > 0 && (
          <section className="mt-12 border-t border-[#FDECC8] pt-8">
            <h2 className="text-xl font-extrabold text-[#1B3A6B]">
              {spot.name}이 포함된 여행 코스
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {courses.map(({ course, slug: courseSlug, hero }) => (
                <li key={courseSlug}>
                  <Link
                    href={`/courses/${courseSlug}`}
                    className="group flex gap-3 overflow-hidden rounded-xl border border-[#FDECC8] bg-white p-2.5"
                  >
                    <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-[#F5F2EC]">
                      <Image
                        src={hero}
                        alt={`${course.title} 코스`}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#1A1E2E] group-hover:text-[#B45309]">
                        {course.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-[#78716C]">
                        {course.subtitle}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-12 border-t border-[#FDECC8] pt-8">
          <h2 className="text-xl font-extrabold text-[#1B3A6B]">주변 명소</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {nearby.map(({ spot: near, km }) => (
              <li key={near.id}>
                <Link
                  href={`/spots/${near.slug}`}
                  className="group flex gap-3 overflow-hidden rounded-xl border border-[#FDECC8] bg-white p-2.5"
                >
                  <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-[#F5F2EC]">
                    <Image
                      src={near.image}
                      alt={`${near.name} 전경`}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#1A1E2E] group-hover:text-[#B45309]">
                      {near.name}
                    </p>
                    <p className="mt-0.5 text-xs text-[#A8A29E]">
                      직선거리 약 {km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </>
  );
}
