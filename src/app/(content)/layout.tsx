import Link from "next/link";
import Image from "next/image";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/seo";
import FeedbackButton from "@/components/FeedbackButton";

/**
 * SEO 콘텐츠 페이지(/courses, /spots)의 공통 셸.
 *
 * 지도 앱(/)과 달리 세로로 스크롤되는 일반 문서 레이아웃이다. 헤더/푸터의 링크는
 * 모든 콘텐츠 페이지에 깔리는 내부 링크망이라, 크롤러가 허브 두 개를 어디서든 찾을 수 있다.
 */
export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#FFFBF0] text-[#1A1E2E]">
      <header className="sticky top-0 z-30 border-b border-[#FDECC8] bg-[#FFFBF0]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image
              src="/icons/logo.png"
              alt=""
              width={28}
              height={28}
              className="rounded-lg object-contain"
              unoptimized
            />
            <span className="text-lg font-extrabold tracking-tight text-[#1B3A6B]">
              {SITE_NAME}
            </span>
          </Link>
          <nav aria-label="주요 메뉴" className="flex items-center gap-1 text-sm font-semibold">
            <Link
              href="/courses"
              className="rounded-lg px-3 py-1.5 text-[#57534E] transition-colors hover:bg-[#FDECC8] hover:text-[#B45309]"
            >
              여행 코스
            </Link>
            <Link
              href="/spots"
              className="rounded-lg px-3 py-1.5 text-[#57534E] transition-colors hover:bg-[#FDECC8] hover:text-[#B45309]"
            >
              서울 명소
            </Link>
          </nav>
          <Link
            href="/"
            className="ml-auto shrink-0 rounded-xl bg-[#FE9C00] px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#E08800] sm:text-sm"
          >
            실시간 지도 열기
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-[#FDECC8] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <p className="text-sm font-bold text-[#1B3A6B]">
            {SITE_NAME} — {SITE_TAGLINE}
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#78716C]">
            서울시 실시간 도시데이터를 바탕으로 지금 붐비는 곳을 피해 다닐 수 있게 돕고,
            취향과 일정에 맞춘 서울 여행 코스를 AI가 만들어 드립니다.
          </p>
          <nav aria-label="푸터 메뉴" className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/" className="text-[#57534E] hover:text-[#B45309]">
              실시간 혼잡도 지도
            </Link>
            <Link href="/courses" className="text-[#57534E] hover:text-[#B45309]">
              서울 여행 코스
            </Link>
            <Link href="/spots" className="text-[#57534E] hover:text-[#B45309]">
              서울 명소
            </Link>
            {/* 방침은 찾을 수 있어야 의미가 있다 — 애드센스 심사도 도달 가능한 링크를 본다. */}
            <Link href="/privacy" className="text-[#57534E] hover:text-[#B45309]">
              개인정보처리방침
            </Link>
          </nav>
          <p className="mt-6 text-xs text-[#A8A29E]">
            출처: 서울열린데이터광장 실시간 도시데이터·서울시 관광정보. 운영시간·요금 등은
            방문 전 각 시설 공식 홈페이지에서 다시 확인해 주세요.
          </p>
        </div>
      </footer>

      {/* 콘텐츠 페이지에는 LocaleProvider 가 없다 — useLocale 이 기본값(ko)으로 동작한다.
          이 페이지들은 어차피 한국어 정적 콘텐츠라 문제되지 않는다. */}
      <FeedbackButton />
    </div>
  );
}
