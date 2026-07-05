import type { Candidate, Suggestion } from "./route";

/**
 * 한글 프롬프트 킷 — route.ts에서 그대로 추출한 원본(동작 무변경).
 * 영문판(prompts.en.ts)과 동일한 인터페이스를 export 한다.
 */

export const SYSTEM_MSG =
  "당신은 서울시의 가이드이자 서울시 내의 컨텐츠를 추천하는 전문가입니다. 제공된 장소와 정보 안에서만 사용자 상황에 맞는 활동을 추천하세요. JSON 배열로만 응답하고 다른 텍스트는 출력하지 마세요.";

// ── KST 시각 ─────────────────────────────────────────────────────────────────

function getKSTContext(): { date: string; weekday: string; period: string } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const h = now.getUTCHours();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const period =
    h < 6 ? "새벽" : h < 11 ? "오전" : h < 14 ? "점심" : h < 18 ? "오후" : h < 21 ? "저녁" : "밤";
  return {
    date: `${now.getUTCMonth() + 1}월 ${now.getUTCDate()}일 ${h}시`,
    weekday: weekdays[now.getUTCDay()],
    period,
  };
}

// 나이대별 성향 힌트
function ageHint(ageGroup: string): string {
  if (ageGroup === "10-20대") return "트렌디하고 SNS 감성적인 장소, 저렴한 비용, 에너지 넘치는 활동 선호.";
  if (ageGroup === "20-30대") return "힙한 동네, 카페, 전시, 브런치, 야경 등 감성적인 공간 선호.";
  if (ageGroup === "30-40대") return "편안하고 여유로운 공간, 맛있는 음식, 문화적 경험을 중시함.";
  if (ageGroup === "40-50대") return "안전하고 품격 있는 장소 선호. 역사·자연 관련 관심 높음.";
  if (ageGroup === "60대 이상") return "접근성 좋고 걷기 편한 장소, 전통문화·자연 선호. 복잡한 번화가는 피해.";
  return "";
}

// ── 프롬프트 빌더 ─────────────────────────────────────────────────────────────

