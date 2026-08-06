import type { Metadata } from "next";
import { Orbitron } from "next/font/google";
import localFont from "next/font/local";
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
  title: "서울로",
  description:
    "실시간 혼잡도로 붐비는 곳은 피하고, 지금 가기 좋은 서울 명소와 AI가 추천하는 나에게 맞는 여행을 시작하세요.",
  keywords: [
    "서울 여행",
    "서울 지도",
    "실시간 혼잡도",
    "서울 명소",
    "서울 여행 코스",
    "AI 코스 추천",
    "서울 가볼만한곳",
  ],
  openGraph: {
    title: "서울로 | 실시간 혼잡도 서울 여행 지도",
    description:
      "실시간 혼잡도로 붐비는 곳은 피하고, 지금 가기 좋은 서울 명소와 나만의 여행 코스를 지도에서 찾아보세요.",
    type: "website",
    locale: "ko_KR",
    siteName: "서울로",
  },
  // 애드센스 사이트 소유 확인용. 로더 스크립트는 아래 <head>에 있다.
  other: {
    "google-adsense-account": "ca-pub-7327215771002130",
  },
  twitter: {
    card: "summary_large_image",
    title: "서울로 | 실시간 혼잡도 서울 여행 지도",
    description:
      "실시간 혼잡도로 지금 가기 좋은 서울 명소와 나만의 여행 코스를 지도에서 찾아보세요.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" style={{ height: "100%" }} className={`${seoulAlrim.variable} ${orbitron.variable} antialiased`}>
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7327215771002130"
          crossOrigin="anonymous"
        />
      </head>
      <body style={{ margin: 0, padding: 0, height: "100vh", overflow: "hidden" }} className="bg-[#F5F2EC] text-[#1A1E2E]">
        {children}
      </body>
    </html>
  );
}
