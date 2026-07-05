/**
 * 정적 큐레이션 코스 영문 콘텐츠 일괄 생성 스크립트 (일회성, 사람 검수 전제)
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/generate-course-en.mts
 *
 * THEME_COURSES(한글 원본)를 코스 단위로 Gemini에 넘겨 영문 번역을 생성하고
 * src/data/themeCoursesData.en.ts 에 저장한다. 장소명은 PLACE_NAME_EN 로마자
 * 표기를 강제 주입하며(번역 아님), 스탑 name(한글 원문)을 앵커로 남겨
 * route-editor 재저장으로 인한 index desync를 런타임에서 감지할 수 있게 한다.
 *
 * 에디터에서 코스/스탑을 수정하면 이 스크립트를 다시 실행해 동기화할 것.
 * (이미 생성된 코스는 기본적으로 재생성하지 않음 — `--force` 로 전체 재생성)
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { THEME_COURSES } from "../src/data/themeCourses.ts";
import { THEME_COURSES_EN, type CourseEn } from "../src/data/themeCoursesData.en.ts";
import { placeNameEn } from "../src/i18n/placeNames.ts";
import { generateGeminiJsonText, extractJsonObjectText, parseJsonWithEscapedControlChars } from "../src/lib/gemini.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = join(ROOT, "src", "data", "themeCoursesData.en.ts");
const FORCE = process.argv.includes("--force");

const SYSTEM_MSG =
  "You are a professional Korean-to-English travel content localizer for a Seoul tourism app. Respond in JSON only.";

const COURSE_EN_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    subtitle: { type: "STRING" },
    description: { type: "STRING" },
    totalDuration: { type: "STRING" },
    distance: { type: "STRING" },
    estimatedCost: { type: "STRING" },
    bestTime: { type: "STRING" },
    tags: { type: "ARRAY", items: { type: "STRING" } },
    stops: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          preview: { type: "STRING" },
          description: { type: "STRING" },
          duration: { type: "STRING" },
          tip: { type: "STRING" },
        },
        required: ["preview", "description", "duration"],
      },
    },
  },
  required: ["title", "subtitle", "description", "totalDuration", "distance", "estimatedCost", "bestTime", "tags", "stops"],
};

function buildPrompt(course: (typeof THEME_COURSES)[number]): string {
  const stopsBlock = course.stops
    .map(
      (s, i) => `${i + 1}. ${s.name} → English name (use EXACTLY this): "${placeNameEn(s.name)}"
   - preview(ko): ${s.preview}
   - description(ko): ${s.description}
   - duration(ko): ${s.duration}${s.tip ? `\n   - tip(ko): ${s.tip}` : ""}`
    )
    .join("\n");

  return `Translate this Seoul tourism course into natural English for foreign visitors. JSON only.

[Course (Korean original)]
- title: ${course.title}
- subtitle: ${course.subtitle}
- description: ${course.description}
- totalDuration: ${course.totalDuration}
- distance: ${course.distance}
- estimatedCost: ${course.estimatedCost}
- bestTime: ${course.bestTime}
- tags: ${course.tags.join(", ")}

[Stops — translate each; keep array order and length EXACTLY (${course.stops.length} stops)]
${stopsBlock}

[Rules]
- Tone: warm, friendly local-guide voice — like a Seoul native friend showing you around. No pamphlet or mechanical phrasing. Keep the original's vibe and hedged (non-definitive) expressions.
- Place names: use the given English names verbatim inside sentences (Revised Romanization, already provided). Never invent your own romanization.
- preview: a short noun phrase (not a full sentence), matching the original's role as a one-line objective preview.
- description: same sentence count and information as the Korean original (course description and each stop description), vivid but not longer than the original.
- duration: convert format (e.g. "약 1시간" → "About 1 hour", "30분" → "30 min").
- totalDuration/distance/estimatedCost/bestTime: translate units and parentheticals (e.g. "무료" → "Free", "약 2만원" → "~₩20,000", "도보 + 대중교통 병행 권장" → "walk + transit recommended"). Keep numeric values unchanged.
- tags: short English keywords (1–3 words each), same count.
- tip: translate only if the stop has one; omit otherwise.

[Output — JSON only]
{
  "title": "...", "subtitle": "...", "description": "...",
  "totalDuration": "...", "distance": "...", "estimatedCost": "...", "bestTime": "...",
  "tags": ["..."],
  "stops": [ { "preview": "...", "description": "...", "duration": "...", "tip": "..."(optional) }, ... ]
}`;
}

interface RawStopEn {
  preview: string;
  description: string;
  duration: string;
  tip?: string;
}
interface RawCourseEn {
  title: string;
  subtitle: string;
  description: string;
  totalDuration: string;
  distance: string;
  estimatedCost: string;
  bestTime: string;
  tags: string[];
  stops: RawStopEn[];
}

async function translateCourse(course: (typeof THEME_COURSES)[number]): Promise<CourseEn | null> {
  const text = await generateGeminiJsonText({
    prompt: buildPrompt(course),
    systemInstruction: SYSTEM_MSG,
    maxOutputTokens: 4000 + course.stops.length * 400,
    responseSchema: COURSE_EN_SCHEMA,
  });
  if (!text) return null;
  const jsonText = extractJsonObjectText(text);
  if (!jsonText) return null;
  const parsed = parseJsonWithEscapedControlChars<RawCourseEn>(jsonText);
  if (!parsed || !Array.isArray(parsed.stops)) return null;
  if (parsed.stops.length !== course.stops.length) {
    console.warn(`  ✗ ${course.id}: stop count mismatch (ko ${course.stops.length} vs en ${parsed.stops.length})`);
    return null;
  }
  return {
    title: parsed.title,
    subtitle: parsed.subtitle,
    description: parsed.description,
    totalDuration: parsed.totalDuration,
    distance: parsed.distance,
    estimatedCost: parsed.estimatedCost,
    bestTime: parsed.bestTime,
    tags: parsed.tags ?? [],
    stops: course.stops.map((koStop, i) => ({
      name: koStop.name, // 한글 원문 앵커
      nameEn: placeNameEn(koStop.name),
      preview: parsed.stops[i].preview,
      description: parsed.stops[i].description,
      duration: parsed.stops[i].duration,
      ...(koStop.tip && parsed.stops[i].tip ? { tip: parsed.stops[i].tip } : {}),
    })),
  };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY 필요 — node --env-file=.env.local 로 실행하세요.");
    process.exit(1);
  }

  const result: Record<string, CourseEn> = { ...THEME_COURSES_EN };
  let ok = 0;
  let failed = 0;

  for (const course of THEME_COURSES) {
    if (!FORCE && result[course.id]) {
      console.log(`- ${course.id}: 이미 존재, 건너뜀`);
      continue;
    }
    process.stdout.write(`- ${course.id} (${course.stops.length} stops) ... `);
    let en: CourseEn | null = null;
    for (let attempt = 0; attempt < 3 && !en; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      en = await translateCourse(course).catch(() => null);
    }
    if (en) {
      result[course.id] = en;
      ok++;
      console.log("OK");
    } else {
      failed++;
      console.log("FAILED (한글 fallback으로 노출됨)");
    }
    await new Promise((r) => setTimeout(r, 500)); // rate-limit 완화
  }

  const header = await readFile(OUT_FILE, "utf8").then((src) => src.split("export const THEME_COURSES_EN")[0]);
  const body = `export const THEME_COURSES_EN: Record<string, CourseEn> = ${JSON.stringify(result, null, 2)};\n`;
  await writeFile(OUT_FILE, header + body, "utf8");
  console.log(`\n완료: ${ok}개 생성, ${failed}개 실패 → ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
