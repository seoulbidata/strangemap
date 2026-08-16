import { NextRequest, NextResponse } from "next/server";

/**
 * 사용자 피드백 수집 엔드포인트.
 *
 * 브라우저 → 이 라우트 → Google Apps Script Web App(/exec) → 스프레드시트 append + 이메일 알림.
 * Apps Script URL을 클라이언트에 노출하지 않으려고 서버를 한 단계 끼웠다. 덕분에
 * IP·배포 커밋 SHA처럼 브라우저가 알 수 없는 컨텍스트를 여기서 붙이고, 레이트리밋도 건다.
 *
 * 설정 방법은 docs/feedback-apps-script.md 참고.
 */

export const runtime = "nodejs";
// 사용자 요청마다 실행돼야 한다 — 캐시되면 안 됨
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 1000;
const MAX_EMAIL_LENGTH = 254;
const VALID_TYPES = new Set(["bug", "inconvenience", "idea", "content"]);

// 레이트리밋 — 같은 IP에서 1분에 3건까지. 서버리스라 인스턴스별 메모리이고 재시작이면 초기화되지만,
// 막으려는 건 정교한 공격이 아니라 실수·장난 연타라 이 정도면 충분하다.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_HITS = 3;
const rateLog = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (rateLog.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_HITS) {
    rateLog.set(key, recent);
    return true;
  }
  recent.push(now);
  rateLog.set(key, recent);

  // 메모리 누수 방지 — 오래된 IP는 주기적으로 버린다
  if (rateLog.size > 500) {
    for (const [k, v] of rateLog) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) rateLog.delete(k);
    }
  }
  return false;
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** 문자열 필드 정규화 — 타입 방어 + 길이 컷 + 앞뒤 공백 제거 */
function str(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export async function POST(req: NextRequest) {
  const endpoint = process.env.FEEDBACK_WEBAPP_URL;
  if (!endpoint) {
    console.error("[feedback] FEEDBACK_WEBAPP_URL 미설정 — 피드백이 유실됩니다");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 허니팟 — 사람 눈에 안 보이는 필드라, 값이 차 있으면 봇이다.
  // 봇에게 실패를 알려주면 우회를 시도하니 200으로 조용히 삼킨다.
  if (str(body.company, 100)) {
    return NextResponse.json({ ok: true });
  }

  const message = str(body.message, MAX_MESSAGE_LENGTH);
  if (!message) {
    return NextResponse.json({ error: "empty_message" }, { status: 400 });
  }

  const email = str(body.email, MAX_EMAIL_LENGTH);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const type = str(body.type, 32);
  const payload = {
    // 사용자 입력
    type: VALID_TYPES.has(type) ? type : "inconvenience",
    message,
    email,
    // 클라이언트가 수집한 컨텍스트
    pageUrl: str(body.pageUrl, 500),
    referrer: str(body.referrer, 500),
    locale: str(body.locale, 8),
    screen: str(body.screen, 40),
    sessionId: str(body.sessionId, 64),
    clientErrors: str(body.clientErrors, 2000),
    // 서버만 아는 컨텍스트
    userAgent: str(req.headers.get("user-agent"), 400),
    ip,
    // 어느 배포에서 터진 건지 아는 유일한 단서
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    env: process.env.VERCEL_ENV ?? "development",
    submittedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Apps Script는 /exec → script.googleusercontent.com 으로 302를 태운다(fetch 기본값이 follow)
      body: JSON.stringify({ ...payload, secret: process.env.FEEDBACK_SHARED_SECRET ?? "" }),
      signal: AbortSignal.timeout(10_000),
    });

    // Apps Script는 스크립트가 실패해도 HTTP 200을 돌려준다 — 본문의 ok 필드까지 확인해야
    // 시크릿 불일치·시트 권한 오류를 성공으로 오인하지 않는다.
    const rawBody = await res.text();
    let upstreamOk = false;
    try {
      upstreamOk = JSON.parse(rawBody)?.ok === true;
    } catch {
      upstreamOk = false;
    }

    if (!res.ok || !upstreamOk) {
      // 사용자가 쓴 내용은 잃지 않게 로그에 남긴다 — Vercel Runtime Logs가 최후의 보루
      console.error(
        "[feedback] Apps Script 응답 실패",
        res.status,
        rawBody.slice(0, 300),
        JSON.stringify(payload),
      );
      return NextResponse.json({ error: "upstream_failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[feedback] 전송 실패", err, JSON.stringify(payload));
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
}