export function buildPrompt(
  companion: string,
  ageGroup: string,
  time: string,
  purpose: string,
  region: string,
  congestionPref: string,
  placeCount: number,
  candidates: Candidate[],
  events: string[]
): string {
  const kstCtx = getKSTContext();

  // 후보 장소 목록 (혼잡도 정보 포함)
  const candidateLines = candidates
    .map((c) => {
      const congestionLabel = c.congestion ? ` [현재 혼잡도: ${c.congestion}]` : "";
      return `- ${c.displayName} (${c.category}, ${c.description})${congestionLabel}`;
    })
    .join("\n");

  // 혼잡도 지침
  const congestionRule =
    congestionPref === "여유"
      ? "혼잡도가 '여유'인 장소를 우선 선택해. 붐비는 곳은 배제해."
      : congestionPref === "보통"
      ? "혼잡도가 '여유' 또는 '보통'인 장소를 선택해."
      : "혼잡도는 상관없어.";

  // 문화생활: 행사 정보 블록
  const eventBlock =
    purpose === "문화생활" && events.length > 0
      ? `\n[현재 서울 진행 중인 문화행사 — 아래 목록에서 적합한 것을 추천에 포함해도 좋아]\n${events.join("\n")}`
      : "";

  return `서울에서 오늘 할 수 있는 활동 ${placeCount}가지를 추천해줘. JSON 배열만 응답.

[
  사용자 상황]
- 현재: ${kstCtx.date} (${kstCtx.weekday}요일 ${kstCtx.period})
- 누구랑: ${companion}
- 나이대: ${ageGroup} → ${ageHint(ageGroup)}
- 원하는 시간대: ${time}
- 목적: ${purpose}
- 원하는 위치: ${region !== "상관없음" ? `서울 ${region} 지역` : "서울 전역 상관없음"}
- 혼잡도 선호: ${congestionRule}${eventBlock}

[추천 가능한 장소 목록 — 모두 서로 가까운 한 지역에 모여 있음. 반드시 이 목록에 있는 장소만 추천]
${candidateLines}

[규칙]
- 위 장소 목록에서만 골라서 추천. 목록에 없는 장소명은 사용 금지.
- place 필드에는 목록의 장소명을 그대로 사용해.
- 위 장소들은 서로 가까우니, 도보나 한두 정거장 이동으로 자연스럽게 이어지는 ${placeCount}곳을 골라줘. 반드시 서로 다른 ${placeCount}곳이어야 해.
- 동선이 왔다 갔다 하지 않고 한 방향으로 흐르도록, 첫 곳 → 마지막 곳 순서를 정해서 배열에 담아줘.
- 선택한 곳은 모두 '${time}' 시간대에 실제로 문을 여는 곳이어야 해.
- 사용자 상황(누구랑·나이대·시간대·목적)에 딱 맞는 장소 위주로 선택.
- 팸플릿이나 기계적인 문체는 엄격히 금지하며, 그 동네를 잘 아는 친근한 서울 토박이 친구가 조근조근 말해주는 듯 다정한 어조로 작성해줘.
- title: 단순한 장소명 나열이 아닌, 사용자가 클릭하고 싶게 만드는 호기심 자극형 감성 제목(예: "해 질 녘 골목길을 따라 걷는 힐링 산책")으로 참신하게 지어줘.
- description: 친근하고 다정한 친구 말투로 장소의 매력과 현장 분위기를 딱 2~3문장으로 생생하게 작성해줘. 단순히 사실만 나열하지 말고 핵심 감성 묘사를 가미해 충분히 매력적이면서도 너무 장황하지 않도록 명료하고 알차게 채워줘.
- reason: 현재 상황(시간대·동행인·목적)에 이 장소가 왜 찰떡궁합인지 다정하고 설득력 있게 딱 1문장으로 적어줘.
- tags: 핵심 키워드 3~4개.

[출력 형식 — 다른 텍스트 없이 원소 ${placeCount}개짜리 JSON 배열만]
[
  {
    "title": "활동 제목",
    "place": "장소명 (목록 그대로)",
    "duration": "약 X시간",
    "description": "활동 설명 딱 2~3문장 (너무 장황하지 않고 생생하게)",
    "reason": "이 상황에 특히 좋은 이유 딱 1문장",
    "tags": ["태그1", "태그2", "태그3"]
  },
  ...(총 ${placeCount}개)
]`;
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

export const MOCK_FALLBACK: Suggestion[] = [
  {
    title: "청계천 산책 후 광장시장",
    place: "광화문·덕수궁",
    duration: "약 2시간",
    description: "조명 켜진 청계천을 따라 걷다 광장시장으로 연결돼. 빈대떡이랑 마약김밥은 필수 코스야.",
    reason: "부담 없이 걷고 먹기 좋은 실패 없는 서울 정석 코스.",
    tags: ["산책", "맛집", "무료"],
  },
  {
    title: "경복궁 관람",
    place: "경복궁",
    duration: "약 1시간 30분",
    description: "서울의 대표 궁궐로 조선시대 건축을 한눈에 볼 수 있어. 역사적 분위기가 깊은 곳이야.",
    reason: "서울에서 역사·문화를 제대로 느낄 수 있는 필수 코스.",
    tags: ["역사", "문화", "관광"],
  },
  {
    title: "성수 카페 투어",
    place: "성수카페거리",
    duration: "약 3시간",
    description: "공장을 개조한 독특한 카페들이 즐비해. 골목마다 숨겨진 감성 공간이 있어서 탐험하는 재미가 있어.",
    reason: "서울에서 가장 트렌디한 동네로 감성적인 시간을 보내기에 딱 맞아.",
    tags: ["카페", "감성", "힙한"],
  },
];
