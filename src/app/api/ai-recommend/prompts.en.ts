import type { Candidate, Suggestion } from "./route";
import { placeNameEn, PLACE_DESC_EN } from "@/i18n/placeNames";
import { CONGESTION_EN, PLACE_CATEGORY_EN } from "@/i18n/enums";

/**
 * 영문 프롬프트 킷 — prompts.ko.ts와 같은 섹션 구조/톤 제약을 영어로 이식한 버전.
 * 번역 후처리가 아니라 원본 소스(후보 목록·사용자 상황)를 보고 처음부터 영문으로 생성한다.
 *
 * ⚠️ `place` 필드는 화이트리스트 검증(route.ts)과 findPlace() 매칭이 한글 원문에
 * 의존하므로, 반드시 목록의 한글 장소명을 그대로 복사하도록 지시한다.
 */

export const SYSTEM_MSG =
  "You are a Seoul city guide and an expert at recommending things to do in Seoul. Recommend activities that fit the user's situation using ONLY the provided places and information. Respond in English, as a JSON array only, with no other text.";

// ── KST clock ────────────────────────────────────────────────────────────────

function getKSTContext(): { date: string; weekday: string; period: string } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const h = now.getUTCHours();
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const period =
    h < 6 ? "early morning" : h < 11 ? "morning" : h < 14 ? "midday" : h < 18 ? "afternoon" : h < 21 ? "evening" : "night";
  return {
    date: `${now.getUTCMonth() + 1}/${now.getUTCDate()}, ${h}:00 KST`,
    weekday: weekdays[now.getUTCDay()],
    period,
  };
}

// 나이대별 성향 힌트 (ko 버전과 동일 내용의 영문 이식)
function ageHint(ageGroup: string): string {
  if (ageGroup === "10-20대") return "Prefers trendy, Instagram-worthy spots, low cost, high-energy activities.";
  if (ageGroup === "20-30대") return "Prefers hip neighborhoods, cafes, exhibitions, brunch, night views — aesthetic spaces.";
  if (ageGroup === "30-40대") return "Values relaxed, comfortable spaces, good food, and cultural experiences.";
  if (ageGroup === "40-50대") return "Prefers safe, refined places. Strong interest in history and nature.";
  if (ageGroup === "60대 이상") return "Prefers accessible, walkable places, traditional culture and nature. Avoids crowded districts.";
  return "";
}

// 폼 칩(한글 값) → 프롬프트용 영문 표현
const COMPANION_PROMPT: Record<string, string> = {
  "혼자": "alone", "친구": "with friends", "커플": "as a couple", "가족": "with family",
};
const TIME_PROMPT: Record<string, string> = {
  "오전": "morning", "오후": "afternoon", "밤": "evening/night",
};
const PURPOSE_PROMPT: Record<string, string> = {
  "힐링": "relaxation", "놀거리": "fun & entertainment", "데이트": "a date",
  "관광": "sightseeing", "문화생활": "cultural experiences", "운동": "being active",
};
const REGION_PROMPT: Record<string, string> = {
  "강북": "northern Seoul (Gangbuk)", "강서": "western Seoul (Gangseo)",
  "강남": "southern Seoul (Gangnam)", "강동": "eastern Seoul (Gangdong)",
};

