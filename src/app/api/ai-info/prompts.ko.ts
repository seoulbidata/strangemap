import type { AIEvent, AIPlaceInfo } from "@/types/quest";

/**
 * 한글 프롬프트 킷 — route.ts에서 그대로 추출한 원본(동작 무변경).
 * 영문판(prompts.en.ts)과 동일한 인터페이스를 export 한다.
 */

export const SYSTEM_MSG =
  "당신은 서울시 장소를 모두 알고 있는 로컬 가이드입니다. 확실히 아는 사실만 담아, 처음 방문하는 사람에게 솔직하고 생생하게 이 장소를 소개해주세요. 반드시 JSON 형식으로만 응답하세요.";

// ── KST 시각 ─────────────────────────────────────────────────────────────────

function getKSTContext(): { now: string; weekday: string; period: string; h: number; isWeekend: boolean } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC+9
  const h = now.getUTCHours();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const dow = now.getUTCDay();
  const period =
    h < 6 ? "새벽" : h < 11 ? "오전" : h < 14 ? "점심" : h < 18 ? "오후" : h < 21 ? "저녁" : "밤";
  return {
    now: `${now.getUTCMonth() + 1}월 ${now.getUTCDate()}일 ${h}시`,
    weekday: weekdays[dow],
    period,
    h,
    isWeekend: dow === 0 || dow === 6,
  };
}

// ── 결정적(비-AI) 생성기 ───────────────────────────────────────────────────────

export function buildRightNow(congestion: string | null): string {
  const { period, weekday, isWeekend } = getKSTContext();
  const level = congestion?.split(":")?.[0]?.trim() ?? null;
  const timeCtx = `${weekday}요일 ${period}`;

  if (!level || level === "정보없음") {
    return `${timeCtx}이에요. 방문 전 운영 시간을 확인해보세요.`;
  }
  if (level === "여유") {
    return `지금 (${timeCtx}) 한산해요. 여유롭게 즐기기 딱 좋은 타이밍입니다.`;
  }
  if (level === "보통") {
    return `지금 (${timeCtx}) 적당한 혼잡도예요. 편하게 둘러볼 수 있어요.`;
  }
  if (level === "약간 붐빔") {
    const avoidTip = isWeekend ? "평일 오전이 훨씬 여유로워요." : "이른 오전이나 저녁 시간대를 노려보세요.";
    return `지금 (${timeCtx}) 약간 붐비는 편이에요. ${avoidTip}`;
  }
  if (level === "붐빔") {
    return `지금 (${timeCtx}) 꽤 붐빕니다. 1~2시간 후나 이른 오전 방문을 추천해요.`;
  }
  if (level === "매우 붐빔") {
    return `지금 (${timeCtx}) 매우 붐비는 상태예요. 가능하면 다른 시간대에 방문하는 걸 추천합니다.`;
  }
  return `${timeCtx} 기준으로 방문 가능한 시간대입니다.`;
}

export function buildEventPick(events: AIEvent[]): string | undefined {
  if (events.length === 0) return undefined;
  const e = events[0];
  const distStr = e._distKm ? `${e._distKm}km 거리의 ` : "";
  const periodStr = e.period ? ` (${e.period})` : "";
  return `${distStr}${e.title}${periodStr}와 함께 들러보면 더 알찬 하루가 될 거예요.`;
}

// ── 프롬프트 빌더 ─────────────────────────────────────────────────────────────

