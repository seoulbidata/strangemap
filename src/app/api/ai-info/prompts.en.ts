import type { AIEvent, AIPlaceInfo } from "@/types/quest";
import { placeNameEn } from "@/i18n/placeNames";
import { CONGESTION_EN } from "@/i18n/enums";
import type { AreaStatus, PromptContext } from "./types";

/**
 * 영문 프롬프트 킷 — prompts.ko.ts와 같은 섹션 구조([컨텍스트]/[rule]/[출력 형식]/예시)와
 * 톤 제약("베테랑 로컬 가이드의 다정한 수다")을 영어로 이식한 버전.
 * few-shot 예시도 영어로 재작성해 모델이 한글에 앵커링되지 않게 한다.
 */

export const SYSTEM_MSG =
  "You are a local guide who knows every place in Seoul. Introduce this place to a first-time visitor honestly and vividly, using only facts you are certain of. Respond in English, in JSON format only.";

// ── KST clock ────────────────────────────────────────────────────────────────

function getKSTContext(): { now: string; weekday: string; period: string; h: number; isWeekend: boolean } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC+9
  const h = now.getUTCHours();
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dow = now.getUTCDay();
  const period =
    h < 6 ? "early morning" : h < 11 ? "morning" : h < 14 ? "midday" : h < 18 ? "afternoon" : h < 21 ? "evening" : "night";
  return {
    now: `${now.getUTCMonth() + 1}/${now.getUTCDate()}, ${h}:00 KST`,
    weekday: weekdays[dow],
    period,
    h,
    isWeekend: dow === 0 || dow === 6,
  };
}

// ── 결정적(비-AI) 생성기 — ko 버전과 동일한 레벨 분기, 영어 문장 템플릿 ─────────

const CONGEST_RANK: Record<string, number> = {
  "여유": 0,
  "보통": 1,
  "약간 붐빔": 2,
  "붐빔": 3,
  "매우 붐빔": 4,
};

/** FCST_TIME("YYYY-MM-DD HH:MM") → hour. null on parse failure */
function forecastHour(time: string): number | null {
  const h = parseInt(time.slice(11, 13), 10);
  return Number.isNaN(h) ? null : h;
}

function congestionEn(level: string): string {
  return CONGESTION_EN[level] ?? level;
}

/** If the forecast shows an easing slot, return an English relief clause */
function forecastRelief(status: AreaStatus): string {
  const rank = CONGEST_RANK[status.level];
  if (rank === undefined || rank < 2) return "";
  const better = status.forecast.find((f) => (CONGEST_RANK[f.level] ?? 99) < rank);
  if (!better) return "";
  const h = forecastHour(better.time);
  if (h === null) return "";
  return ` The forecast says it should ease to "${congestionEn(better.level)}" around ${h}:00.`;
}

export function buildRightNow(status: AreaStatus | null): string {
  const { period, weekday, isWeekend } = getKSTContext();
  const level = status?.level ?? null;
  const timeCtx = `${weekday} ${period}`;

  if (!status || !level || level === "정보없음") {
    return `It's ${timeCtx}. Check the opening hours before you visit.`;
  }
  if (level === "여유") {
    return `It's quiet right now (${timeCtx}) — a perfect time to enjoy it at your own pace.`;
  }
  if (level === "보통") {
    return `Crowds are moderate right now (${timeCtx}). You can look around comfortably.`;
  }
  if (level === "약간 붐빔") {
    const avoidTip = isWeekend
      ? "Weekday mornings are much quieter."
      : "Try early morning or the evening hours instead.";
    return `It's a bit busy right now (${timeCtx}). ${avoidTip}${forecastRelief(status)}`;
  }
  if (level === "붐빔") {
    return `It's quite crowded right now (${timeCtx}).${forecastRelief(status) || " Visiting in 1–2 hours or early morning is recommended."}`;
  }
  if (level === "매우 붐빔") {
    return `It's very crowded right now (${timeCtx}).${forecastRelief(status) || " If possible, visit at a different time."}`;
  }
  return `As of ${timeCtx}, it's a fine time to visit.`;
}

