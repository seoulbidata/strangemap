"use client";

/**
 * 나만의 코스 패널 — 사이드바(320px) 안에서 도는 칩 위저드.
 *
 * 다른 기능처럼 지도 옆 패널로 열린다. 한 화면 = 질문 하나(트리플식 단계별).
 * 분기·어휘는 lewisai `CourseChips`(app/features/course/schema.py)와 1:1.
 *  - audience(현지인/관광객)에 따라 이후 질문이 갈린다:
 *      local  → 시간 범위(time_window) 선택
 *      tourist→ 여행 일수(days) 선택 · 동네는 일수만큼 다중 선택
 *  - companion/purpose 는 항상 다중, location 은 tourist만 다중(max=days).
 *  - 단, 목적(purpose) 어휘는 갈래와 무관하게 동일하다 — RAG 임베딩 일관성 때문(PURPOSES 주석 참고).
 *
 * "코스 만들기" → POST /api/course(BFF) → lewisai /agent/chat → buildCourseFromAgent →
 * onCourseReady(course): 저장 + 지도에 그림 + 상세 패널 열림.
 *
 * 디자인: 앱 팔레트(warm paper/navy/blue) 유지 + Soft UI(부드러운 깊이) · SVG 아이콘 ·
 * focus-visible 키보드 포커스 · prefers-reduced-motion 존중 · 칩 스태거 등장.
 */

import { useEffect, useRef, useState } from "react";
import { SELECTABLE_ZONES } from "@/lib/seoulPlaces";
import {
  dayColor,
  isMealStop,
  placeStopCount,
  MEAL_COLOR_DEEP,
  type CourseChoice,
  type ThemeCourse,
} from "@/data/themeCourses";
import { buildCourseFromAgent } from "@/lib/aiCourseFromAgent";

interface Props {
  /** 생성 완료 → 저장 + 지도 렌더 + 상세 패널 (MapView.handleAICourseReady) */
  onCourseReady?: (course: ThemeCourse) => void;
  /** 내가 만든 코스 목록 (MapView useCourseCollection drafts) — 홈 화면에 노출 */
  myCourses?: ThemeCourse[];
  /** 홈 화면 카드 클릭 → 지도 렌더 + 상세 패널 */
  onOpenCourse?: (course: ThemeCourse) => void;
  /** 홈 화면 카드 삭제 */
  onDeleteCourse?: (id: string) => void;
  activeCourseId?: string | null;
}

// ── 서버 CourseChips 와 1:1 대응하는 값 어휘 ───────────────────────────────
type Audience = "local" | "tourist";
type Congestion = "여유" | "보통" | "상관없음";
type Pace = "packed" | "relaxed";

const COMPANIONS = ["혼자", "친구와", "연인과", "배우자와", "아이와", "부모님과"] as const;
// 목적 어휘는 audience와 무관하게 하나로 통일한다 — 현지인/관광객이 서로 다른 단어를 보내면
// 같은 의도가 다른 임베딩으로 흩어져 RAG 검색 품질이 갈리기 때문.
//
// ⚠️ lewisai `Purpose` Literal(app/features/course/schema.py PURPOSE_RULES)과 **문자 그대로 1:1**이어야 한다.
// FastAPI가 ChatRequest.chips를 pydantic으로 검증하므로 어긋난 값 하나면 422로 코스 생성 전체가 실패한다.
// (서버 PURPOSE_ALIASES가 옛 12칩 어휘를 흡수해 주지만, 그건 브라우저에 남은 예전 값을 위한 하위호환이지
//  프론트가 기대고 있을 계약이 아니다 — alias가 정리되는 순간 깨진다.)
const PURPOSES = [
  "자연·힐링", "문화·예술", "관광 명소", "체험·놀거리", "데이트", "핫플레이스", "쇼핑",
] as const;
const LOCATIONS = [...SELECTABLE_ZONES, "상관없음"] as const;

// 끼니는 "목적"이 아니라 별도 축이다 — 예전 "맛집 탐방" 목적 칩을 없애고 이 칩으로 분리했다.
// 시각은 서버가 고정한다(아침 10시 · 점심 13시 · 저녁 19시, 각 60분). 프론트가 정하지 않는다.
// 고른 끼니는 서버가 시간 창을 알아서 넓히므로(예: "오후" + "저녁" → 20시까지) 여기서 보정하지 않는다.
const MEALS = ["아침", "점심", "저녁"] as const;
const MEAL_HOUR: Record<string, string> = { 아침: "10시", 점심: "13시", 저녁: "19시" };
// lewisai MEAL_TIMES 와 같은 값 — "고른 끼니가 시간 범위 밖인지" 안내에만 쓴다(보정은 서버가 한다)
const MEAL_HOUR_NUM: Record<string, number> = { 아침: 10, 점심: 13, 저녁: 19 };

const HOURS_START = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const HOURS_END = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const hh = (h: number) => String(h).padStart(2, "0") + ":00";

// 단독 선택 칩 — 다른 항목과 함께 고르면 모순되므로 나머지를 해제한다.
const EXCLUSIVE = new Set<string>(["혼자", "상관없음"]);

// 생성 진행 단계 — lewisai 코스 그래프 노드 순서 (SSE progress 이벤트의 stage).
// lewisai app/graph/build.py 의 add_node 순서·COURSE_STEP_LABELS 와 1:1이어야 한다
// (모르는 stage 는 stageIndex()가 -1로 무시하므로 진행 표시가 멈춘 것처럼 보인다).
// progress는 각 노드 "완료" 시 발생하고, 노드가 거의 동시에 끝나면 버스트로 순서가 뒤섞여 올 수 있어
// 진행 표시는 "받은 단계의 최대 인덱스"로 단조 증가시킨다 (뒤로 안 가게).
const STAGE_ORDER = [
  "plan", "retrieve", "select_places", "fit_schedule", "meals", "enrich", "nearby", "compose",
] as const;
const stageIndex = (stage: string): number => (STAGE_ORDER as readonly string[]).indexOf(stage);

// 실제 SSE는 노드가 거의 동시에 끝나 버스트로 몰려오는 경우가 많아 설명을 읽을 새 없이 지나간다.
// 그래서 "실제 진행"(doneIdx, SSE 그대로)과 "화면에 보여줄 진행"(displayIdx)을 분리해
// 화면은 한 단계당 최소 STEP_HOLD_MS만큼 붙잡아 두고, 실제 진행이 더 늦으면 그만큼 기다린다.
// 마지막 단계(compose · "코스 완성")는 이야기를 입히는 마무리라 특히 더 길게 끈다(FINAL_HOLD_MS).
// 단계가 8개로 늘어 한 단계 홀드를 줄였다 (7×2s + 5s ≈ 19초 — 실제 생성 시간과 비슷하게).
const STEP_HOLD_MS = 1000;
const FINAL_HOLD_MS = 2000;

/** 로딩 체크리스트가 코스 조건에 맞춰 문구를 바꾸도록 넘기는 컨텍스트. */
interface StageCtx {
  days: number;
  meals: string[];
}