export function buildPrompt(
  place: string,
  operating_time: string,
  fee: string,
  subway: string,
  viewpoints: string[],
  congestion: string | null,
  realEvents: AIEvent[],
  type?: string
): string {
  const { now, weekday, period } = getKSTContext();

  const ctx: string[] = [`현재: ${now} (${weekday}요일 ${period})`];
  if (operating_time) ctx.push(`운영: ${operating_time}`);
  if (fee) ctx.push(`요금: ${fee}`);
  if (subway) ctx.push(`교통: ${subway}`);
  if (congestion) ctx.push(`실시간 혼잡: ${congestion}`);

  const viewpointBlock =
    viewpoints.length > 0
      ? `\n[공식 뷰포인트] ${viewpoints.slice(0, 3).join(" / ")}`
      : "";

  const eventBlock =
    realEvents.length > 0
      ? `\n[현재 진행 중인 인근 행사]\n${realEvents
          .slice(0, 3)
          .map(
            (e, i) =>
              `${i + 1}. ${e.title}${e._distKm ? ` (${e._distKm}km)` : ""}${
                e.period ? ` · ${e.period}` : ""
              }${e.desc ? ` · ${e.desc}` : ""}`
          )
          .join("\n")}`
      : "";

  const hasViewpoint = viewpoints.length > 0;

  const isCulture = type === "culture";

  const summaryRule = isCulture
    ? "- summary: 이 행사가 무엇인지 딱 3문장으로 설명해줘. 행사의 핵심 성격, 주요 프로그램, 주된 관람 대상을 명확하게 담고, 다정하게 대화하듯 알차게 작성해줘."
    : "- summary: 이 장소의 분위기와 감성, 핵심 경험을 다정하게 대화하듯 딱 3문장으로 생생하게 작성해줘. 단순히 사실만 요약하기보다 특유의 오감과 매력이 잘 전달되도록 너무 장황하지도 밋밋하지도 않은 딱 중간 정도로 작성해줘.";

  const highlightsRule = isCulture
    ? "- highlights: 이 행사의 핵심 볼거리/체험 요소 3가지를 적어줘. 식상하지 않고 가보고 싶게 만들도록 각각 1문장 내로 구체적으로 서술해줘."
    : "- highlights: 이 장소에서만 만끽할 수 있는 구체적이고 이색적인 추천 경험 3가지를 적어줘. 식상한 단어 대신 구체적인 행동을 묘사해 각각 1문장 내로 상세하게 서술해줘.";

  return `서울 "${place}"를 처음 방문하는 사람에게 소개해줘. 아래 컨텍스트만 사용하고 추측 금지. JSON만 응답.

[컨텍스트]
${ctx.join("\n")}${viewpointBlock}${eventBlock}

[rule]
- 컨텍스트에 없는 구체적 사실(연도·수치·고유명사) 절대 추측 금지. 모르면 해당 필드 생략.
- 컨텍스트에 제공된 모든 핵심 고유명사(예: 행사 주최측 명칭, 강연자/출연진 이름, 정확한 강연/공연 주제, 연계 전시나 프로그램의 구체적 명칭, 요금 정보 등)를 절대로 누락하지 말고, 설명 문장 속에 다정하고 자연스럽게 전부 녹여내어 서술해줘.
- 톤: 서울에 오래 거주한 베테랑 로컬 가이드가 친구에게 다정하게 수다 떨듯 친근한 구어체로 설명해줘. 팸플릿이나 기계적인 홍보 문체는 절대 금지해.
${summaryRule}
${highlightsRule}
- tip: 단순한 안내가 아닌, 동네 주민들만 아는 아주 실용적이고 비밀스러운 꿀팁을 명료하게 딱 1문장으로 적어줘.
- best_time: 최적의 방문 시간대와 계절을 추천하고, 그 낭만적인 이유를 명료하게 딱 1문장으로 적어줘.
- crowd_tip: 실시간 혼잡 데이터를 자연스럽게 반영하여, 복잡함을 피하는 구체적인 방문 요령을 다정하게 딱 1문장으로 제시해줘.

[출력 형식 — 이 키만, 정확히]
{
  "summary": "분위기·감성·핵심 경험 딱 3문장 (알차게)",
  "highlights": ["구체적이고 이색적인 행동 3개 (각각 딱 1문장)"],
  "tip": "로컬만 아는 비밀 꿀팁 딱 1문장",
  "best_time": "최적 방문 시간과 낭만적인 이유 딱 1문장",
  "crowd_tip": "혼잡 회피 요령 및 실시간 혼잡 조언 딱 1문장"${hasViewpoint ? ',\n  "viewpoint_guide": "뷰포인트 감상 비결 딱 1문장"' : ""},
  "vibe": ["분위기 키워드 2~3개"],
  "tags": ["성격 태그 4~6개"]
}

[예시 응답]
{"summary": "지상 17미터 위로 올라가면 꽉 막힌 차도 대신 예쁜 공중 정원이 쫙 펼쳐져. 발밑으로는 차들이 쌩쌩 달리는데, 내 주변은 식물들로 가득해서 기분이 엄청 묘하고 신기해. 해 질 녘에 파란색 조명이 켜질 때쯤 걸으면 분위기가 확 달라져서, 복잡한 도심 한복판에서 조용히 밤산책하고 싶은 사람한테 완전 딱이야.",
  "highlights": [
    "투명 유리 바닥 위에서 발밑으로 지나가는 차들 구경하기",
    "문화역서울 284 옛날 지붕을 배경으로 레트로한 인증샷 남기기",
    "내 이름 초성이랑 똑같은 이름표를 단 식물 찾아보기"
  ],
  "tip": "중간중간 있는 원형 화분 벤치에 앉아서 커피 한잔하면서 야경 보는 게 진짜 힐링이야.",
  "best_time": "야간 조명이 파랗게 켜지고 주변 빌딩 불빛이 들어오는 저녁 7시 이후가 제일 예뻐.",
  "crowd_tip": "주말 오후엔 사람이 은근히 많아서, 사진 제대로 찍으려면 평일 저녁이나 아예 늦은 밤에 가는 걸 추천해.",
  "viewpoint_guide": "서울역 광장 쪽을 정면으로 내려다보는 난간 쪽이 차 궤적 사진 찍기 좋은 명당이야.",
  "vibe": ["묘한", "도심속여유", "은하수같은"],
  "tags": ["도심탐험", "야경명소", "산책로", "재생건축", "데이트"]}`;
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

export function buildMockInfo(args: {
  place: string;
  viewpoints: string[];
  right_now: string;
  nearby: string[];
  event_pick?: string;
  realEvents: AIEvent[];
}): AIPlaceInfo {
  const { place, viewpoints, right_now, nearby, event_pick, realEvents } = args;
  return {
    placeName: place || "알 수 없는 장소",
    summary: `${place}는 서울의 대표적인 명소입니다. 야간에 특히 아름다운 경관을 자랑하며 많은 이들이 찾는 곳입니다.`,
    highlights: ["서울의 빛나는 야경을 한눈에", "사진 명소로 인기", "야간 산책 코스로 최적"],
    tip: "일몰 직후 30분이 가장 아름다운 황금시간대입니다.",
    best_time: "늦가을~초겨울(10~12월) 맑은 날 저녁이 가장 좋습니다.",
    crowd_tip: "평일 저녁이 주말보다 훨씬 여유롭습니다.",
    right_now,
    nearby,
    ...(event_pick && { event_pick }),
    ...(viewpoints.length > 0 && { viewpoint_guide: viewpoints[0] }),
    ...(realEvents.length > 0 && { events: realEvents }),
    tags: ["야경", "서울", "포토스팟"],
  };
}