export function buildEventPick(events: AIEvent[]): string | undefined {
  if (events.length === 0) return undefined;
  const e = events[0];
  const distStr = e._distKm ? `${e._distKm}km away` : "nearby";
  const periodStr = e.period ? ` (${e.period})` : "";
  return `Pair your visit with "${e.title}"${periodStr}, ${distStr}, to make the day even fuller.`;
}

// ── Prompt builder ───────────────────────────────────────────────────────────

/** seoulSpots.json bestTime → natural-language hint for the prompt */
const BEST_TIME_HINT: Record<string, string> = {
  night: "a night-view spot (it peaks after dark)",
  day: "a daytime spot (closed or much less to see at night)",
  any: "good both day and night",
};

export function buildPrompt(ctx: PromptContext): string {
  const { now, weekday, period } = getKSTContext();
  const { place, type, status, realEvents, viewpoints, curated, course } = ctx;
  const placeEn = placeNameEn(place);
  const placeLabel = placeEn !== place ? `${placeEn} (${place})` : place;

  const lines: string[] = [`Now: ${now} (${weekday}, ${period})`];
  if (ctx.category) lines.push(`Category (in Korean): ${ctx.category}`);
  if (ctx.bestTime) lines.push(`Best time: ${BEST_TIME_HINT[ctx.bestTime] ?? ctx.bestTime}`);
  if (ctx.addr) lines.push(`Address (in Korean): ${ctx.addr}`);
  if (ctx.operating_time) lines.push(`Hours: ${ctx.operating_time}`);
  if (ctx.fee) lines.push(`Fee: ${ctx.fee}`);
  if (ctx.eventPeriod) lines.push(`Event period: ${ctx.eventPeriod}`);
  if (ctx.subway) lines.push(`Subway: ${ctx.subway}`);
  if (ctx.bus) lines.push(`Bus (in Korean): ${ctx.bus}`);
  if (ctx.parking) lines.push(`Parking (in Korean): ${ctx.parking}`);
  if (ctx.tel) lines.push(`Contact: ${ctx.tel}`);

  let hasWeather = false;
  if (status) {
    lines.push(
      `Live crowd level: ${congestionEn(status.level)}${status.msg ? ` — ${status.msg} (raw message in Korean)` : ""}`
    );
    if (status.forecast.length > 0) {
      lines.push(
        `Crowd forecast: ${status.forecast
          .map((f) => {
            const h = forecastHour(f.time);
            return h === null ? congestionEn(f.level) : `${h}:00 ${congestionEn(f.level)}`;
          })
          .join(" → ")}`
      );
    }
    const w = status.weather;
    if (w) {
      const parts = [
        w.temp && `temp ${w.temp}℃`,
        w.sky && `sky: ${w.sky} (in Korean)`,
        w.pcpMsg && `precipitation: ${w.pcpMsg} (in Korean)`,
        w.pm10Level && `fine dust: ${w.pm10Level} (in Korean)`,
      ].filter(Boolean);
      if (parts.length > 0) {
        lines.push(`Weather: ${parts.join(" · ")}`);
        hasWeather = true;
      }
    }
  }

  if (curated) {
    lines.push(`Place character (in Korean): ${curated.category}`);
    lines.push(`Verified description (in Korean): ${curated.description}`);
  }

  let courseBlock = "";
  if (course) {
    const meta = [
      course.bestTime && `best time: ${course.bestTime}`,
      course.duration && `suggested stay: ${course.duration}`,
    ]
      .filter(Boolean)
      .join(", ");
    courseBlock =
      `\n[Course curation — verified description (in Korean)]` +
      (course.title ? `\nCourse: ${course.title}${meta ? ` (${meta})` : ""}` : "") +
      (course.description ? `\nThis stop: ${course.description}` : "") +
      (course.tip ? `\nCurator's tip: ${course.tip}` : "");
  }

  const viewpointBlock =
    viewpoints.length > 0
      ? `\n[Official viewpoints (in Korean)] ${viewpoints.slice(0, 3).join(" / ")}`
      : "";

  const eventBlock =
    realEvents.length > 0
      ? `\n[Nearby events currently running (names in Korean — describe them in English)]\n${realEvents
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
    ? "- summary: explain what this event is in exactly 3 sentences. Clearly cover its core character, main programs, and who it's for — warm and conversational, but substantive."
    : "- summary: capture this place's atmosphere, mood, and core experience in exactly 3 vivid sentences, warm and conversational. Don't just summarize facts — convey its distinct senses and charm, neither long-winded nor flat, right in the middle.";

  const highlightsRule = isCulture
    ? "- highlights: 3 key things to see/experience at this event. Make each one concrete and enticing, within 1 sentence each — no clichés."
    : "- highlights: 3 concrete, distinctive experiences you can only have here. Describe specific actions instead of stale words, within 1 sentence each.";

  // Only add rules matching data that actually exists in the context (avoid confusing the model)
  const extraRules: string[] = [];
  if (curated || course) {
    extraRules.push(
      "- The 'Verified description' and 'Course curation' blocks are confirmed facts. Use them as the backbone of summary and highlights, but rephrase in your own voice — never copy sentences verbatim (and translate them into English)."
    );
  }
  if (course?.tip) {
    extraRules.push("- Make tip a fresh angle that does not overlap with the curator's tip.");
  }
  if (hasWeather) {
    extraRules.push(
      "- Weave the weather info naturally into tip or crowd_tip exactly once (rain → umbrella or indoor routing, bad fine dust → mask, etc.). Never mention weather beyond what's in the context."
    );
  }
  if (ctx.bus || ctx.parking) {
    extraRules.push("- If bus/parking info is given, feel free to use it in tip or crowd_tip as access advice.");
  }

  const bestTimeRule = course?.bestTime
    ? "- best_time: prioritize the course's recommended time, then give the best time to visit with its romantic reason, in exactly 1 crisp sentence."
    : ctx.bestTime === "night"
      ? "- best_time: recommend when the night view peaks (time of day and season), with its romantic reason, in exactly 1 crisp sentence."
      : ctx.bestTime === "day"
        ? "- best_time: this place is hard to enjoy after dark, so recommend a daytime slot and season with the reason, in exactly 1 crisp sentence. Never mention night views or night lighting."
        : "- best_time: recommend the best time of day and season to visit, with its romantic reason, in exactly 1 crisp sentence.";

  const crowdTipRule = status?.forecast?.length
    ? "- crowd_tip: reflect both the live crowd level and the crowd forecast — if a quieter slot is forecast, say something like 'it should calm down around X o'clock', in 1 warm, specific sentence. Never guess crowd levels for hours not in the forecast."
    : "- crowd_tip: naturally reflect the live crowd data and give one warm, specific sentence on how to dodge the crowds.";

  return `Introduce Seoul's "${placeLabel}" to a first-time visitor. Use ONLY the context below — no guessing. Respond with JSON only.

[Context]
${lines.join("\n")}${courseBlock}${viewpointBlock}${eventBlock}

[Rules]
- Never guess specific facts (years, figures, proper nouns) not in the context. If unsure, omit the field.
- Never drop any key proper noun given in the context (e.g. event organizer names, speaker/performer names, exact talk/performance topics, linked exhibition or program names, fee info) — weave them all naturally and warmly into your sentences. Korean proper nouns may stay in Korean.
- Tone: like a veteran local guide who's lived in Seoul for decades, chatting warmly with a friend in casual spoken English. Pamphlet-style or mechanical promotional writing is strictly forbidden.
- Write everything in English (Korean proper nouns may remain as-is).
${summaryRule}
${highlightsRule}${extraRules.length > 0 ? `\n${extraRules.join("\n")}` : ""}
- tip: not generic guidance — one crisp sentence with a genuinely practical, insider tip only neighborhood locals would know.
${bestTimeRule}
${crowdTipRule}

[Output format — these keys only, exactly]
{
  "summary": "Atmosphere, mood, core experience in exactly 3 rich sentences",
  "highlights": ["3 concrete, distinctive actions (exactly 1 sentence each)"],
  "tip": "1 insider secret tip only locals know",
  "best_time": "Best time to visit and its romantic reason, 1 sentence",
  "crowd_tip": "1 sentence on avoiding crowds, using the live data"${hasViewpoint ? ',\n  "viewpoint_guide": "1 sentence on how to best enjoy the viewpoint"' : ""},
  "vibe": ["2–3 mood keywords"],
  "tags": ["4–6 character tags"]
}

[Example response]
{"summary": "Climb 17 meters above the street and instead of gridlocked traffic, a pretty garden in the sky stretches out before you. Cars rush beneath your feet while you're surrounded by plants, and the contrast feels wonderfully surreal. Around sunset, when the blue lights flick on, the whole mood shifts — perfect for anyone craving a quiet night walk in the middle of the busy city.",
  "highlights": [
    "Watch the cars stream by under your feet through the glass floor panels",
    "Snag a retro photo with the old Culture Station Seoul 284 rooftop as your backdrop",
    "Hunt for a plant whose name tag shares your initials"
  ],
  "tip": "Grab a seat on one of the round planter benches with a coffee and take in the night view — it's pure healing.",
  "best_time": "After 7pm, when the blue night lighting comes on and the surrounding buildings light up, is when it's most beautiful.",
  "crowd_tip": "Weekend afternoons get surprisingly busy, so go on a weekday evening or late at night if you want clean photos.",
  "viewpoint_guide": "The railing facing Seoul Station plaza is the prime spot for capturing light trails from the traffic below.",
  "vibe": ["surreal", "urban calm", "dreamlike"],
  "tags": ["city exploring", "night views", "walkway", "adaptive reuse", "date spot"]}`;
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

export function buildMockInfo(args: {
  place: string;
  bestTime?: string;
  viewpoints: string[];
  right_now: string;
  nearby: string[];
  event_pick?: string;
  realEvents: AIEvent[];
}): AIPlaceInfo {
  const { place, viewpoints, right_now, nearby, event_pick, realEvents, bestTime } = args;
  const isDay = bestTime === "day";
  const placeEn = placeNameEn(place);
  return {
    placeName: place || "Unknown place",
    summary: isDay
      ? `${placeEn} is one of Seoul's signature spots, best enjoyed in daylight and popular with visitors.`
      : `${placeEn} is one of Seoul's signature spots. It's especially beautiful after dark and draws plenty of visitors.`,
    highlights: isDay
      ? ["An easy stroll in the sunshine", "A favorite photo spot", "Simple to fit into a day out"]
      : [
          "Take in Seoul's glittering night view at a glance",
          "A favorite photo spot",
          "Perfect for an evening stroll",
        ],
    tip: isDay
      ? "Come early in the morning — it's at its quietest."
      : "The 30 minutes right after sunset are the golden hour here.",
    best_time: isDay
      ? "A clear morning to early afternoon is best."
      : "Clear evenings from late fall to early winter (Oct–Dec) are the best.",
    crowd_tip: isDay
      ? "Weekday mornings are far quieter than weekends."
      : "Weekday evenings are far quieter than weekends.",
    right_now,
    nearby,
    ...(event_pick && { event_pick }),
    ...(viewpoints.length > 0 && { viewpoint_guide: viewpoints[0] }),
    ...(realEvents.length > 0 && { events: realEvents }),
    tags: isDay ? ["sight", "Seoul", "photo spot"] : ["night view", "Seoul", "photo spot"],
  };
}
