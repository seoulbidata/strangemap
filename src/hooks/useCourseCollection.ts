"use client";

import { useCallback, useEffect, useState } from "react";
import type { ThemeCourse } from "@/data/themeCourses";

const STORAGE_KEY = "seoullo_course_collection_v1";

interface CollectionState {
  /** 사용자가 지도에서 열어본(다녀온) 코스 id 목록 (최신순) */
  visitedIds: string[];
  /** AI가 생성했지만 아직 저장하지 않은 임시 코스 */
  drafts: ThemeCourse[];
}

const EMPTY: CollectionState = { visitedIds: [], drafts: [] };

function load(): CollectionState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<CollectionState>;
    return {
      visitedIds: Array.isArray(parsed.visitedIds) ? parsed.visitedIds : [],
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
    };
  } catch {
    return EMPTY;
  }
}

/**
 * 로그인 없이 브라우저에 코스 컬렉션(다녀온 코스 / AI 임시저장)을 보관한다.
 * 에이전트 도입 후 서버 이력으로 승격하더라도 인터페이스는 유지된다.
 */
export function useCourseCollection() {
  const [state, setState] = useState<CollectionState>(EMPTY);

  // SSR 안전: 마운트 후 1회 로드
  useEffect(() => {
    setState(load());
  }, []);

  const persist = useCallback((next: CollectionState) => {
    setState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 저장 실패는 조용히 무시 */
    }
  }, []);

  const markVisited = useCallback(
    (id: string) => {
      setState((prev) => {
        const visitedIds = [id, ...prev.visitedIds.filter((v) => v !== id)].slice(0, 50);
        const next = { ...prev, visitedIds };
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* noop */
        }
        return next;
      });
    },
    []
  );

  const addDraft = useCallback(
    (course: ThemeCourse) => {
      setState((prev) => {
        const drafts = [course, ...prev.drafts.filter((d) => d.id !== course.id)].slice(0, 20);
        const next = { ...prev, drafts };
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* noop */
        }
        return next;
      });
    },
    []
  );

  const removeDraft = useCallback(
    (id: string) => {
      persist({ ...state, drafts: state.drafts.filter((d) => d.id !== id) });
    },
    [persist, state]
  );

  return {
    visitedIds: state.visitedIds,
    drafts: state.drafts,
    markVisited,
    addDraft,
    removeDraft,
  };
}
