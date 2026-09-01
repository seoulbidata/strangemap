/**
 * Google Analytics 4 이벤트 전송 래퍼.
 *
 * 호출부가 gtag 존재 여부·환경 분기를 신경 쓰지 않게 한 겹 감싼다.
 * GA 스크립트가 안 깔린 환경(로컬 dev·프리뷰·광고차단기)에서는 window.gtag 자체가 없으므로
 * 여기서 조용히 no-op 이 된다 — 그래서 별도의 환경 플래그를 클라이언트로 내려보낼 필요가 없다.
 * 스크립트를 언제 깔지는 GoogleAnalytics.tsx 한 곳에서만 판단한다.
 *
 * ⚠️ 이벤트 이름은 GA4 집계 키다. 한 번 쌓이기 시작하면 이름을 바꿔도 과거 데이터가
 * 따라오지 않으니(별개 이벤트로 갈라진다) 아래 EVENTS 주석의 계약을 지켜서 쓴다.
 *
 * ⚠️ 개인정보(이메일·피드백 본문·검색어 원문 등)를 파라미터에 넣지 않는다 — GA 이용약관 위반이다.
 */

declare global {
  interface Window {
    gtag?: (command: "event" | "config" | "js", ...args: unknown[]) => void;
  }
}

/**
 * GA4 는 측정기준의 고유값이 많아지면 초과분을 `(other)` 로 뭉개고 되돌릴 수 없다.
 * 그래서 파라미터에는 **값이 몇 개로 고정된 것**만 넣는다. 연속값(소요시간 등)은
 * durationBucket() 으로 구간화해서 보낸다.
 */
type EventParams = Record<string, string | number>;

export function trackEvent(name: string, params?: EventParams): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", name, params ?? {});
  } catch {
    /* 계측 실패가 기능을 막으면 안 된다 */
  }
}

/** 소요시간(ms) → 측정기준으로 쓸 수 있는 구간 문자열. 경계는 AI 코스 생성 체감 시간 기준. */
export function durationBucket(ms: number): string {
  if (ms < 5_000) return "0-5s";
  if (ms < 10_000) return "5-10s";
  if (ms < 20_000) return "10-20s";
  if (ms < 30_000) return "20-30s";
  if (ms < 60_000) return "30-60s";
  return "60s+";
}

/**
 * 코스 생성 실패 사유 — **반드시 이 목록 안에서만** 보낸다.
 * 서버가 내려준 에러 메시지를 그대로 흘리면 고유값이 폭발해 보고서가 `(other)` 로 덮인다.
 */
export type CourseErrorType =
  | "server" // BFF 응답이 2xx 가 아니거나 body 가 없음
  | "agent" // SSE error 프레임 — lewisai 쪽 실패
  | "empty" // final 은 왔지만 코스로 못 만듦
  | "no-final" // 스트림이 final 없이 끝남
  | "network"; // fetch 자체 실패·중단
