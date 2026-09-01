"use client";

/**
 * 우하단 플로팅 피드백 버튼 + 제출 다이얼로그.
 *
 * WelcomeModal과 같은 다이얼로그 규칙을 따른다 — ESC·바깥클릭·X 로 닫기, 포커스 트랩,
 * 열려 있는 동안 배경 스크롤 잠금, 한 화면에 solid 액션 하나.
 *
 * 배치: 데스크톱은 우하단. 모바일은 우하단이 이미 내 위치 버튼(MobileMapControls, right-4 bottom-24)
 * 차지라 좌하단으로 피한다. 하단 네비게이션(약 72px) 위로 올리고 safe-area를 더한다.
 *
 * 자동 컨텍스트 — 사용자는 "지도가 안 떴어요"까지만 쓴다. 어느 URL·어느 배포·무슨 에러였는지는
 * 우리가 붙여야 재현이 된다. 클라이언트 에러는 마운트 시점부터 링버퍼에 모아 함께 보낸다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useLocale } from "@/i18n/LocaleContext";
import { trackEvent } from "@/lib/analytics";

type FeedbackType = "bug" | "inconvenience" | "idea" | "content";
type Status = "idle" | "sending" | "success";

const MAX_MESSAGE_LENGTH = 1000;
const SESSION_KEY = "seoullo_session_id";
/** 클라이언트 연타 방지 — 서버 레이트리밋(1분 3건)에 걸리기 전에 UI에서 먼저 막는다 */
const COOLDOWN_KEY = "seoullo_feedback_sent_at";
const COOLDOWN_MS = 30_000;

const TYPES: { id: FeedbackType; labelKey: "feedback.type.bug" | "feedback.type.inconvenience" | "feedback.type.idea" | "feedback.type.content" }[] = [
  { id: "bug", labelKey: "feedback.type.bug" },
  { id: "inconvenience", labelKey: "feedback.type.inconvenience" },
  { id: "idea", labelKey: "feedback.type.idea" },
  { id: "content", labelKey: "feedback.type.content" },
];

/** 최근 클라이언트 에러 링버퍼. 리스너는 앱 전체에서 한 번만 붙인다. */
const errorBuffer: string[] = [];
let listenersAttached = false;

function pushError(entry: string) {
  errorBuffer.push(`${new Date().toISOString()} ${entry}`.slice(0, 300));
  if (errorBuffer.length > 8) errorBuffer.shift();
}

