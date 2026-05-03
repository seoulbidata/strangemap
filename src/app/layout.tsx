import type { Metadata } from "next";
import { Geist, Orbitron } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "StrangeMap — Seoul Explorer",
  description: "서울의 숨은 이야기를 지도 위에서 해금하는 탐험 RPG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" style={{ height: "100%" }} className={`${geistSans.variable} ${orbitron.variable} antialiased`}>
      <body style={{ margin: 0, padding: 0, height: "100vh", overflow: "hidden" }} className="bg-[#F5F2EC] text-[#1A1E2E]">
        {children}
      </body>
    </html>
  );
}