// 단계별 표시 정보(체크리스트 카드) — title은 완료 후에도 남는 라벨, sub는 "진행 중"일 때만 보이는 설명.
// fit_schedule 단계는 여행 일수가 1일보다 많으면 "1일차부터" 식으로 구체적으로 말해준다.
// meals 단계는 끼니를 안 골랐으면 서버도 즉시 건너뛰므로 그렇게 말해 준다.
const STAGE_INFO: Record<(typeof STAGE_ORDER)[number], { title: string; sub: (c: StageCtx) => string; icon: typeof IconStagePin }> = {
  plan: { title: "타임라인 구성", sub: (c) => (c.meals.length ? `${c.meals.join("·")} 시각을 먼저 잡고 장소 구간을 나누는 중이에요` : "머무는 시간을 구간으로 나누는 중이에요"), icon: IconStageCalendar },
  retrieve: { title: "장소 탐색", sub: () => "서울 구석구석에서 어울리는 장소를 찾고 있어요", icon: IconStagePin },
  select_places: { title: "동선 스케치", sub: () => "자연스럽게 이어지는 동선으로 장소를 고르는 중이에요", icon: IconStageRoute },
  fit_schedule: {
    title: "시간표 배치",
    sub: (c) => (c.days > 1 ? "1일차부터 차례로 동선을 배치하는 중이에요" : "구간마다 머무는 시간을 나눠 앉히는 중이에요"),
    icon: IconStageClock,
  },
  meals: {
    title: "식사 장소 추천",
    sub: (c) => (c.meals.length ? `${c.meals.join("·")} 먹을 곳을 근처에서 고르는 중이에요` : "끼니를 안 고르셔서 식사는 건너뛰어요"),
    icon: IconStageFork,
  },
  enrich: { title: "혼잡도 확인", sub: () => "방문 시각대 예상 혼잡도를 반영하고 있어요", icon: IconStageGauge },
  nearby: { title: "주변 탐색", sub: () => "근처 맛집·문화행사도 함께 찾고 있어요", icon: IconStageCompass },
  compose: { title: "코스 완성", sub: () => "선택된 코스를 설명하고 추천이유를 작성중이에요", icon: IconStageSparkle },
};

/** 서버로 보낼 칩 payload (= CourseChips). message(note)는 별도 전송. */
interface ChipPayload {
  audience: Audience;
  companions: string[];
  purposes: string[];
  locations: string[];
  /** 코스에 넣을 끼니 — 비면 식사 슬롯 없음. 시각은 서버 고정(아침 10 · 점심 13 · 저녁 19시) */
  meals: string[];
  congestion: Congestion;
  pace: Pace;
  time_window?: { start: number; end: number };
  days?: number;
}

interface Answers {
  audience?: Audience;
  start?: number;
  end?: number;
  days?: number;
  companion: string[];
  purpose: string[];
  meal: string[];
  location: string[];
  congestion?: Congestion;
  pace?: Pace;
  note: string;
}

const EMPTY: Answers = { companion: [], purpose: [], meal: [], location: [], note: "" };

// ── 스텝 정의 ───────────────────────────────────────────────────────────
/** 다중 선택 스텝의 id — Answers 의 string[] 필드와 1:1 */
type MultiId = "companion" | "purpose" | "meal" | "location";
type ChipOpt = { v: string | number; label: string; d?: string };
interface Step {
  id: keyof Answers | "window" | "confirm";
  title: string;
  sub?: string;
  chips?: ChipOpt[];
  multi?: boolean;
  big?: boolean;
  max?: () => number; // 다중 선택 최대 개수 (tourist 동네 = 여행 일수)
  /** 하나도 안 골라도 넘어갈 수 있는 단계 (끼니 — 안 고르면 식사 슬롯 없는 코스) */
  optional?: boolean;
  render?: "window" | "confirm";
}

function buildSteps(a: Answers): Step[] {
  const local = a.audience === "local";
  return [
    {
      id: "audience",
      title: "어떤 분이신가요?",
      sub: "서울에서의 하루인지, 서울로 떠나온 여행인지에 따라 코스를 다르게 준비해요.",
      big: true,
      chips: [
        { v: "local", label: "현지인", d: "서울이 일상인 당신" },
        { v: "tourist", label: "관광객", d: "서울이 여행지인 당신" },
      ],
    },
    local
      ? { id: "window", title: "몇 시부터 몇 시까지 보낼까요?", render: "window" }
      : {
          id: "days",
          title: "여행 기간은 어떻게 되나요?",
          chips: [
            { v: 1, label: "당일치기" }, { v: 2, label: "1박 2일" }, { v: 3, label: "2박 3일" },
            { v: 4, label: "3박 4일" }, { v: 5, label: "4박 5일" }, { v: 6, label: "5박 6일" },
          ],
        },
    {
      id: "companion",
      title: local ? "누구와 함께하나요?" : "누구와 떠나나요?",
      sub: "여러 명 같이 간다면 중복으로 골라도 돼요.",
      multi: true,
      chips: COMPANIONS.map((v) => ({ v, label: v })),
    },
    {
      id: "purpose",
      title: local ? "오늘의 목적은 무엇인가요?" : "이번 여행의 목적은 무엇인가요?",
      sub: "해당하는 목적을 모두 골라주세요.",
      multi: true,
      chips: PURPOSES.map((v) => ({ v, label: v })),
    },
    {
      id: "meal",
      title: "식사도 코스에 넣을까요?",
      sub: "고른 식사시간만 코스에 들어가요. 시간이 되면 근처 식당 후보를 함께 찾아드려요.",
      multi: true,
      optional: true,
      chips: MEALS.map((v) => ({ v, label: v, d: `${MEAL_HOUR[v]} · 1시간` })),
    },
    {
      id: "location",
      title: "어느 동네로 갈까요?",
      sub: local
        ? undefined
        : (a.days ?? 1) > 1
          ? `여행 일정(${a.days}일)에 맞춰 최대 ${a.days}곳까지 고를 수 있어요. ‘상관없음’을 고르면 목적에 맞춰 날마다 다른 동네로 이어드려요.`
          : "‘상관없음’을 고르면 여행 목적에 맞춰 동네를 정해드려요.",
      multi: !local,
      max: local ? undefined : () => a.days ?? 1,
      chips: LOCATIONS.map((v) => ({ v, label: v })),
    },
    {
      id: "congestion",
      title: "붐비는 정도, 얼마나 신경 쓸까요?",
      sub: "‘상관없음’을 고르면 실시간 혼잡도를 반영하지 않아요.",
      big: true,
      chips: [
        { v: "여유", label: "여유", d: "한적한 곳 위주로" },
        { v: "보통", label: "보통", d: "적당히 붐벼도 괜찮아요" },
        { v: "상관없음", label: "상관없음", d: "혼잡도는 신경 안 써요" },
      ],
    },
    {
      id: "pace",
      title: local ? "오늘 일정, 어떻게 채울까요?" : "여행 일정, 어떻게 채울까요?",
      big: true,
      chips: local
        ? [{ v: "packed", label: "알찬 일정", d: "하루 5곳" }, { v: "relaxed", label: "여유로운 일정", d: "하루 3곳" }]
        : [{ v: "packed", label: "빼곡한 여행", d: "하루 5곳" }, { v: "relaxed", label: "널널한 여행", d: "하루 3곳" }],
    },
    { id: "confirm", title: "이렇게 준비할까요?", render: "confirm" },
  ];
}

// ── 선택 요약 — 확인 단계와 저장된 코스의 아코디언이 같은 문구를 쓰도록 한 곳에서 만든다 ──
function buildSummaryRows(a: Answers): CourseChoice[] {
  const local = a.audience === "local";
  const join = (v: string[]) => (v.length ? v.join(" · ") : "—");
  const rows: CourseChoice[] = [
    { label: "여행 스타일", value: local ? "현지인" : "관광객" },
    local
      ? { label: "시간", value: `${hh(a.start!)} ~ ${hh(a.end!)}` }
      : { label: "기간", value: a.days === 1 ? "당일치기" : `${(a.days ?? 1) - 1}박 ${a.days}일` },
    { label: "함께", value: join(a.companion) },
    { label: "목적", value: join(a.purpose) },
    // 끼니는 "안 고름"도 뜻이 있는 답이라 —(정보 없음) 대신 명시적으로 적는다
    { label: "식사", value: a.meal.length ? a.meal.map((m) => `${m} ${MEAL_HOUR[m]}`).join(" · ") : "선택 안함" },
    { label: "동네", value: join(a.location) },
    { label: "혼잡도", value: a.congestion ?? "—" },
    {
      label: "일정",
      value: a.pace === "packed" ? (local ? "알찬 일정" : "빼곡한 여행") : local ? "여유로운 일정" : "널널한 여행",
    },
  ];
  if (a.note.trim()) rows.push({ label: "추가 요청", value: a.note.trim() });
  return rows;
}

