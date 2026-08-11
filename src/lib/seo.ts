/**
 * SEO 공통 상수·헬퍼.
 *
 * 사이트 절대 URL은 metadataBase / canonical / sitemap / JSON-LD 가 모두 공유한다.
 * 커스텀 도메인을 붙였다면 Vercel 프로젝트 환경변수에 NEXT_PUBLIC_SITE_URL 을 넣는다.
 * (없으면 Vercel 이 주입하는 프로덕션 도메인 → 프리뷰 도메인 → localhost 순으로 폴백)
 */

const FALLBACK_URL = "http://localhost:3000";

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  // Vercel 자동 주입 — 프로덕션 도메인이 우선, 프리뷰 빌드는 그 배포 URL을 쓴다.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return FALLBACK_URL;
}

export const SITE_URL = resolveSiteUrl();
export const SITE_NAME = "서울로";
export const SITE_TAGLINE = "실시간 혼잡도 서울 여행 지도";

/** 프리뷰/로컬 빌드는 색인시키지 않는다 — 중복 콘텐츠로 잡히는 걸 막는 스위치. */
export const IS_INDEXABLE =
  process.env.VERCEL_ENV === "production" || process.env.NEXT_PUBLIC_FORCE_INDEX === "1";

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/** 메타 description 은 검색결과에서 잘리므로 155자 근처로 자른다. */
export function clampDescription(text: string, max = 155): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/**
 * URL 슬러그화 — 로마자 표기를 하이픈 소문자로.
 * 한글이 남아 있으면 percent-encoding 되므로 호출부에서 로마자를 먼저 넘긴다.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’·.]/g, "")
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** JSON-LD 를 <script type="application/ld+json"> 로 심을 때 쓰는 직렬화. */
export function jsonLd(data: Record<string, unknown> | Record<string, unknown>[]): string {
  // </script> 조기 종료와 XSS 벡터 차단
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbLd(crumbs: Crumb[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}
