import { NextRequest, NextResponse } from "next/server";
import { getAIUsage, getDailyLimit } from "@/lib/aiUsage";

export async function GET() {
  const localUsage = getAIUsage();
  const dailyLimit = getDailyLimit();
  const remaining = Math.max(0, dailyLimit - localUsage.count);

  return NextResponse.json({
    local_usage: {
      date: localUsage.date,
      today_calls: localUsage.count,
      daily_limit: dailyLimit,
      remaining_calls: remaining,
    }
  });
}