// ── Prompt builder ───────────────────────────────────────────────────────────

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

  // 후보 목록: 영문 표기 + 괄호 안 한글 원문(=place 필드에 복사할 값)
  const candidateLines = candidates
    .map((c) => {
      const congestion = c.congestion
        ? ` [current crowd level: ${CONGESTION_EN[c.congestion] ?? c.congestion}]`
        : "";
      const category = PLACE_CATEGORY_EN[c.category] ?? c.category;
      const desc = PLACE_DESC_EN[c.displayName] ?? c.description;
      return `- ${placeNameEn(c.displayName)} (korean name: "${c.displayName}") (${category}: ${desc})${congestion}`;
    })
    .join("\n");

  const congestionRule =
    congestionPref === "여유"
      ? "Prefer places with a 'Low' crowd level. Avoid crowded spots."
      : congestionPref === "보통"
      ? "Pick places with a 'Low' or 'Moderate' crowd level."
      : "Crowd level doesn't matter.";

  const eventBlock =
    purpose === "문화생활" && events.length > 0
      ? `\n[Cultural events currently running in Seoul — you may include suitable ones (event names are in Korean; describe them in English)]\n${events.join("\n")}`
      : "";

  const timePhrase = TIME_PROMPT[time] ?? time;

  return `Recommend ${placeCount} activities to do in Seoul today. Respond with a JSON array only.

[User situation]
- Now: ${kstCtx.date} (${kstCtx.weekday}, ${kstCtx.period})
- With: ${COMPANION_PROMPT[companion] ?? companion}
- Age group: ${ageGroup.replace("대", "s").replace(" 이상", "+")} → ${ageHint(ageGroup)}
- Preferred time: ${timePhrase}
- Purpose: ${PURPOSE_PROMPT[purpose] ?? purpose}
- Preferred area: ${region !== "상관없음" ? REGION_PROMPT[region] ?? region : "anywhere in Seoul"}
- Crowd preference: ${congestionRule}${eventBlock}

[Available places — all clustered in one walkable area. You MUST only recommend places from this list]
${candidateLines}

[Rules]
- Only pick from the list above. Never use a place name that isn't on the list.
- The "place" field MUST contain the exact Korean name shown in quotes after "korean name:" — copy it verbatim, in Korean.
- Write everything else (title, description, reason, tags) in natural English, using the English place names.
- The places are close together, so pick ${placeCount} that flow naturally on foot or within a stop or two. They must be ${placeCount} DIFFERENT places.
- Order them so the route flows in one direction (first stop → last stop), without backtracking.
- Every place you pick must actually be open during the '${timePhrase}' hours.
- Choose places that best match the user's situation (companion, age, time, purpose).
- Pamphlet-style or mechanical writing is strictly forbidden. Write like a warm, friendly Seoul local — a friend who knows the neighborhood well and chats about it casually and affectionately.
- title: not a plain place name — write a fresh, curiosity-sparking, emotional title that makes the user want to tap (e.g. "A healing sunset stroll down hidden alleys").
- description: in that warm, friendly tone, vividly capture the place's charm and on-site vibe in exactly 2–3 sentences. Don't just list facts — weave in evocative detail, appealing but never long-winded; keep it crisp and rich.
- reason: exactly 1 sentence, warm and persuasive, on why this place is a perfect match for the current situation (time, companion, purpose).
- tags: 3–4 key keywords in English.

[Output format — JSON array of exactly ${placeCount} items, no other text]
[
  {
    "title": "Activity title",
    "place": "한글 장소명 (copied verbatim from the list)",
    "duration": "About X hours",
    "description": "Exactly 2–3 vivid sentences",
    "reason": "Exactly 1 sentence on why it fits right now",
    "tags": ["tag1", "tag2", "tag3"]
  },
  ...(${placeCount} total)
]`;
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

export const MOCK_FALLBACK: Suggestion[] = [
  {
    title: "A Cheonggyecheon stroll into Gwangjang Market",
    place: "광화문·덕수궁",
    duration: "About 2 hours",
    description: "Walk along the lantern-lit Cheonggyecheon Stream and it leads you right into Gwangjang Market. The bindaetteok and mayak gimbap there are a must.",
    reason: "An easy, can't-miss classic Seoul route for walking and eating.",
    tags: ["walk", "food", "free"],
  },
  {
    title: "Wander the halls of Gyeongbokgung",
    place: "경복궁",
    duration: "About 1.5 hours",
    description: "Seoul's grandest palace, where Joseon-era architecture unfolds at every turn. The sense of history here runs deep.",
    reason: "The essential stop for really feeling Seoul's history and culture.",
    tags: ["history", "culture", "sightseeing"],
  },
  {
    title: "Cafe hopping through Seongsu",
    place: "성수카페거리",
    duration: "About 3 hours",
    description: "Converted factories turned into one-of-a-kind cafes line the streets. Every alley hides a moody little space, so exploring is half the fun.",
    reason: "Seoul's trendiest neighborhood — perfect for a stylish, laid-back afternoon.",
    tags: ["cafe", "aesthetic", "hip"],
  },
];