// ── payload 조립 ─────────────────────────────────────────────────────────
function buildChipPayload(a: Answers): ChipPayload {
  const p: ChipPayload = {
    audience: a.audience!,
    companions: a.companion,
    purposes: a.purpose,
    locations: a.location,
    meals: a.meal,
    congestion: a.congestion ?? "상관없음",
    pace: a.pace ?? "relaxed",
  };
  if (a.audience === "local") p.time_window = { start: a.start!, end: a.end! };
  else p.days = a.days ?? 1;
  return p;
}

type Phase = "home" | "wizard" | "loading" | "done" | "error";

export default function MyCoursePanel({ onCourseReady, myCourses, onOpenCourse, onDeleteCourse, activeCourseId }: Props) {
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("home");
  // 화면에 보여줄 진행 인덱스 — 실제 SSE 진행(doneIdxRef)을 최소 STEP_HOLD_MS 간격으로 "따라잡는다" (아래 pacing effect).
  // 실제 SSE 진행 자체는 렌더링에 쓰이지 않고 pacing effect의 setInterval 안에서만 읽으면 되므로 ref로만 들고 있는다.
  const [displayIdx, setDisplayIdx] = useState<number>(-1);
  const doneIdxRef = useRef(-1);
  const finalCourseRef = useRef<ThemeCourse | null>(null);
  // 완료 화면에서 "어떻게 만들었는지"(aiTrace)를 그대로 보여주기 위한 결과 코스
  const [doneCourse, setDoneCourse] = useState<ThemeCourse | null>(null);

  const steps = buildSteps(answers);
  const step = steps[idx];
  const progress = ((idx + 1) / steps.length) * 100;

  const go = (i: number) => setIdx(Math.max(0, Math.min(steps.length - 1, i)));
  const patch = (p: Partial<Answers>) => setAnswers((a) => ({ ...a, ...p }));
  const restart = () => { setAnswers(EMPTY); setIdx(0); setPhase("wizard"); };
  const goHome = () => { setAnswers(EMPTY); setIdx(0); setPhase("home"); };

  const pickSingle = (id: Step["id"], v: string | number) => {
    setAnswers((a) => {
      const next: Answers = { ...a };
      // location(현지인)은 단일 선택이지만 저장은 배열로 통일 (관광객 다중과 같은 형태 → payload·요약 안전)
      if (id === "location") next.location = [v as string];
      else (next as unknown as Record<string, unknown>)[id] = v;
      if (id === "audience") {
        // 갈래가 바뀌면 어휘·제약이 달라지는 답만 초기화한다.
        // purpose는 두 갈래가 같은 어휘를 쓰므로 그대로 유지 (다시 고르게 하지 않는다).
        next.start = undefined; next.end = undefined; next.days = undefined;
        next.location = []; next.pace = undefined;
      }
      return next;
    });
    setTimeout(() => setIdx((i) => Math.min(steps.length - 1, i + 1)), 200);
  };

  const toggleMulti = (id: MultiId, v: string, max?: number) => {
    setAnswers((a) => {
      const cur = a[id] as string[];
      let nextSel: string[];
      if (cur.includes(v)) nextSel = cur.filter((x) => x !== v);
      else if (EXCLUSIVE.has(v)) nextSel = [v]; // 단독 칩 — 나머지 해제
      else {
        const rest = cur.filter((x) => !EXCLUSIVE.has(x)); // 다른 걸 고르면 단독 칩 해제
        if (max != null && rest.length >= max) return a; // 최대 도달 — 무시
        nextSel = [...rest, v];
      }
      return { ...a, [id]: nextSel };
    });
  };

  // ── 생성: BFF SSE 스트림(progress/final/error) → 실시간 단계 표시 → ThemeCourse → 지도 렌더 ──
  const createCourse = async () => {
    doneIdxRef.current = -1;
    finalCourseRef.current = null;
    setDisplayIdx(-1);
    setPhase("loading");
    try {
      const res = await fetch("/api/course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: answers.note || "", chips: buildChipPayload(answers) }),
      });
      if (!res.ok || !res.body) throw new Error("server");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? ""; // 마지막 조각은 미완성일 수 있어 버퍼에 남긴다
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.event === "progress") {
            // 버스트로 뒤섞여 와도 뒤로 안 가게 최대 인덱스로만 전진
            const i = stageIndex(evt.stage);
            if (i >= 0) doneIdxRef.current = Math.max(doneIdxRef.current, i);
          } else if (evt.event === "final") {
            const built = buildCourseFromAgent(evt.payload);
            if (!built) throw new Error("empty");
            // 만든 조건을 코스에 함께 담아 저장 → 목록 아코디언에서 "어떻게 만들었는지" 다시 보여준다
            const course: ThemeCourse = {
              ...built,
              createdAt: Date.now(),
              myChoices: buildSummaryRows(answers),
            };
            // 여기서 바로 done으로 넘기지 않는다 — 화면은 아직 앞 단계를 보여주는 중일 수 있어
            // pacing effect가 마지막 단계(코스 완성)를 충분히 보여준 뒤 알아서 done으로 넘긴다.
            doneIdxRef.current = STAGE_ORDER.length - 1;
            finalCourseRef.current = course;
            done = true;
            break;
          } else if (evt.event === "error") {
            throw new Error(evt.message || "error");
          }
        }
      }
      if (!done) throw new Error("no-final"); // 스트림이 final 없이 끝남
    } catch {
      setPhase("error");
    }
  };

  // ── 화면 진행 페이싱 — 실제 SSE(doneIdx)와 별개로, 화면(displayIdx)은 단계당 최소
  // STEP_HOLD_MS는 붙잡아 둔다. 마지막 직전(schedule)까지만 이렇게 넘기고, 마지막 단계
  // (compose · "코스 완성")는 FINAL_HOLD_MS + final 응답 도착을 모두 기다린 뒤에야 done으로 넘긴다.
  useEffect(() => {
    if (phase !== "loading") return;
    const penultimate = STAGE_ORDER.length - 2; // 이 인덱스까지 도달하면 다음(마지막)이 활성화됨
    let cur = displayIdx;
    let enteredAt = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - enteredAt;
      if (cur >= penultimate) {
        if (elapsed >= FINAL_HOLD_MS && finalCourseRef.current) {
          clearInterval(id);
          onCourseReady?.(finalCourseRef.current);
          setDoneCourse(finalCourseRef.current);
          setPhase("done");
        }
        return;
      }
      if (elapsed >= STEP_HOLD_MS && doneIdxRef.current > cur) {
        cur += 1;
        enteredAt = Date.now();
        setDisplayIdx(cur);
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cur/enteredAt는 이 loading 구간 동안만 쓰는 로컬 상태
  }, [phase]);

  return (
    <div className="flex flex-col h-full bg-[#FBFAF7]">
      {/* 상단 — 뒤로 + 진행바 (홈 화면에서는 숨김) */}
      {phase !== "home" && (
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <button
            aria-label={phase === "wizard" && idx > 0 ? "이전 질문" : "내가 만든 코스로"}
            onClick={() => (phase === "wizard" && idx > 0 ? go(idx - 1) : goHome())}
            disabled={phase === "loading"}
            className="w-9 h-9 rounded-full border border-[#ECE8E0] bg-white text-[#16243C] flex items-center justify-center shrink-0 cursor-pointer transition-colors duration-200 hover:border-[#16243C] hover:bg-[#FBFAF7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/50 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-white"
          >
            <IconBack />
          </button>
          <div className="flex-1 h-1.5 rounded-full bg-[#EDE9E1] overflow-hidden">
            <div
              className="h-full bg-[#16243C] rounded-full transition-[width] duration-300 ease-out"
              style={{ width: phase === "wizard" ? `${progress}%` : "100%" }}
            />
          </div>
          <span className="text-[11px] font-semibold text-[#8B8678] tabular-nums shrink-0 min-w-[42px] text-right">
            {phase === "wizard" ? `${idx + 1} / ${steps.length}` : phase === "loading" ? "생성 중" : "완료"}
          </span>
        </div>
      )}

      {/* 본문 (스크롤) */}
      <div className="flex-1 overflow-y-auto thin-scroll px-4 py-5">
        {phase === "home" ? (
          <HomeScreen
            courses={myCourses ?? []}
            activeCourseId={activeCourseId ?? null}
            onCreate={restart}
            onOpen={onOpenCourse}
            onDelete={onDeleteCourse}
          />
        ) : phase === "loading" ? (
          <LoadingScreen
            ctx={{ days: answers.audience === "tourist" ? answers.days ?? 1 : 1, meals: answers.meal }}
            displayIdx={displayIdx}
          />
        ) : phase === "done" ? (
          <DoneScreen course={doneCourse} onRestart={restart} onGoHome={goHome} />
        ) : phase === "error" ? (
          <ErrorScreen onRetry={createCourse} onBack={() => setPhase("wizard")} />
        ) : (
          <div key={idx} className="mcp-rise">
            <p className="text-[10px] font-bold tracking-[0.14em] text-[#2563EB] uppercase mb-2">나만의 코스</p>
            <h1 className="text-[19px] leading-[1.3] tracking-[-0.01em] font-extrabold text-[#16243C]">{step.title}</h1>
            {step.sub && <p className="mt-1.5 text-[12.5px] text-[#8B8678] leading-relaxed">{step.sub}</p>}

            {step.render === "window" ? (
              <WindowStep answers={answers} patch={patch} onNext={() => go(idx + 1)} />
            ) : step.render === "confirm" ? (
              <ConfirmStep answers={answers} onCreate={createCourse} setNote={(note) => patch({ note })} />
            ) : step.multi ? (
              <MultiStep step={step} answers={answers} onToggle={toggleMulti} onNext={() => go(idx + 1)} />
            ) : (
              <ChipGrid
                chips={step.chips!}
                big={step.big}
                selected={(v) => {
                  const cur = answers[step.id as keyof Answers];
                  return Array.isArray(cur) ? cur.includes(v as string) : cur === v;
                }}
                onPick={(v) => pickSingle(step.id, v)}
              />
            )}
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes mcpRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes mcpChip { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes mcpFade { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
        @keyframes mcpPop { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: scale(1); } }
        @keyframes mcpBreathe { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.03); opacity: 0.85; } }
        @keyframes mcpDot { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
        .mcp-rise { animation: mcpRise 0.3s cubic-bezier(0.3, 0.7, 0.3, 1) both; }
        .mcp-chip { animation: mcpChip 0.32s cubic-bezier(0.3, 0.7, 0.3, 1) both; }
        .mcp-fade { animation: mcpFade 0.4s ease both; }
        .mcp-pop { animation: mcpPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        .mcp-breathe { animation: mcpBreathe 1.8s ease-in-out infinite; }
        .mcp-dot { animation: mcpDot 1.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .mcp-rise, .mcp-chip, .mcp-fade, .mcp-pop, .mcp-breathe, .mcp-dot { animation: none !important; }
          .mcp-dot { opacity: 1 !important; }
        }
      `}</style>
    </div>
  );
}

// ── 공통 칩 스타일 — 연베이지 배경 위 화이트 칩 + 보더 (관광코스 필터와 동일 톤) ──
function chipClass(on: boolean, extra = "") {
  return [
    "cursor-pointer font-semibold transition-all duration-200 ease-out border",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/50 focus-visible:ring-offset-1",
    on
      ? "bg-[#16243C] border-[#16243C] text-white shadow-[0_4px_14px_rgba(22,36,60,0.22)]"
      : "bg-white border-[#ECE8E0] text-[#5C5950] hover:border-[#D6D1C7] hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)]",
    extra,
  ].join(" ");
}

// ── 칩 그리드 (단일 선택) — big 칩은 320px에서 세로 전체폭 ────────────────────
function ChipGrid({
  chips, big, selected, onPick,
}: {
  chips: ChipOpt[];
  big?: boolean;
  selected: (v: string | number) => boolean;
  onPick: (v: string | number) => void;
}) {
  return (
    <div className={big ? "flex flex-col gap-2.5 mt-5" : "flex flex-wrap gap-2 mt-5"}>
      {chips.map((c, i) => {
        const on = selected(c.v);
        return (
          <button
            key={String(c.v)}
            type="button"
            onClick={() => onPick(c.v)}
            style={{ animationDelay: `${i * 28}ms` }}
            className={chipClass(on, `mcp-chip text-left ${big ? "w-full px-4 py-3.5 rounded-2xl" : "px-4 py-3 rounded-full text-[13px] min-h-[44px] flex items-center"}`)}
          >
            <span className="block">
              {c.label}
              {c.d && <span className={`block text-[11px] font-medium mt-0.5 ${on ? "text-white/70" : "text-[#9CA3AF]"}`}>{c.d}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── 다중 선택 스텝 ───────────────────────────────────────────────────────
function MultiStep({
  step, answers, onToggle, onNext,
}: {
  step: Step;
  answers: Answers;
  onToggle: (id: MultiId, v: string, max?: number) => void;
  onNext: () => void;
}) {
  const id = step.id as MultiId;
  const sel = answers[id];
  const max = step.max?.();
  return (
    <>
      <div className="flex flex-wrap gap-2 mt-5">
        {step.chips!.map((c, i) => {
          const v = c.v as string;
          const on = sel.includes(v);
          const capped = !on && max != null && sel.filter((x) => !EXCLUSIVE.has(x)).length >= max;
          return (
            <button
              key={v}
              type="button"
              disabled={capped}
              onClick={() => onToggle(id, v, max)}
              style={{ animationDelay: `${i * 28}ms` }}
              className={chipClass(
                on,
                `mcp-chip px-4 py-3 rounded-full text-[13px] min-h-[44px] inline-flex items-center gap-1.5 ${capped ? "opacity-35 cursor-default hover:border-[#ECE8E0] hover:shadow-none" : ""}`,
              )}
            >
              {c.label}
              {/* 끼니처럼 값에 붙는 조건(고정 시각)을 칩 안에서 바로 읽히게 한다 */}
              {c.d && (
                <span className={`text-[11px] font-medium ${on ? "text-white/65" : "text-[#B5B0A6]"}`}>{c.d}</span>
              )}
            </button>
          );
        })}
      </div>
      {/* 끼니는 안 골라도 되는 단계 — 버튼 문구로 "안 넣어도 된다"는 걸 알린다 */}
      <NextButton
        disabled={!step.optional && sel.length < 1}
        onClick={onNext}
        label={step.optional && sel.length === 0 ? "식사 없이 진행" : undefined}
      />
    </>
  );
}

// ── 시간 범위 스텝 (local) ────────────────────────────────────────────────
function WindowStep({
  answers, patch, onNext,
}: {
  answers: Answers;
  patch: (p: Partial<Answers>) => void;
  onNext: () => void;
}) {
  const { start, end } = answers;
  const setHour = (key: "start" | "end", h: number) => {
    const next: Partial<Answers> = { [key]: h };
    const s = key === "start" ? h : start;
    const e = key === "end" ? h : end;
    if (s != null && e != null && e <= s) next[key === "start" ? "end" : "start"] = undefined;
    patch(next);
  };
  const row = (label: string, hours: number[], key: "start" | "end") => (
    <div className="mt-5">
      <div className="text-[12px] font-bold text-[#8B8678] mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {hours.map((h) => {
          const on = answers[key] === h;
          const dis = key === "end" ? start != null && h <= start : end != null && h >= end;
          return (
            <button
              key={h}
              type="button"
              disabled={dis}
              onClick={() => setHour(key, h)}
              className={chipClass(
                on,
                `px-3.5 py-2.5 rounded-xl text-[12.5px] min-h-[40px] tabular-nums ${dis ? "opacity-30 cursor-default hover:border-[#ECE8E0] hover:shadow-none" : ""}`,
              )}
            >
              {hh(h)}
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <>
      {row("시작", HOURS_START, "start")}
      {row("종료", HOURS_END, "end")}
      <NextButton disabled={!(start != null && end != null)} onClick={onNext} />
    </>
  );
}

// ── 확인 스텝 ────────────────────────────────────────────────────────────
function ConfirmStep({
  answers, onCreate, setNote,
}: {
  answers: Answers;
  onCreate: () => void;
  setNote: (v: string) => void;
}) {
  // 추가 요청은 아래 textarea에서 직접 입력받으므로 요약에서는 뺀다
  const rows = buildSummaryRows(answers).filter((r) => r.label !== "추가 요청");
  // 고른 끼니가 시간 범위 밖이면 서버가 창을 알아서 넓힌다 (프론트는 보정하지 않고 알려만 준다).
  // 예: "오후 12~18시" + "저녁"(19시) → 서버가 20시까지 열어 저녁 자리를 만든다.
  const widened =
    answers.audience === "local" && answers.start != null && answers.end != null
      ? answers.meal.filter((m) => {
          const h = MEAL_HOUR_NUM[m];
          return h < answers.start! || h + 1 > answers.end!;
        })
      : [];

  return (
    <>
      <div className="mt-5 bg-white rounded-2xl px-4 py-1 border border-[#ECE8E0] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {rows.map(({ label, value }, i) => (
          <div key={label} className={`flex justify-between gap-3 py-2.5 text-[12.5px] ${i < rows.length - 1 ? "border-b border-[#F0EDE6]" : ""}`}>
            <span className="text-[#8B8678] shrink-0">{label}</span>
            <span className="font-semibold text-right text-[#16243C]">{value}</span>
          </div>
        ))}
      </div>

      {widened.length > 0 && (
        <p
          className="mt-2.5 text-[11.5px] leading-relaxed rounded-xl px-3 py-2.5"
          style={{ background: "#FEF6E7", color: MEAL_COLOR_DEEP }}
        >
          {widened.map((m) => `${m}(${MEAL_HOUR[m]})`).join(" · ")}은(는) 고른 시간 범위 밖이에요.
          식사장소를 넣을 수 있게 시간표를 확장해서 코스를 짜드릴게요.
        </p>
      )}

      <label htmlFor="mcp-note" className="block mt-5 mb-1.5 text-[12px] font-bold text-[#8B8678]">
        추가 요청 <span className="font-medium text-[#B5B0A6]">(선택)</span>
      </label>
      <textarea
        id="mcp-note"
        value={answers.note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="예: 야경 보면서 마무리하고 싶어요"
        className="w-full min-h-[70px] resize-y rounded-xl border border-[#ECE8E0] px-3 py-2.5 text-[12.5px] bg-white outline-none transition-colors duration-200 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 placeholder:text-[#B5B0A6]"
      />
      <button type="button" onClick={onCreate} className={`mt-4 ${BTN_PRIMARY}`}>
        코스 만들기
      </button>
    </>
  );
}

// ── 생성 중 — 화면 페이싱이 적용된 진행 단계를 체크리스트로 보여준다 ──
// displayIdx = 화면에 "완료"로 보여줄 단계의 최대 인덱스 (MyCoursePanel의 pacing effect가 관리).
// 마지막 단계(compose · "코스 완성")는 항상 여기서 오래 머무른 뒤 바로 완료 화면으로 넘어간다.
function LoadingScreen({ ctx, displayIdx }: { ctx: StageCtx; displayIdx: number }) {
  const { days } = ctx;
  const runningIdx = displayIdx + 1; // 지금 진행 중 (시작 전 displayIdx=-1 → 0 = 첫 단계)
  const etaSec = days > 1 ? Math.min(100, 35 + days * 10) : 30;
  const linePct = Math.min(100, (runningIdx / STAGE_ORDER.length) * 100);

  return (
    <div className="mcp-rise pt-2">
      <p className="text-[10px] font-bold tracking-[0.14em] text-[#2563EB] uppercase mb-2">AI 코스 생성</p>
      <h1 className="flex items-baseline flex-wrap text-[19px] leading-[1.3] tracking-[-0.01em] font-extrabold text-[#16243C]">
        <span>나만의 코스를 만들고 있어요</span>
        <span className="inline-flex gap-[3px] ml-1.5" aria-hidden>
          <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mcp-dot motion-reduce:opacity-100" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mcp-dot motion-reduce:opacity-100" style={{ animationDelay: "160ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mcp-dot motion-reduce:opacity-100" style={{ animationDelay: "320ms" }} />
        </span>
      </h1>
      <p className="mt-1.5 text-[12.5px] text-[#8B8678] leading-relaxed">
        {days > 1
          ? `${days}일 여행이라 조금 더 걸려요 · 최대 약 ${etaSec}초`
          : `실제 서울 데이터를 확인하며 만들고 있어요 · 최대 약 ${etaSec}초`}
      </p>

      {/* 단계 체크리스트 — 완료 단계는 체크로 채워지고, 지금 단계만 설명이 붙는다 */}
      <div className="relative mt-6">
        <div className="absolute left-[15px] top-2 bottom-2 w-[2px] bg-[#EDE9E1]" aria-hidden />
        <div
          className="absolute left-[15px] top-2 w-[2px] bg-[#16243C] transition-[height] duration-500 ease-out"
          style={{ height: `${linePct}%` }}
          aria-hidden
        />
        <div className="relative z-10 space-y-0.5">
          {STAGE_ORDER.map((key, i) => {
            const info = STAGE_INFO[key];
            const state: "done" | "active" | "pending" = i <= displayIdx ? "done" : i === runningIdx ? "active" : "pending";
            return <StageRow key={key} index={i} state={state} icon={info.icon} title={info.title} sub={info.sub(ctx)} />;
          })}
        </div>
      </div>

      {/* 결과 자리 스켈레톤 (CLS 방지 + 진행감) */}
      <p className="mt-6 text-[11px] font-bold text-[#B5B0A6] uppercase tracking-wide">잠시 후 이렇게 보여드릴게요</p>
      <div className="mt-3 space-y-3" aria-hidden>
        {Array.from({ length: days > 1 ? 3 : 2 }, (_, k) => (
          <div key={k} className="flex gap-3 items-start">
            <div className="w-7 h-7 rounded-full bg-[#EDE9E1] animate-pulse motion-reduce:animate-none shrink-0" />
            <div className="flex-1 space-y-2 pt-0.5">
              <div className="h-3.5 rounded bg-[#EDE9E1] animate-pulse motion-reduce:animate-none" style={{ width: `${70 - k * 10}%` }} />
              <div className="h-3 rounded bg-[#F1EEE7] animate-pulse motion-reduce:animate-none" style={{ width: `${90 - k * 6}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 체크리스트 한 줄 — done(파랑 체크) · active(연한 파랑 + 레이더 링 + 설명) · pending(옅게) ──
// index는 처음 로딩 화면이 뜰 때 위에서부터 순서대로 스며들듯 등장하게 하는 스태거 딜레이용.
function StageRow({
  index, state, icon: Icon, title, sub,
}: {
  index: number;
  state: "done" | "active" | "pending";
  icon: typeof IconStagePin;
  title: string;
  sub: string;
}) {
  return (
    <div
      style={{ animationDelay: `${index * 45}ms` }}
      className={`mcp-chip flex items-start gap-3 py-2.5 -mx-3 px-3 rounded-2xl transition-all duration-300 ${
        state === "pending" ? "opacity-45" : "opacity-100"
      } ${state === "active" ? "bg-white mcp-breathe" : ""}`}
    >
      <div className="relative w-8 h-8 shrink-0">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
            state === "done"
              ? "bg-[#16243C] text-white"
              : state === "active"
                ? "bg-[#E9EDF4] text-[#16243C]"
                : "bg-[#F5F2EC] text-[#C7C2B6]"
          }`}
        >
          {state === "done" ? <IconCheck className="w-4 h-4 mcp-pop" /> : <Icon className="w-4 h-4" />}
        </div>
      </div>
      <div className="min-w-0 pt-1.5">
        <p
          className={`text-[13.5px] font-bold transition-colors duration-300 ${
            state === "pending" ? "text-[#B5B0A6]" : "text-[#16243C]"
          }`}
        >
          {title}
        </p>
        {state === "active" && (
          <p key={title} className="mcp-fade text-[12px] text-[#8B8678] mt-0.5 leading-snug" aria-live="polite">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ── 홈 — 내가 만든 코스 보관함 (탭 진입 화면) ─────────────────────────────
//
// 구조는 SEED Design(당근) 규칙을 서울로 팔레트로 옮긴 것:
//  · 목록 한 칸 = List.Item 해부구조 — Prefix(썸네일) / Content(제목·메타·조건칩) / Suffix(chevron).
//    카드를 누르면 "기본 동작"(지도에서 보기)이 바로 일어나고, 보조 동작은 아래 액션바로 내린다.
//  · 화면당 solid CTA 하나 — 보관함이 비었을 때만 네이비 solid를 쓰고, 코스가 있으면
//    "새 코스 만들기"는 네이비 연한 틴트 엔트리 카드로 낮춘다. 네이비 solid는 위저드에서
//    "다음/만들기"(진행)라는 뜻으로 이미 쓰고 있어서 의미가 겹치지 않게 한다.
//  · 삭제는 되돌릴 수 없으므로 criticalSolid + 확인 단계(인라인 confirm)를 거친다.
//  · 카드 표면(흰 배경·라운드·소프트 섀도)·태그 칩은 관광코스 피드(CourseCollection)와 같은 값을
//    써서 두 탭이 한 앱처럼 보이게 맞췄다.
function HomeScreen({
  courses, activeCourseId, onCreate, onOpen, onDelete,
}: {
  courses: ThemeCourse[];
  activeCourseId: string | null;
  onCreate: () => void;
  onOpen?: (course: ThemeCourse) => void;
  onDelete?: (id: string) => void;
}) {
  // 펼쳐진 코스 id — 한 번에 하나만 펼친다
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 삭제 확인 중인 코스 id — 확인 전에는 지우지 않는다
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const empty = courses.length === 0;

  return (
    <div className="mcp-rise">
      {/* ① 기능 소개 — 이 탭이 무엇을 해주는지. 바로 아래가 생성 진입점 */}
      <p className="text-[10px] font-bold tracking-[0.14em] text-[#2563EB] uppercase mb-2">AI 코스 추천</p>
      <h1 className="text-[20px] leading-[1.3] tracking-[-0.01em] font-bold text-[#16243C]">나만의 코스</h1>
      <p className="mt-1.5 text-[12.5px] text-[#8B8678] leading-relaxed">
        누구와 어디로 갈지 몇 가지만 고르면, 실시간 혼잡도까지 반영해 나에게 맞는 코스를 짜드려요.
      </p>

      <CreateEntryCard onClick={onCreate} emphasis={empty} />

      {/* ② 보관함 — 만들어둔 코스 목록 */}
      <div className="mt-7 flex items-baseline gap-1.5">
        <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#16243C]">내가 만든 코스</h2>
        {!empty && <span className="text-[12px] font-bold text-[#B5B0A6] tabular-nums">{courses.length}</span>}
      </div>
      <p className="mt-1 text-[12px] text-[#8B8678] leading-relaxed">
        {empty ? "만든 코스는 여기에 보관돼요." : "지도에서 다시 보고 싶은 코스를 눌러보세요."}
      </p>

      {empty ? (
        <EmptyStorage />
      ) : (
        <>
          <div className="mt-3 space-y-2.5">
            {courses.map((course, i) => (
              <MyCourseCard
                key={course.id}
                course={course}
                index={i}
                isActive={activeCourseId === course.id}
                expanded={expandedId === course.id}
                confirming={confirmId === course.id}
                onToggle={() => {
                  setConfirmId(null);
                  setExpandedId(expandedId === course.id ? null : course.id);
                }}
                onOpen={onOpen ? () => onOpen(course) : undefined}
                onAskDelete={onDelete ? () => setConfirmId(course.id) : undefined}
                onCancelDelete={() => setConfirmId(null)}
                onConfirmDelete={
                  onDelete
                    ? () => {
                        setConfirmId(null);
                        onDelete(course.id);
                      }
                    : undefined
                }
              />
            ))}
          </div>

          <p className="mt-4 text-center text-[11px] text-[#C4BDB4]">최근에 만든 20개까지 보관돼요</p>
        </>
      )}
    </div>
  );
}

// ── 빈 보관함 — 아이콘 + 한 줄 안내 (CTA는 위 CreateEntryCard 하나로 모은다) ──
function EmptyStorage() {
  return (
    <div className="mt-3 rounded-2xl border border-dashed border-[#E3DED4] bg-white/60 px-5 py-8 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#EFF4FF] text-[#2563EB] flex items-center justify-center">
        <IconStageSparkle className="w-7 h-7" />
      </div>
      <p className="mt-3.5 text-[13.5px] font-bold text-[#16243C]">아직 보관한 코스가 없어요</p>
      <p className="mt-1.5 text-[12px] text-[#8B8678] leading-relaxed">
        누구와, 어디로, 얼마나 붐비지 않게.
        <br />
        몇 가지만 고르면 코스를 짜드려요.
      </p>
    </div>
  );
}

// ── 새 코스 만들기 엔트리 (네이비 연한 틴트) — 이 화면의 유일한 생성 진입점.
// 보관함이 비었을 때(emphasis)는 유도할 다른 동작이 없으므로 링·그림자를 올려 더 눈에 띄게 한다.
function CreateEntryCard({ onClick, emphasis }: { onClick: () => void; emphasis?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-5 w-full flex items-center gap-3 rounded-2xl border bg-[#F1F3F7] px-3.5 py-3 text-left cursor-pointer transition-all duration-200 hover:bg-[#E7EAF1] hover:border-[#C3CBDA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16243C]/30 ${
        emphasis ? "border-[#C3CBDA] shadow-[0_4px_16px_rgba(22,36,60,0.12)]" : "border-[#DBE0E9]"
      }`}
    >
      <span className="w-9 h-9 shrink-0 rounded-xl bg-white text-[#16243C] flex items-center justify-center shadow-[0_2px_6px_rgba(22,36,60,0.12)]">
        <IconStageSparkle className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-bold text-[#16243C]">새 코스 만들기</span>
        <span className="block mt-0.5 text-[11.5px] text-[#6C7688] leading-snug">
          오늘의 서울 데이터로 코스를 짜드려요
        </span>
      </span>
      <span className="shrink-0 text-[#8D96A8]" aria-hidden>
        <IconChevronRight />
      </span>
    </button>
  );
}

/** "오늘 · 어제 · 3일 전 · 7월 26일" — 만든 시점. createdAt 이 없는 예전 코스는 빈 문자열. */
function formatCreated(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dayStart(new Date()) - dayStart(d)) / 86_400_000);
  if (diff <= 0) return "오늘";
  if (diff === 1) return "어제";
  if (diff < 7) return `${diff}일 전`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 카드에 붙일 조건 칩 — 위저드에서 고른 값 중 "어떤 코스였는지"가 한눈에 드러나는 것만 뽑는다.
 * 동네 → 목적 → 함께 순으로, "상관없음"처럼 정보가 없는 값은 뺀다.
 * 조건 기록이 없는 예전 코스는 코스 태그로 대신한다.
 */
function conditionChips(course: ThemeCourse): { shown: string[]; extra: number } {
  const by = new Map((course.myChoices ?? []).map((c) => [c.label, c.value]));
  const picked: string[] = [];
  for (const key of ["동네", "목적", "함께"]) {
    const raw = by.get(key);
    if (!raw || raw === "—" || raw === "안 넣기") continue;
    // 여러 값은 buildSummaryRows 에서 " · "(공백 포함)로 이어붙인다. 값 자체에 붙은 가운뎃점
    // ("문화·예술" · "자연·힐링")과 섞이지 않게 공백까지 포함해 나눈다.
    for (const part of raw.split(" · ").map((s) => s.trim())) {
      if (part && part !== "상관없음" && !picked.includes(part)) picked.push(part);
    }
  }
  const list = picked.length ? picked : course.tags.slice(0, 3);
  return { shown: list.slice(0, 3), extra: Math.max(0, list.length - 3) };
}

// ── 보관함 카드 한 장 ─────────────────────────────────────────────────────
// 카드 본문 클릭 = 지도에서 보기(기본 동작), 아래 액션바 = 만든 조건 펼침 / 삭제(확인 후).
function MyCourseCard({
  course, index, isActive, expanded, confirming, onToggle, onOpen, onAskDelete, onCancelDelete, onConfirmDelete,
}: {
  course: ThemeCourse;
  index: number;
  isActive: boolean;
  expanded: boolean;
  confirming: boolean;
  onToggle: () => void;
  onOpen?: () => void;
  onAskDelete?: () => void;
  onCancelDelete: () => void;
  onConfirmDelete?: () => void;
}) {
  const created = formatCreated(course.createdAt);
  const choices = course.myChoices ?? [];
  const { shown, extra } = conditionChips(course);
  const mealCount = course.stops.filter(isMealStop).length;

  return (
    <div
      style={{ animationDelay: `${index * 40}ms` }}
      className={`mcp-chip rounded-[18px] bg-white overflow-hidden transition-shadow duration-200 ${
        isActive
          ? "shadow-[0_0_0_2px_#16243C,0_8px_24px_rgba(22,36,60,0.14)]"
          : "shadow-[0_2px_10px_rgba(20,30,50,0.06)] hover:shadow-[0_8px_24px_rgba(20,30,50,0.12)]"
      }`}
    >
      {/* 본문 — 누르면 지도에 그린다 */}
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={`${course.title} 지도에서 보기`}
        className="w-full flex items-start gap-3 p-3 text-left cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16243C]/30 focus-visible:ring-inset disabled:cursor-default"
      >
        <RouteThumb course={course} />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[10.5px] text-[#A8A398]">
            {created && <span>{created}</span>}
            {isActive && (
              <>
                {created && <span className="text-[#E0DBD1]">·</span>}
                <span className="flex items-center gap-1 font-bold text-[#16243C]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                  지도에 표시중
                </span>
              </>
            )}
          </span>

          <span className="block mt-1 text-[13.5px] font-bold text-[#16243C] leading-snug line-clamp-2 transition-colors group-hover:text-[#3A4A66]">
            {course.title}
          </span>

          {/* 식사 슬롯은 "곳" 수에 넣지 않고 따로 센다 — 장소 4곳인 코스가 6곳으로 보이면 안 된다 */}
          <span className="block mt-1 text-[11px] text-[#8B8678] tabular-nums">
            {placeStopCount(course)}곳
            {mealCount > 0 && (
              <>
                <span className="mx-1 text-[#E0DBD1]">·</span>
                <span style={{ color: MEAL_COLOR_DEEP }}>식사 {mealCount}</span>
              </>
            )}
            <span className="mx-1 text-[#E0DBD1]">·</span>
            {course.totalDuration}
            <span className="mx-1 text-[#E0DBD1]">·</span>
            {course.distance}
          </span>
        </span>

        <span className="shrink-0 mt-0.5 text-[#C4BDB4] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
          <IconChevronRight />
        </span>
      </button>

      {/* 조건 칩 — 관광코스 카드의 태그 칩과 같은 톤 */}
      {shown.length > 0 && (
        <div className="px-3 pb-2.5 -mt-0.5 flex flex-wrap gap-1.5">
          {shown.map((c) => (
            <span key={c} className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-[#F4F2EC] text-[#8B8678]">
              {c}
            </span>
          ))}
          {extra > 0 && (
            <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-[#F4F2EC] text-[#B5B0A6]">
              +{extra}
            </span>
          )}
        </div>
      )}

      {/* 액션바 — 보조 동작. 삭제는 확인을 한 번 거친다 */}
      <div className="border-t border-[#F2EFE8]">
        {confirming ? (
          <div className="mcp-fade flex items-center gap-2 px-3 py-2">
            <p className="min-w-0 flex-1 text-[11px] text-[#8B8678] leading-snug">삭제하면 되돌릴 수 없어요</p>
            <button
              type="button"
              onClick={onCancelDelete}
              className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold text-[#5C5950] cursor-pointer transition-colors hover:bg-[#F4F2EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16243C]/30"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              className="shrink-0 px-2.5 py-1.5 rounded-lg bg-[#DC2626] text-white text-[11.5px] font-bold cursor-pointer transition-colors hover:bg-[#B91C1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]/40"
            >
              삭제
            </button>
          </div>
        ) : (
          <div className="flex items-center">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 text-[11.5px] font-bold text-[#8B8678] cursor-pointer transition-colors hover:bg-[#FBFAF7] hover:text-[#16243C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16243C]/25 focus-visible:ring-inset"
            >
              만든 조건
              <span className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} aria-hidden>
                <IconChevron />
              </span>
            </button>
            {onAskDelete && (
              <>
                <span className="w-px h-4 bg-[#F2EFE8]" aria-hidden />
                <button
                  type="button"
                  onClick={onAskDelete}
                  aria-label="코스 삭제"
                  className="w-11 shrink-0 py-2.5 flex items-center justify-center text-[#C4BDB4] cursor-pointer transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]/40 focus-visible:ring-inset"
                >
                  <IconTrash />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 펼침 — 위저드에서 고른 조건 전체 */}
      {expanded && !confirming && (
        <div className="mcp-fade px-3 pb-3">
          {choices.length > 0 ? (
            <dl className="rounded-xl bg-[#FBFAF7] border border-[#F2EFE8] px-3 py-0.5">
              {choices.map(({ label, value }, i) => (
                <div
                  key={label}
                  className={`flex justify-between gap-3 py-2 text-[11.5px] ${i < choices.length - 1 ? "border-b border-[#F2EFE8]" : ""}`}
                >
                  <dt className="text-[#8B8678] shrink-0">{label}</dt>
                  <dd className="font-semibold text-right text-[#16243C]">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-[11.5px] text-[#A8A398] leading-relaxed">만든 조건이 기록되지 않은 코스예요.</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 코스 썸네일 — 실제 스톱 좌표로 그린 미니 동선.
 *
 * 관광코스 피드는 히어로 사진으로 카드를 잡아주는데, AI 코스는 사진이 없어 목록이 글자만 남는다.
 * (모든 AI 코스가 같은 카테고리·색이라 테마 그라데이션도 전부 똑같이 보인다.)
 * 그래서 좌표를 정규화해 코스마다 다른 "동선 지문"을 그린다 — 지도 앱다우면서 카드마다 다르다.
 * 멀티데이는 일차별로 선을 끊고 지도와 같은 dayColor를 쓴다.
 */
function RouteThumb({ course }: { course: ThemeCourse }) {
  const pts = course.stops.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  // 한 점뿐이거나 일직선일 때 0으로 나누지 않도록 최소 폭을 준다
  const spanLat = Math.max(maxLat - minLat, 1e-4);
  const spanLng = Math.max(maxLng - minLng, 1e-4);
  const PAD = 16; // 100 기준 여백
  const x = (lng: number) => PAD + ((lng - minLng) / spanLng) * (100 - PAD * 2);
  const y = (lat: number) => 100 - PAD - ((lat - minLat) / spanLat) * (100 - PAD * 2);

  // 일차별로 끊어 그린다 (하루 코스는 day 없음 → 1로 묶임)
  const byDay = new Map<number, { x: number; y: number; meal: boolean }[]>();
  pts.forEach((s) => {
    const d = s.day ?? 1;
    const arr = byDay.get(d) ?? [];
    arr.push({ x: x(s.lng), y: y(s.lat), meal: isMealStop(s) });
    byDay.set(d, arr);
  });
  const multiDay = byDay.size > 1;

  return (
    <span className="relative w-[68px] h-[68px] shrink-0 rounded-[14px] overflow-hidden bg-[linear-gradient(150deg,#F4F7FC_0%,#E8EEF8_100%)] border border-[#E4EAF4]">
      {pts.length === 0 ? (
        <span className="absolute inset-0 flex items-center justify-center text-[#B9C4D6]">
          <IconStagePin className="w-6 h-6" />
        </span>
      ) : (
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" aria-hidden>
          {[...byDay.entries()].map(([day, list]) => {
            const color = multiDay ? dayColor(day) : "#2563EB";
            return (
              <g key={day}>
                {list.length > 1 && (
                  <polyline
                    points={list.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.5"
                  />
                )}
                {/* 식사 지점은 지도와 같은 규칙으로 모양(사각)·색(앰버)을 함께 다르게 — 색만으로 구분하지 않는다 */}
                {list.map((p, i) =>
                  p.meal ? (
                    <rect
                      key={i}
                      x={p.x - 4.2}
                      y={p.y - 4.2}
                      width="8.4"
                      height="8.4"
                      rx="2.4"
                      fill={MEAL_COLOR_DEEP}
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                  ) : (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={i === 0 ? 6 : 4.5}
                      fill={i === 0 ? color : "#FFFFFF"}
                      stroke={color}
                      strokeWidth="2.6"
                    />
                  ),
                )}
              </g>
            );
          })}
        </svg>
      )}
      {multiDay && (
        <span className="absolute left-1 bottom-1 px-1.5 py-[1px] rounded-md bg-white/90 text-[9.5px] font-bold text-[#16243C] tabular-nums">
          {byDay.size}일
        </span>
      )}
    </span>
  );
}

// ── 완료 (지도에 그려짐) ──────────────────────────────────────────────────
// 생성 과정 트레이스(응답 steps[])는 사용자에게 보여주지 않는다 — 결과만 필요하다.
function DoneScreen({ course, onRestart, onGoHome }: { course: ThemeCourse | null; onRestart: () => void; onGoHome: () => void }) {
  const meals = course?.stops.filter(isMealStop).length ?? 0;
  const places = course ? course.stops.length - meals : 0;

  return (
    <div className="mcp-rise pt-6">
      <div className="w-12 h-12 rounded-full bg-[#EAF2FF] flex items-center justify-center text-[#2563EB]">
        <IconCheck className="w-6 h-6" />
      </div>
      <h1 className="mt-4 text-[19px] font-extrabold tracking-[-0.01em] text-[#16243C]">코스를 지도에 그렸어요</h1>
      <p className="mt-1.5 text-[12.5px] text-[#8B8678] leading-relaxed">
        오른쪽 상세 패널에서 일정·장소별 추천 이유를 확인하고, 지도에서 경로와 주변 식당을 살펴보세요.
        만든 코스는 &lsquo;내가 만든 코스&rsquo;에 보관돼요.
      </p>

      {course && (
        <div className="mt-4 rounded-2xl bg-white border border-[#ECE8E0] px-4 py-3">
          <p className="text-[13.5px] font-bold text-[#16243C] leading-snug">{course.title}</p>
          <p className="mt-1 text-[11.5px] text-[#8B8678] tabular-nums">
            장소 {places}곳
            {meals > 0 && (
              <>
                <span className="mx-1 text-[#E0DBD1]">·</span>
                <span style={{ color: MEAL_COLOR_DEEP }} className="font-semibold">식사 {meals}회</span>
              </>
            )}
            <span className="mx-1 text-[#E0DBD1]">·</span>
            {course.totalDuration}
            <span className="mx-1 text-[#E0DBD1]">·</span>
            {course.distance}
          </p>
          {meals > 0 && (
            <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: MEAL_COLOR_DEEP }}>
              식사 시간에는 근처 식당도 함께 넣어뒀어요. 상세보기에서 확인해 보세요.
            </p>
          )}
        </div>
      )}

      <button type="button" onClick={onGoHome} className={`mt-6 ${BTN_PRIMARY}`}>
        내가 만든 코스 보기
      </button>
      <button type="button" onClick={onRestart} className={`mt-2.5 ${BTN_SECONDARY}`}>
        새 코스 만들기
      </button>
    </div>
  );
}

// ── 에러 ─────────────────────────────────────────────────────────────────
function ErrorScreen({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  return (
    <div className="mcp-rise pt-6">
      <div className="w-12 h-12 rounded-full bg-[#FEF0F0] flex items-center justify-center text-[#DC2626]">
        <IconAlert className="w-6 h-6" />
      </div>
      <h1 className="mt-4 text-[19px] font-extrabold tracking-[-0.01em] text-[#16243C]">코스를 만들지 못했어요</h1>
      <p className="mt-1.5 text-[12.5px] text-[#8B8678] leading-relaxed">
        AI 서버 응답이 원활하지 않아요. 잠시 후 다시 시도하거나 조건을 바꿔보세요.
      </p>
      <button type="button" onClick={onRetry} className={`mt-6 ${BTN_PRIMARY}`}>
        다시 시도
      </button>
      <button type="button" onClick={onBack} className={`mt-2.5 ${BTN_SECONDARY}`}>
        조건 다시 고르기
      </button>
    </div>
  );
}

// ── 공용 버튼 스타일 — 앱 공통 톤(다크네이비 #16243C + rounded-2xl) ─────────
const BTN_PRIMARY =
  "w-full py-3.5 rounded-2xl bg-[#16243C] text-white text-[14px] font-semibold cursor-pointer shadow-[0_6px_20px_rgba(22,36,60,0.22)] transition-colors duration-200 enabled:hover:bg-[#1E2F4D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16243C]/40 focus-visible:ring-offset-2 disabled:opacity-35 disabled:cursor-default disabled:shadow-none";
const BTN_SECONDARY =
  "w-full py-3.5 rounded-2xl bg-white border border-[#ECE8E0] text-[#5C5950] text-[14px] font-semibold cursor-pointer transition-colors duration-200 hover:border-[#D6D1C7] hover:bg-[#FBFAF7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16243C]/30";

// ── 공용 '다음' 버튼 ─────────────────────────────────────────────────────
function NextButton({ disabled, onClick, label }: { disabled: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`mt-6 ${BTN_PRIMARY}`}>
      {label ?? "다음"}
    </button>
  );
}

// ── 아이콘 (SVG — 이모지/글리프 금지, 1.9px stroke 통일) ───────────────────
function IconBack() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9.5l6 6 6-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9.5 6l6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconAlert({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 8.5v4.5M12 16.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}

// ── 생성 단계 체크리스트 아이콘 (STAGE_INFO) ────────────────────────────────
function IconStagePin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 1118.5 10c0 5.4-6.5 11-6.5 11z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}
function IconStageRoute({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="6" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="18" cy="17.5" r="2" stroke="currentColor" strokeWidth="1.9" />
      <path d="M7.8 7.9C10 10.5 8 14.5 12 15.5c3 .8 4-1 6.2 1.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function IconStageGauge({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 15a8 8 0 1116 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M12 15l3.2-4.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconStageFork({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 3v6.5a2 2 0 002 2V21M7 3v6.5M9 3v6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 3c-1.4 0-2.5 1.9-2.5 4.5S14.6 12 16 12v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconStageClock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M12 7v5.2l3.4 2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconStageCompass({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M15.2 8.8l-1.9 4.5-4.5 1.9 1.9-4.5 4.5-1.9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function IconStageCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5.5" width="16" height="15" rx="2.4" stroke="currentColor" strokeWidth="1.9" />
      <path d="M4 9.5h16M8.5 3.5v3M15.5 3.5v3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9 14l2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconStageSparkle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3l1.6 4.9L18.5 9.5l-4.9 1.6L12 16l-1.6-4.9L5.5 9.5l4.9-1.6L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M18.5 15.5l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
