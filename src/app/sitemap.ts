import type { MetadataRoute } from "next";
import { getCourses } from "@/lib/content/courses";
import { getSpots } from "@/lib/content/spots";
import { absoluteUrl } from "@/lib/seo";

/**
 * /sitemap.xml — 홈 + 허브 2개 + 코스 상세 + 명소 상세 전부.
 *
 * lastModified 는 배포 시각으로 통일한다. 코스/명소 데이터에 갱신일 필드가 없어
 * 개별 날짜를 지어내면 오히려 신호가 흐려지기 때문. 데이터에 updatedAt 이 생기면 그걸 쓸 것.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/courses"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: absoluteUrl("/spots"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
  ];

  const courseRoutes: MetadataRoute.Sitemap = getCourses().map((entry) => ({
    url: absoluteUrl(`/courses/${entry.slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const spotRoutes: MetadataRoute.Sitemap = getSpots().map((spot) => ({
    url: absoluteUrl(`/spots/${spot.slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...courseRoutes, ...spotRoutes];
}
