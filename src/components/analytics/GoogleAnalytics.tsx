import Script from "next/script";

/**
 * Google Analytics 4 (gtag.js) 로더.
 *
 * 레이아웃에서 전역으로 깔린다 — 애드센스(AdSenseScript)와 달리 GA 는 광고가 아니라서
 * "콘텐츠 없는 화면" 정책 판정과 무관하고, 오히려 이탈·로딩 실패를 잡으려면 모든 화면에 있어야 한다.
 *
 * 두 가지를 여기서만 판단한다:
 *  1. **어디서 켤지** — 프로덕션 배포에서만. 안 그러면 `npm run dev` 돌릴 때마다 본인 접속이
 *     집계에 섞여 데이터가 오염된다. robots.ts / seo.ts 의 IS_INDEXABLE 과 같은 스위치를 쓴다.
 *  2. **언제 로드할지** — afterInteractive. lazyOnload(window load 이후)로 미루면 더 가볍지만,
 *     이 앱은 지도 SDK 때문에 초기 로딩이 길어서 그 사이 이탈한 사용자가 통째로 누락된다.
 *
 * 페이지뷰는 직접 쏘지 않는다. GA4 스트림의 향상된 측정 > "브라우저 방문 기록 기반 페이지 변경사항"
 * 이 켜져 있어 Next 의 클라이언트 라우팅(/ → /courses → /spots)이 자동으로 잡힌다.
 * 그 설정을 끄면 여기서 라우트 변경마다 page_view 를 직접 보내야 한다.
 */

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

// 프리뷰·로컬은 집계하지 않는다. 실제 배포에서 태그가 붙는지 확인해야 할 때만
// NEXT_PUBLIC_GA_DEBUG=1 로 잠깐 연다.
const ENABLED = process.env.VERCEL_ENV === "production" || process.env.NEXT_PUBLIC_GA_DEBUG === "1";

export default function GoogleAnalytics() {
  if (!GA_ID || !ENABLED) return null;

  return (
    <>
      <Script
        id="ga-loader"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
      {/* gtag 스텁을 인라인으로 먼저 정의해 둔다 — 로더가 도착하기 전에 발생한 이벤트도
          dataLayer 에 쌓였다가 나중에 한꺼번에 전송된다(초기 이벤트 유실 방지). */}
      <Script
        id="ga-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`,
        }}
      />
    </>
  );
}
