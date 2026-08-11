import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_META, isMealStop } from "@/data/themeCourses";
import { getCourseBySlug, getCourses, getRelatedCourses } from "@/lib/content/courses";
import { getSpots } from "@/lib/content/spots";
import { SITE_NAME, absoluteUrl, breadcrumbLd, clampDescription, jsonLd } from "@/lib/seo";

interface Props {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return getCourses().map((entry) => ({ id: entry.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const entry = getCourseBySlug(id);
  if (!entry) return {};

  const { course, hero, placeCount } = entry;
  const path = `/courses/${entry.slug}`;

  return {
    title: `${course.title} — ${course.subtitle}`,
    description: clampDescription(
      `${course.description} 총 ${placeCount}곳 · ${course.totalDuration} · ${course.distance}.`
    ),
    keywords: [...course.tags, course.title, "서울 여행 코스", "서울 코스 추천"],
    alternates: { canonical: path },
    openGraph: {
      title: `${course.title} | ${SITE_NAME}`,
      description: clampDescription(course.description),
      url: absoluteUrl(path),
      type: "article",
      images: [{ url: hero, alt: `${course.title} 코스` }],
    },
    twitter: { card: "summary_large_image", images: [hero] },
  };
}

export default async function CourseDetailPage({ params }: Props) {
  const { id } = await params;
  const entry = getCourseBySlug(id);
  if (!entry) notFound();

  const { course, hero, placeCount } = entry;
  const meta = CATEGORY_META[course.category];
  const related = getRelatedCourses(entry);
  const spots = getSpots();

  // 코스 스탑 ↔ 명소 상세 연결. 이름이 정확히 같을 때만 이어 오탐을 막는다.
  const spotFor = (name: string) => spots.find((s) => s.name === name);

  const placeStops = course.stops.filter((s) => !isMealStop(s));

  const structuredData = [
    breadcrumbLd([
      { name: "홈", path: "/" },
      { name: "서울 여행 코스", path: "/courses" },
      { name: course.title, path: `/courses/${entry.slug}` },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "TouristTrip",
      name: course.title,
      description: course.description,
      url: absoluteUrl(`/courses/${entry.slug}`),
      image: absoluteUrl(hero),
      touristType: course.tags,
      itinerary: {
        "@type": "ItemList",
        numberOfItems: placeStops.length,
        itemListElement: placeStops.map((stop, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "TouristAttraction",
            name: stop.name,
            description: stop.preview,
            geo: { "@type": "GeoCoordinates", latitude: stop.lat, longitude: stop.lng },
          },
        })),
      },
      provider: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
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
          <Link href="/courses" className="hover:text-[#B45309]">
            서울 여행 코스
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-[#78716C]">{course.title}</span>
        </nav>

        <span
          className="inline-block rounded-full border px-2.5 py-1 text-xs font-bold"
          style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
        >
          {meta.label}
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#1B3A6B] sm:text-4xl">
          {course.title}
        </h1>
        <p className="mt-2 text-lg text-[#78716C]">{course.subtitle}</p>

        <div className="relative mt-6 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-[#F5F2EC]">
          <Image
            src={hero}
            alt={`${course.title} — ${course.subtitle}`}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
            priority
          />
        </div>

        <p className="mt-6 text-[15px] leading-relaxed text-[#44403C]">{course.description}</p>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#FDECC8] bg-[#FDECC8] sm:grid-cols-3">
          {[
            ["방문 장소", `${placeCount}곳`],
            ["총 소요 시간", course.totalDuration],
            ["이동 거리", course.distance],
            ["난이도", course.difficulty],
            ["예상 비용", course.estimatedCost],
            ["추천 시간대", course.bestTime],
          ].map(([label, value]) => (
            <div key={label} className="bg-white px-4 py-3">
              <dt className="text-xs font-medium text-[#A8A29E]">{label}</dt>
              <dd className="mt-0.5 text-sm font-bold text-[#1A1E2E]">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 text-sm text-[#78716C]">
          출발 전{" "}
          <Link href="/" className="font-semibold text-[#B45309] underline underline-offset-2">
            실시간 혼잡도 지도
          </Link>
          에서 각 장소가 지금 얼마나 붐비는지 확인하면 대기 시간을 크게 줄일 수 있습니다.
        </p>

        {course.tags.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {course.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-[#F5F2EC] px-3 py-1 text-xs font-medium text-[#78716C]"
              >
                #{tag}
              </li>
            ))}
          </ul>
        )}

        <section className="mt-12">
          <h2 className="text-2xl font-extrabold text-[#1B3A6B]">코스 순서</h2>
          <ol className="mt-6 space-y-8">
            {course.stops.map((stop, i) => {
              const meal = isMealStop(stop);
              const linked = meal ? undefined : spotFor(stop.name);
              return (
                <li key={`${stop.name}-${i}`} className="relative border-l-2 border-[#FDECC8] pl-6">
                  <span
                    className="absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: meal ? "#D97706" : course.color }}
                    aria-hidden
                  >
                    {meal ? "식" : i + 1}
                  </span>

                  <h3 className="text-lg font-bold text-[#1A1E2E]">
                    {linked ? (
                      <Link href={`/spots/${linked.slug}`} className="hover:text-[#B45309]">
                        {stop.name}
                      </Link>
                    ) : (
                      stop.name
                    )}
                    {stop.duration && (
                      <span className="ml-2 align-middle text-xs font-medium text-[#A8A29E]">
                        {stop.duration}
                      </span>
                    )}
                  </h3>

                  {stop.preview && (
                    <p className="mt-1 text-sm font-medium text-[#78716C]">{stop.preview}</p>
                  )}
                  {stop.description && (
                    <p className="mt-2.5 text-[15px] leading-relaxed text-[#44403C]">
                      {stop.description}
                    </p>
                  )}
                  {stop.tip && (
                    <p className="mt-3 rounded-xl bg-[#FFFBEB] px-3.5 py-2.5 text-sm leading-relaxed text-[#92400E]">
                      <strong className="font-bold">TIP</strong> {stop.tip}
                    </p>
                  )}
                  {stop.adTag && (
                    <p className="mt-2 text-xs text-[#A8A29E]">
                      <span className="mr-1 rounded bg-[#F5F2EC] px-1.5 py-0.5 font-bold">
                        {stop.adTag.label}
                      </span>
                      {stop.adTag.disclosure}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {related.length > 0 && (
          <section className="mt-14 border-t border-[#FDECC8] pt-8">
            <h2 className="text-xl font-extrabold text-[#1B3A6B]">함께 보면 좋은 코스</h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/courses/${r.slug}`}
                    className="group block overflow-hidden rounded-xl border border-[#FDECC8] bg-white"
                  >
                    <div className="relative aspect-[16/10] bg-[#F5F2EC]">
                      <Image
                        src={r.hero}
                        alt={`${r.course.title} 코스`}
                        fill
                        sizes="(max-width: 640px) 100vw, 33vw"
                        className="object-cover"
                      />
                    </div>
                    <p className="px-3 py-2.5 text-sm font-bold text-[#1A1E2E] group-hover:text-[#B45309]">
                      {r.course.title}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </>
  );
}
