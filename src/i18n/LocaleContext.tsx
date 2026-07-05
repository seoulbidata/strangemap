"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ko, type UIKey } from "./ui.ko";
import { en } from "./ui.en";
import type { Locale } from "./enums";

export type { Locale };

const STORAGE_KEY = "seoullo_locale";

type TParams = Record<string, string | number>;

interface LocaleValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** UI 정적 문자열 조회. en 사전에 없으면 ko 원문 fallback. `{name}` 치환 지원 */
  t: (key: UIKey, params?: TParams) => string;
}

function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] !== undefined ? String(params[name]) : match
  );
}

function translate(locale: Locale, key: UIKey, params?: TParams): string {
  const dict = locale === "en" ? en : ko;
  return interpolate(dict[key] ?? ko[key], params);
}

const LocaleContext = createContext<LocaleValue>({
  locale: "ko",
  setLocale: () => {},
  t: (key, params) => translate("ko", key, params),
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ko");

  // SSR 안전: 마운트 후 1회 로드 (useCourseCollection과 동일 패턴)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "ko") setLocaleState(saved);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 저장 실패는 조용히 무시 */
    }
  }, []);

  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  return useContext(LocaleContext);
}
