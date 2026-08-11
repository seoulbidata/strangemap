import type { MetadataRoute } from "next";
import { IS_INDEXABLE, SITE_URL, absoluteUrl } from "@/lib/seo";

/**
 * /robots.txt
 * 프리뷰·로컬 배포는 통째로 차단해 중복 색인을 막고, 프로덕션만 개방한다.
 * /api/* 는 JSON 응답이라 색인 가치가 없고 크롤 예산만 먹으므로 제외한다.
 */
export default function robots(): MetadataRoute.Robots {
  if (!IS_INDEXABLE) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dev/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
