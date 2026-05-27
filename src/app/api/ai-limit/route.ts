import { NextRequest, NextResponse } from "next/server";
import { getAIUsage, getDailyLimit } from "@/lib/aiUsage";

export async function GET() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenRouter API Key가 설정되지 않았습니다." },
      { status: 400 }
    );
  }

  // Get local usage counter details
  const localUsage = getAIUsage();
  const dailyLimit = getDailyLimit();
  const remaining = Math.max(0, dailyLimit - localUsage.count);

  const localUsagePayload = {
    date: localUsage.date,
    today_calls: localUsage.count,
    daily_limit: dailyLimit,
    remaining_calls: remaining,
  };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      next: { revalidate: 0 }, // Disable Next.js caching
    });

    if (!response.ok) {
      return NextResponse.json({
        local_usage: localUsagePayload,
        error: `OpenRouter API가 오류를 반환했습니다 (상태 코드: ${response.status})`
      });
    }

    const data = await response.json();
    return NextResponse.json({
      ...data,
      local_usage: localUsagePayload,
    });
  } catch (error) {
    return NextResponse.json({
      local_usage: localUsagePayload,
      error: error instanceof Error ? error.message : "알 수 없는 에러가 발생했습니다."
    });
  }
}
