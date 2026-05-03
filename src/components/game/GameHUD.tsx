"use client";

interface GameHUDProps {
  level: number;
  xp: number;
  xpToNext: number;
  badges: number;
  playerName?: string;
}

export default function GameHUD({ level, xp, xpToNext, badges, playerName = "서울 탐험가" }: GameHUDProps) {
  const xpPct = Math.min(100, Math.round((xp / xpToNext) * 100));

  return (
    <div className="absolute top-4 right-4 z-20 animate-fade-up">
      <div className="map-panel rounded-xl px-4 py-3 flex items-center gap-3 min-w-[240px]">
        <div className="w-10 h-10 rounded-xl bg-[#FE9C00] flex items-center justify-center shrink-0">
          <div className="text-center">
            <div className="text-[8px] font-display text-white/70 leading-none">Lv.</div>
            <div className="text-base font-display font-bold text-white leading-tight">{level}</div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[#1A1E2E] truncate">{playerName}</span>
            <span className="text-[10px] font-display text-[#A8A29E] shrink-0">{xp}/{xpToNext}</span>
          </div>
          <div className="mt-1.5 h-1.5 bg-[#FDECC8] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${xpPct}%`, background: "linear-gradient(to right, #FE9C00, #D97706)" }}
            />
          </div>
          <div className="mt-1 text-[10px] text-[#A8A29E]">뱃지 {badges}개 획득</div>
        </div>
      </div>
    </div>
  );
}
