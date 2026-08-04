import { NextRequest } from "next/server";

/**
 * 나만의 코스 BFF 프록시 (SSE 스트리밍) — 브라우저 {message, chips} → lewisai /agent/chat/stream.
 *
 * 브라우저는 AI 서버를 직접 호출하지 않는다 (deploy-architecture.md 원칙).
 * lewisai의 SSE 스트림(progress / final / error 이벤트)을 그대로 클라이언트로 파이프한다.
 * 스트리밍이라 단발 fetch 타임아웃(예전 55초 abort) 문제가 사라지고, 진행 단계를 실시간 노출한다.
 * 응답 이벤트 계약: lewisai app/graph/build.py `_stream` (progress{stage} / final{payload} / error).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 스트리밍이라 단발 타임아웃은 없지만 함수 상한은 넉넉히.
// ⚠️ Vercel Hobby는 60초 상한 — 대형 멀티데이 전체를 프로덕션에서 받으려면 Pro(≤300초)가 필요하다.
export const maxDuration = 120;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no", // nginx/프록시 버퍼링 방지 (실시간 전달)
};

/** 클라이언트가 SSE로 파싱할 수 있게 오류도 event 프레임으로 내보낸다. */
function sseError(message: string, status = 200) {
  return new Response(`data: ${JSON.stringify({ event: "error", message })}\n\n`, {
    status,
    headers: SSE_HEADERS,
  });
}

export async function POST(req: NextRequest) {
  const aiServerUrl = process.env.AI_SERVER_URL;
  if (!aiServerUrl) return sseError("AI_SERVER_URL is not configured", 503);

  const body = await req.json().catch(() => ({}));
  const message: string = body?.message ?? "";
  const chips = body?.chips ?? null;
  // "다시 만들기" — 같은 칩으로 다른 코스를 받으려면 매번 다른 값을 보낸다.
  // 생략하면 lewisai가 칩+note 해시로 시드를 정해 **같은 요청은 같은 후보**를 낸다
  // (재현 가능해야 디버깅·A/B가 되므로 서버 기본값이 결정적이다).
  const seed: number | undefined =
    typeof body?.seed === "number" && Number.isFinite(body.seed) ? body.seed : undefined;

  try {
    const upstream = await fetch(`${aiServerUrl}/agent/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 로컬은 토큰 비어 있고 lewisai가 빈 값이면 검증 skip → 헤더 있어도 통과.
        "X-Internal-Token": process.env.AI_SERVER_TOKEN ?? "",
      },
      body: JSON.stringify(seed === undefined ? { message, chips } : { message, chips, seed }),
      // 스트림이 무한정 매달리지 않도록 안전망(최악 멀티데이 ~80초보다 넉넉히).
      signal: AbortSignal.timeout(170_000),
    });

    if (!upstream.ok || !upstream.body) {
      return sseError(`AI server responded ${upstream.status}`);
    }

    // lewisai SSE 스트림을 그대로 클라이언트로 파이프 (progress / final / error 프레임)
    return new Response(upstream.body, { headers: SSE_HEADERS });
  } catch (err) {
    console.error("[course] stream proxy failed:", err);
    return sseError("AI 서버에 연결하지 못했어요.");
  }
}
