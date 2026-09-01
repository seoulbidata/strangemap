import type { Metadata } from "next";
import { Orbitron } from "next/font/google";
import localFont from "next/font/local";
import { IS_INDEXABLE, SITE_NAME, SITE_TAGLINE, SITE_URL, absoluteUrl } from "@/lib/seo";
import GoogleAnalytics from "@/components/analytics/GoogleAnalytics";
import "./globals.css";

const seoulAlrim = localFont({
  variable: "--font-seoul-alrim",
  display: "swap",
  src: [
    { path: "../../public/fonts/SeoulAlrim-Medium.woff2", weight: "100 500", style: "normal" },
    { path: "../../public/fonts/SeoulAlrim-Bold.woff2", weight: "600 700", style: "normal" },
    { path: "../../public/fonts/SeoulAlrim-ExtraBold.woff2", weight: "800 900", style: "normal" },
  ],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  // 하위 페이지의 canonical·OG 이미지 상대경로가 전부 이 URL 기준으로 절대화된다.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | ${SITE_TAGLINE}`,
    // 하위 페이지는 title 만 주면 " | 서울로" 가 붙는다
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "실시간 혼잡도로 붐비는 곳은 피하고, 지금 가기 좋은 서울 명소와 AI가 추천하는 나에게 맞는 여행을 시작하세요.",
  applicationName: SITE_NAME,
  keywords: [
    "서울 여행",
    "서울 지도",
    "실시간 혼잡도",
    "서울 명소",
    "서울 여행 코스",
    "AI 코스 추천",
    "서울 가볼만한곳",
  ],
  alternates: { canonical: "/" },
  // 프리뷰/로컬 배포는 색인 차단 — robots.ts 와 같은 스위치를 쓴다.
  robots: IS_INDEXABLE
    ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } }
    : { index: false, follow: false },
  openGraph: {
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description:
      "실시간 혼잡도로 붐비는 곳은 피하고, 지금 가기 좋은 서울 명소와 나만의 여행 코스를 지도에서 찾아보세요.",
    type: "website",
    locale: "ko_KR",
    siteName: SITE_NAME,
    url: absoluteUrl("/"),
    images: [{ url: "/og/default.jpg", width: 1200, height: 630, alt: `${SITE_NAME} — ${SITE_TAGLINE}` }],
  },
  // 애드센스 사이트 소유 확인용. 광고 스크립트 자체는 여기 두지 않는다 —
  // 콘텐츠가 있는 피드에서만 AdSenseScript가 불러온다. (public/ads.txt와 이 메타가 소유권 확인 담당)
  other: {
    "google-adsense-account": "ca-pub-7327215771002130",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description:
      "실시간 혼잡도로 지금 가기 좋은 서울 명소와 나만의 여행 코스를 지도에서 찾아보세요.",
    images: ["/og/default.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" style={{ height: "100%" }} className={`${seoulAlrim.variable} ${orbitron.variable} antialiased`}>
      {/* 지도 화면만 100vh 고정·스크롤 잠금(globals.css 의 `body:has(> .app-shell)`).
          콘텐츠 페이지(/courses, /spots)는 세로 스크롤이 필요해 body 에 직접 걸지 않는다. */}
      <body style={{ margin: 0, padding: 0 }} className="bg-[#F5F2EC] text-[#1A1E2E]">
        {children}
        {/* 프로덕션에서만 렌더된다 — 판단은 컴포넌트 안에서 한다. */}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
