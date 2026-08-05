"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "seoullo_course_quota_v1";

/** 하루에 만들 수 있는 코스 수 — 로그인 도입 전 임시 상한 */
export const DAILY_COURSE_LIMIT = 3;

/**
 * ⬇️ 제한 On/Off 스위치 — false로 바꾸면 횟수 제한이 완전히 꺼진다 (로컬에서 무제한 테스트용).
 * 카운터만 초기화하고 싶으면 브라우저 콘솔에서:
 *   localStorage.removeItem("seoullo_course_quota_v1")
 */
const QUOTA_ENABLED = true;

interface QuotaState {
  /** KST 기준 YYYY-MM-DD — 이 날짜가 오늘이 아니면 카운트를 버린다 */
  date: string;
  /** 오늘 소진한 횟수 */
  count: number;
}

/** KST(UTC+9) 기준 날짜 문자열. 서버 aiUsage.getTodayString()과 같은 규약. */
function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function read(): QuotaState {
  const fresh: QuotaState = { date: todayKST(), count: 0 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<QuotaState>;
    // 날짜가 바뀌었으면(자정 지남) 리셋
    if (parsed.date !== fresh.date) return fresh;
    return { date: fresh.date, count: typeof parsed.count === "number" ? parsed.count : 0 };
  } catch {
    return fresh;
  }
}

// ── 외부 스토어 — localStorage를 구독 가능한 소스로 감싼다.
// useSyncExternalStore는 렌더마다 **같은 참조**를 요구하므로 스냅샷을 캐싱하고,
// 값이 바뀔 때(소진/환불/다른 탭/날짜 변경)만 새 객체를 만든다.
let cache: QuotaState | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): QuotaState {
  // 탭을 켜둔 채 자정을 넘긴 경우까지 캐시가 스스로 만료되게 한다
  if (!cache || cache.date !== todayKST()) cache = read();
  return cache;
}

/** SSR에서는 localStorage가 없으므로 "아직 안 쓴 상태"로 그린 뒤 하이드레이션에서 실제 값으로 맞춘다. */
const SERVER_SNAPSHOT: QuotaState = { date: "", count: 0 };
function getServerSnapshot(): QuotaState {
  return SERVER_SNAPSHOT;
}

function emit() {
  cache = null;
  listeners.forEach((l) => l());
}

function write(next: QuotaState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패는 조용히 무시 */
  }
  emit();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * 로그인 없이 브라우저에 코스 생성 횟수를 보관해 하루 DAILY_COURSE_LIMIT회로 제한한다.
 *
 * ⚠️ 시크릿창·localStorage 삭제로 우회 가능한 **UX용 임시 장치**다.
 * 실제 AI 서버 비용 방어는 로그인(계정 단위 쿼터) 도입 시 서버로 옮긴다.
 */
export function useCourseQuota() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // 다른 탭에서 만들었거나, 탭을 다시 볼 때(자정 넘김 포함) 최신 값으로 맞춘다
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) emit();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") emit();
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  /** 생성 직전 1회 소진. 이미 소진했으면 false를 반환하고 아무것도 하지 않는다. */
  const consume = useCallback((): boolean => {
    if (!QUOTA_ENABLED) return true; // 제한 꺼짐 — 세지도 않는다
    const cur = read(); // 다른 탭에서 쓴 값까지 반영
    if (cur.count >= DAILY_COURSE_LIMIT) {
      emit();
      return false;
    }
    write({ ...cur, count: cur.count + 1 });
    return true;
  }, []);

  /** 호출이 실패했을 때 되돌린다 — 서버 장애가 사용자 할당량을 태우지 않도록. */
  const refund = useCallback(() => {
    if (!QUOTA_ENABLED) return;
    const cur = read();
    write({ ...cur, count: Math.max(0, cur.count - 1) });
  }, []);

  const used = Math.min(state.count, DAILY_COURSE_LIMIT);

  return {
    /** 제한이 켜져 있는지 — false면 UI에서 잔여 횟수 안내를 숨긴다 */
    enabled: QUOTA_ENABLED,
    used: QUOTA_ENABLED ? used : 0,
    remaining: QUOTA_ENABLED ? DAILY_COURSE_LIMIT - used : DAILY_COURSE_LIMIT,
    canCreate: QUOTA_ENABLED ? used < DAILY_COURSE_LIMIT : true,
    limit: DAILY_COURSE_LIMIT,
    consume,
    refund,
  };
}
