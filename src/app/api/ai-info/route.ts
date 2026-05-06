import { NextRequest, NextResponse } from "next/server";
import type { AIPlaceInfo } from "@/types/quest";

export async function GET(req: NextRequest) {
  const place = req.nextUrl.searchParams.get("place") ?? "";
  const operating_time = req.nextUrl.searchParams.get("operating_time") ?? "";
  const fee = req.nextUrl.searchParams.get("fee") ?? "";
  const subway = req.nextUrl.searchParams.get("subway") ?? "";
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const contextLines = [
    operating_time && `운영시간: ${operating_time}`,
    fee && `요금: ${fee}`,
    subway && `지하철: ${subway}`,
  ]
    .filter(Boolean)
    .join("\n");

  const contextBlock = contextLines
    ? `\n\n[장소 기본 정보]\n${contextLines}`
    : "";

  if (apiKey) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          system:
            "당신은 서울 야경 명소 전문 가이드입니다. 장소에 대해 정확하고 생생한 정보를 한국어로 제공하세요. 반드시 JSON 형식으로만 응답하세요.",
          messages: [
            {
              role: "user",
              content: `서울의 야경 명소 "${place}"에 대해 다음 JSON 형식으로 정보를 제공해주세요.${contextBlock}

{
  "summary": "2~3문장 핵심 설명",
  "highlights": ["포인트1", "포인트2", "포인트3"],
  "tip": "방문 꿀팁 한 문장",
  "era": "설립/개방 연도 (있는 경우)",
  "tags": ["태그1", "태그2", "태그3"]
}`,
            },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.content?.[0]?.text ?? "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const info: AIPlaceInfo = { placeName: place, ...parsed };
          return NextResponse.json({ info });
        }
      }
    } catch {
      // fall through to mock
    }
  }

  // ANTHROPIC_API_KEY 미설정 시 mock 데이터
  await new Promise((r) => setTimeout(r, 400));
  const info: AIPlaceInfo = {
    placeName: place || "알 수 없는 장소",
    summary: `${place}는 서울의 대표적인 야경 명소입니다. 야간에 특히 아름다운 경관을 자랑하며, 사진 촬영 명소로도 인기가 높습니다.`,
    highlights: ["서울의 빛나는 야경을 한눈에", "사진 촬영 명소로 인기", "야간 산책 코스로 최적"],
    tip: "일몰 직후 30분이 가장 아름다운 황금시간대입니다.",
    tags: ["야경", "서울", "포토스팟"],
  };
  return NextResponse.json({ info });
}