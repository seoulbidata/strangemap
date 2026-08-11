import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CATEGORY_META } from "@/data/themeCourses";
import { getCourses, getCoursesByCategory } from "@/lib/content/courses";
import { SITE_NAME, absoluteUrl, breadcrumbLd, clampDescription, jsonLd } from "@/lib/seo";

const TITLE = "서울 여행 코스 추천";

export const metadata: Metadata = {
  title: `${TITLE} — 테마별 큐레이션 코스 모음`,
  description: clampDescription(
    `고궁·야경·드라마 촬영지·로컬 맛집까지, 서울을 하루에 제대로 도는 테마 여행 코스 ${getCourses().length}개. 코스마다 동선·소요시간·예상 비용과 실시간 혼잡도를 지도에서 바로 확인하세요.`
  ),
  keywords: ["서울 여행 코스", "서울 당일치기", "서울 데이트 코스", "서울 도보 코스", "서울 코스 추천"],
  alternates: { canonical: "/courses" },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: "고궁·야경·드라마 촬영지까지, 서울을 하루에 제대로 도는 테마 여행 코스 모음.",
    url: absoluteUrl("/courses"),
    type: "website",
  },
};

export default function CoursesPage() {
  const all = getCourses();
  const grouped = getCoursesByCategory();

  const structuredData = [
    breadcrumbLd([
      { name: "홈", path: "/" },
      { name: "서울 여행 코스", path: "/courses" },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${TITLE} ${all.length}선`,
      numberOfItems: all.length,
      itemListElement: all.map((entry, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absoluteUrl(`/courses/${entry.slug}`),
        name: entry.course.title,
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
          <span className="text-[#78716C]">서울 여행 코스</span>
        </nav>

        <h1 className="text-3xl font-extrabold tracking-tight text-[#1B3A6B] sm:text-4xl">
          {TITLE} {all.length}선
        </h1>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-[#57534E]">
          어디부터 가야 할지 막막할 때 그대로 따라 걸을 수 있는 서울 테마 코스를 모았습니다.
          조선 왕궁을 잇는 역사 산책부터 한강 야경, 드라마·K팝 촬영지 순례, 성수·북촌 같은 동네
          탐방까지 — 코스마다 방문 순서와 머무는 시간, 이동 거리, 예상 비용을 함께 정리했습니다.
          출발 전에는 <Link href="/" className="font-semibold text-[#B45309] underline underline-offset-2">실시간 혼잡도 지도</Link>
          에서 지금 각 장소가 얼마나 붐비는지 확인하고 순서를 바꿔도 좋습니다.
        </p>

        {grouped.map(({ category, courses }) => {
          const meta = CATEGORY_META[category];
          return (
            <section key={category} className="mt-12">
              <h2 className="flex items-center gap-2 text-xl font-bold text-[#1A1E2E]">
                <span
                  className="rounded-full border px-2.5 py-1 text-xs font-bold"
                  style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
                >
                  {meta.label}
                </span>
                <span className="text-sm font-medium text-[#A8A29E]">{courses.length}개 코스</span>
              </h2>

              <ul className="mt-4 grid gap-5 sm:grid-cols-2">
                {courses.map(({ course, slug, hero, placeCount }) => (
                  <li key={slug}>
                    <Link
                      href={`/courses/${slug}`}
                      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[#FDECC8] bg-white shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#F5F2EC]">
                        <Image
                          src={hero}
                          alt={`${course.title} 코스 대표 이미지`}
                          fill
                          sizes="(max-width: 640px) 100vw, 50vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="text-base font-bold text-[#1A1E2E]">{course.title}</h3>
                        <p className="mt-1 text-sm text-[#78716C]">{course.subtitle}</p>
                        <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-[#57534E]">
                          {course.description}
                        </p>
                        <dl className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#A8A29E]">
                          <div className="flex gap-1">
                            <dt className="sr-only">방문 장소</dt>
                            <dd>{placeCount}곳</dd>
                          </div>
                          <div className="flex gap-1">
                            <dt className="sr-only">소요 시간</dt>
                            <dd>{course.totalDuration}</dd>
                          </div>
                          <div className="flex gap-1">
                            <dt className="sr-only">이동 거리</dt>
                            <dd>{course.distance}</dd>
                          </div>
                          <div className="flex gap-1">
                            <dt className="sr-only">난이도</dt>
                            <dd>난이도 {course.difficulty}</dd>
                          </div>
                        </dl>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