function attachErrorListeners() {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;
  window.addEventListener("error", (e) => {
    pushError(`[error] ${e.message} @ ${e.filename ?? "?"}:${e.lineno ?? 0}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    pushError(`[rejection] ${String(e.reason).slice(0, 200)}`);
  });
}

/** 익명 세션 ID — 같은 사람이 여러 건 보냈는지 묶어보는 용도. 개인 식별 정보는 아니다. */
function getSessionId(): string {
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

export default function FeedbackButton() {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(attachErrorListeners, []);

  const close = useCallback(() => {
    setOpen(false);
    setError("");
    // 성공 후 닫을 때만 입력을 비운다 — 전송 실패로 닫혔다면 다시 열었을 때 내용이 살아있어야 한다
    setStatus((prev) => {
      if (prev === "success") {
        setMessage("");
        setEmail("");
      }
      return "idle";
    });
  }, []);

  // 열려 있는 동안 — 배경 스크롤 잠금 · 포커스 이동/복원 · ESC 닫기 · Tab 트랩
  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 폼이라 바로 쓸 수 있게 본문 입력창에 포커스를 준다
    textareaRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open, close]);

  const submit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setError(t("feedback.error.empty"));
      textareaRef.current?.focus();
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t("feedback.error.email"));
      return;
    }
    try {
      const lastSent = Number(window.localStorage.getItem(COOLDOWN_KEY) ?? 0);
      if (Date.now() - lastSent < COOLDOWN_MS) {
        setError(t("feedback.error.rate"));
        return;
      }
    } catch {
      /* 저장소를 못 읽으면 서버 레이트리밋에 맡긴다 */
    }

    setError("");
    setStatus("sending");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message: trimmed,
          email: email.trim(),
          company: honeypot, // 허니팟 — 사람이 채우면 안 되는 필드
          pageUrl: window.location.href,
          referrer: document.referrer,
          locale,
          screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
          sessionId: getSessionId(),
          clientErrors: errorBuffer.join("\n"),
        }),
      });

      if (!res.ok) {
        setError(res.status === 429 ? t("feedback.error.rate") : t("feedback.error.send"));
        setStatus("idle");
        return;
      }

      try {
        window.localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
      } catch {
        /* noop */
      }
      // 폼 내용·이메일은 절대 보내지 않는다. 값이 4개로 고정된 유형만 센다.
      // (GA4 향상된 측정의 form_submit 은 이 폼이 preventDefault 를 쓰기 때문에 잡히다 말다 한다)
      trackEvent("feedback_submit", { feedback_type: type });
      setStatus("success");
    } catch {
      setError(t("feedback.error.send"));
      setStatus("idle");
    }
  };

  return (
    <>
      {/* ── 플로팅 버튼 ──────────────────────────────────────────────────────
          모바일은 좌하단(우하단은 내 위치 버튼 자리), 데스크톱은 우하단. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("feedback.button")}
        title={t("feedback.button")}
        className="fb-fab fixed z-[70] left-4 bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] md:left-auto md:right-6 md:bottom-6 flex h-14 w-14 md:h-[60px] md:w-[60px] items-center justify-center rounded-full bg-white ring-1 ring-black/5 shadow-[0_8px_26px_rgba(16,24,40,0.20)] cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE9C00]"
      >
        {iconFailed ? (
          <ChatBubblesFallback />
        ) : (
          <Image
            src="/icons/feedback.png"
            alt=""
            width={38}
            height={38}
            className="object-contain"
            onError={() => setIconFailed(true)}
          />
        )}
      </button>

      {!open ? null : (
        <div
          className="fb-backdrop fixed inset-0 z-[9998] flex items-center justify-center bg-[#0E1420]/60 backdrop-blur-[3px] p-4 sm:p-6 overflow-y-auto"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            tabIndex={-1}
            className="fb-dialog focus:outline-none relative w-full max-w-[480px] my-auto rounded-[26px] bg-white shadow-[0_32px_90px_rgba(10,16,28,0.34)] ring-1 ring-black/5 overflow-hidden"
          >
            <button
              type="button"
              onClick={close}
              aria-label={t("common.close")}
              className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full text-[#A8A398] flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-[#F4F2EC] hover:text-[#16243C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16243C]/35"
            >
              <IconClose />
            </button>

            {status === "success" ? (
              <div className="px-7 py-12 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#ECFDF5] text-[#059669]">
                  <IconCheck />
                </span>
                <h2 id="feedback-title" className="mt-5 text-[19px] font-extrabold text-[#16243C]">
                  {t("feedback.successTitle")}
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-[#8B8678]">
                  {t("feedback.successBody")}
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-7 w-full inline-flex items-center justify-center px-7 py-3.5 rounded-2xl bg-[#FE9C00] text-white text-[14px] font-bold cursor-pointer shadow-[0_8px_22px_rgba(254,156,0,0.32)] transition-colors duration-200 hover:bg-[#E58900] active:bg-[#D97706] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE9C00]/50 focus-visible:ring-offset-2"
                >
                  {t("feedback.successClose")}
                </button>
              </div>
            ) : (
              <form
                className="px-7 py-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <h2 id="feedback-title" className="pr-10 text-[19px] font-extrabold tracking-tight text-[#16243C]">
                  {t("feedback.title")}
                </h2>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#8B8678]">
                  {t("feedback.subtitle")}
                </p>

                {/* ── 유형 ─────────────────────────────────────────────── */}
                <fieldset className="mt-6">
                  <legend className="text-[11px] font-bold tracking-[0.06em] text-[#2563EB] uppercase">
                    {t("feedback.typeLabel")}
                  </legend>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    {TYPES.map((item) => {
                      const active = type === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setType(item.id)}
                          aria-pressed={active}
                          className={`rounded-xl border px-3 py-2.5 text-[12.5px] font-bold cursor-pointer transition-colors duration-150 ${
                            active
                              ? "border-[#FE9C00] bg-[#FFF6E6] text-[#B45309]"
                              : "border-[#F0EDE6] bg-[#FBFAF7] text-[#6B7280] hover:border-[#E3DED4] hover:bg-white"
                          }`}
                        >
                          {t(item.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* ── 내용 ─────────────────────────────────────────────── */}
                <div className="mt-5">
                  <div className="flex items-baseline justify-between">
                    <label
                      htmlFor="feedback-message"
                      className="text-[11px] font-bold tracking-[0.06em] text-[#2563EB] uppercase"
                    >
                      {t("feedback.messageLabel")}
                    </label>
                    <span className="text-[11px] tabular-nums text-[#B5B0A6]">
                      {message.length}/{MAX_MESSAGE_LENGTH}
                    </span>
                  </div>
                  <textarea
                    id="feedback-message"
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                    rows={5}
                    maxLength={MAX_MESSAGE_LENGTH}
                    placeholder={t("feedback.messagePlaceholder")}
                    className="mt-2 w-full resize-none rounded-2xl border border-[#F0EDE6] bg-[#FBFAF7] px-4 py-3 text-[13.5px] leading-relaxed text-[#16243C] placeholder:text-[#B5B0A6] transition-colors duration-150 focus:border-[#FE9C00] focus:bg-white focus:outline-none"
                  />
                </div>

                {/* ── 이메일(선택) ──────────────────────────────────────── */}
                <div className="mt-4">
                  <label
                    htmlFor="feedback-email"
                    className="text-[11px] font-bold tracking-[0.06em] text-[#2563EB] uppercase"
                  >
                    {t("feedback.emailLabel")}
                    <span className="ml-1.5 font-semibold normal-case tracking-normal text-[#B5B0A6]">
                      ({t("feedback.emailOptional")})
                    </span>
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("feedback.emailPlaceholder")}
                    autoComplete="email"
                    className="mt-2 w-full rounded-2xl border border-[#F0EDE6] bg-[#FBFAF7] px-4 py-3 text-[13.5px] text-[#16243C] placeholder:text-[#B5B0A6] transition-colors duration-150 focus:border-[#FE9C00] focus:bg-white focus:outline-none"
                  />
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#B5B0A6]">
                    {t("feedback.privacy")}
                  </p>
                </div>

                {/* 허니팟 — 화면·스크린리더·탭 이동에서 모두 빠지고 봇만 채운다 */}
                <input
                  type="text"
                  name="company"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden
                  className="absolute -left-[9999px] h-0 w-0 opacity-0"
                />

                {/* ── 함께 전송되는 정보 ────────────────────────────────── */}
                <details
                  open={contextOpen}
                  onToggle={(e) => setContextOpen((e.currentTarget as HTMLDetailsElement).open)}
                  className="mt-4 rounded-2xl border border-[#F0EDE6] bg-[#FBFAF7] px-4 py-3"
                >
                  <summary className="cursor-pointer list-none text-[12px] font-bold text-[#6B7280] marker:hidden">
                    {t("feedback.contextToggle")}
                  </summary>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-[#8B8678]">
                    {t("feedback.contextNote")}
                  </p>
                  <ul className="mt-2 space-y-1 text-[11.5px] text-[#8B8678]">
                    <li>· {t("feedback.context.page")}</li>
                    <li>· {t("feedback.context.device")}</li>
                    <li>· {t("feedback.context.version")}</li>
                    <li>· {t("feedback.context.errors")}</li>
                  </ul>
                  {/* 지도 화면(/)에는 푸터가 없다 — 개인정보를 받는 이 자리가 방침으로 가는 유일한 통로다. */}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 inline-block text-[11.5px] font-bold text-[#8B8678] underline underline-offset-2 hover:text-[#16243C]"
                  >
                    {t("feedback.privacyLink")}
                  </a>
                </details>

                {error ? (
                  <p role="alert" className="mt-4 text-[12.5px] font-semibold text-[#DC2626]">
                    {error}
                  </p>
                ) : null}

                {/* ── 액션 ──────────────────────────────────────────────── */}
                <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={close}
                    className="px-5 py-3.5 rounded-2xl text-[14px] font-bold text-[#6B7280] cursor-pointer transition-colors duration-150 hover:bg-[#F4F2EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16243C]/35"
                  >
                    {t("feedback.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-[#FE9C00] text-white text-[14px] font-bold cursor-pointer shadow-[0_8px_22px_rgba(254,156,0,0.32)] transition-colors duration-200 hover:bg-[#E58900] active:bg-[#D97706] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE9C00]/50 focus-visible:ring-offset-2"
                  >
                    {status === "sending" ? t("feedback.submitting") : t("feedback.submit")}
                  </button>
                </div>
              </form>
            )}
          </div>

          <style jsx global>{`
            @keyframes fbFade { from { opacity: 0; } to { opacity: 1; } }
            @keyframes fbPop { from { opacity: 0; transform: translateY(12px) scale(0.985); } to { opacity: 1; transform: none; } }
            .fb-backdrop { animation: fbFade 0.22s ease both; }
            .fb-dialog { animation: fbPop 0.32s cubic-bezier(0.3, 0.7, 0.3, 1) both; }
            @media (prefers-reduced-motion: reduce) {
              .fb-backdrop, .fb-dialog, .fb-fab { animation: none !important; transition: none !important; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}

/** /icons/feedback.png 이 아직 없을 때를 위한 대체 아이콘 — 겹친 말풍선 3개 */
function ChatBubblesFallback() {
  return (
    <svg width="34" height="34" viewBox="0 0 48 48" fill="none" aria-hidden>
      <path d="M4 22a4 4 0 014-4h20a4 4 0 014 4v10a4 4 0 01-4 4h-9l-6 6v-6H8a4 4 0 01-4-4V22z" fill="#22C55E" />
      <path d="M20 18a4 4 0 014-4h16a4 4 0 014 4v10a4 4 0 01-4 4h-4v5l-5-5h-7a4 4 0 01-4-4V18z" fill="#3B82F6" />
      <path d="M10 8a4 4 0 014-4h20a4 4 0 014 4v12a4 4 0 01-4 4H22l-7 6v-6h-1a4 4 0 01-4-4V8z" fill="#FCC419" />
      <path d="M16 10h16M16 15h16M16 20h13" stroke="#343A40" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
