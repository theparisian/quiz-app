'use client';

import { useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { resolveMediaUrl } from '@/lib/media-url';
import PrizeEmailForm from './prize-email-form';
import type { SessionPrizesDisplay } from '@quiz-app/validation';

type PlayerGain =
  | { kind: 'rank'; label: string; isSuperPrize: boolean; medal: string }
  | { kind: 'consolation'; label: string };

function resolvePlayerGain(
  finalRank: number | null,
  prizes: SessionPrizesDisplay | null,
  prizeAvailabilityByRank: { rank1?: boolean; rank2?: boolean; rank3?: boolean } | null,
): PlayerGain | null {
  if (finalRank === null || !prizes) return null;

  if (finalRank <= 3) {
    const key = `rank${finalRank}` as 'rank1' | 'rank2' | 'rank3';
    const rankAvailable = prizeAvailabilityByRank?.[key] !== false;
    const rankPrize = prizes[key];
    if (rankAvailable && rankPrize) {
      const medals = ['', '🥇', '🥈', '🥉'];
      return {
        kind: 'rank',
        label: rankPrize.label,
        isSuperPrize: key === 'rank1' && !!prizes.rank1?.isSuperPrize,
        medal: medals[finalRank] ?? '',
      };
    }
  }

  if (prizes.all) {
    return { kind: 'consolation', label: prizes.all.label };
  }

  return null;
}

function splitPrizeLabel(label: string): { main: string; accent: string | null } {
  const words = label.trim().split(/\s+/);
  if (words.length <= 1) return { main: label, accent: null };
  const accent = words.pop()!;
  return { main: words.join(' '), accent };
}

function prizeEmoji(label: string): string {
  if (/popcorn/i.test(label)) return '🍿';
  return '🎁';
}

function PrizeAvatarHero({
  avatarUrl,
  finalRank,
  showPositionBadge,
}: {
  avatarUrl: string | null;
  finalRank: number | null;
  showPositionBadge: boolean;
}) {
  if (!avatarUrl) return null;

  return (
    <div className="relative mb-2">
      <div className="absolute inset-0 scale-125 rounded-full bg-yellow-400/20 blur-2xl" />
      <img src={avatarUrl} alt="" className="relative h-32 w-32 rounded-full object-cover" />
      {showPositionBadge && finalRank !== null && (
        <div className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-yellow-400 px-3 py-1 text-xs font-bold text-gray-900 shadow-lg">
          <span aria-hidden>🏆</span>
          Position #{finalRank}
        </div>
      )}
    </div>
  );
}

function PrizeGiftCard({
  label,
  isSuperPrize,
  isConsolation,
}: {
  label: string;
  isSuperPrize?: boolean;
  isConsolation?: boolean;
}) {
  const { main, accent } = splitPrizeLabel(label);

  return (
    <div
      className={`flex w-full items-center gap-4 rounded-2xl border p-4 ${
        isSuperPrize
          ? 'border-yellow-400/30 bg-yellow-500/10'
          : isConsolation
            ? 'border-emerald-400/30 bg-emerald-500/10'
            : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
        <div className="absolute inset-2 rounded-full bg-yellow-400/30 blur-lg" />
        <span className="relative text-5xl leading-none" aria-hidden>
          {prizeEmoji(label)}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-yellow-400">
          ✨ Ton cadeau ✨
        </div>
        <div className="mt-1 text-xl font-black uppercase leading-tight">
          {accent ? (
            <>
              <span className="text-white">{main} </span>
              <span className="text-yellow-400">{accent}</span>
            </>
          ) : (
            <span className="text-white">{label}</span>
          )}
        </div>
        <p className="mt-2 text-sm leading-snug text-gray-400">
          {isConsolation
            ? "Tout le monde gagne ce soir — ton lot t'attend !"
            : `Ton ${label.toLowerCase()} t'attend, il est pour toi !`}
        </p>
        {isSuperPrize && (
          <p className="mt-1 text-sm font-semibold text-yellow-400">🎰 Super lot !</p>
        )}
      </div>
    </div>
  );
}

function EmailSuccessMessage() {
  return (
    <div className="rounded-xl bg-green-600/20 px-6 py-4 text-center text-green-400">
      Lot enregistré ! Tu recevras ton email sous peu (vérifie tes spams).
    </div>
  );
}

function NoPrizeMessage() {
  return (
    <div className="text-center text-sm text-gray-400">
      Aucun lot n&apos;est prévu pour cette session.
    </div>
  );
}

function ScoreSummary({
  finalRank,
  totalPlayers,
  scoreTotal,
  isLateJoiner,
}: {
  finalRank: number | null;
  totalPlayers: number;
  scoreTotal: number;
  isLateJoiner: boolean;
}) {
  return (
    <div className="text-center text-sm text-gray-500">
      <div>
        Position :{' '}
        <span className="font-semibold text-gray-300">
          #{finalRank ?? '—'}
          {totalPlayers > 0 ? ` / ${totalPlayers}` : ''}
        </span>
        {' · '}
        Score : <span className="font-semibold text-gray-300">{scoreTotal} pts</span>
      </div>
      {isLateJoiner && <div className="mt-1 text-xs">Arrivé en cours de partie</div>}
    </div>
  );
}

export default function FinalScreen() {
  const finalRank = usePlayerStore((s) => s.finalRank);
  const avatarUrl = usePlayerStore((s) => s.avatarUrl);
  const scoreTotal = usePlayerStore((s) => s.scoreTotal);
  const totalPlayers = usePlayerStore((s) => s.totalPlayers);
  const joinedQuestionPosition = usePlayerStore((s) => s.joinedQuestionPosition);
  const prizeAvailabilityByRank = usePlayerStore((s) => s.prizeAvailabilityByRank);
  const prizes = usePlayerStore((s) => s.prizes);
  const [emailSent, setEmailSent] = useState(false);

  const isTop3 = finalRank !== null && finalRank <= 3;
  const gain = resolvePlayerGain(finalRank, prizes, prizeAvailabilityByRank);
  const isLateJoiner = joinedQuestionPosition != null;
  const myAvatar = resolveMediaUrl(avatarUrl);

  if (gain) {
    const isSuperPrize = gain.kind === 'rank' && gain.isSuperPrize;
    const isConsolation = gain.kind === 'consolation';

    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col px-6 py-10">
        <div className="flex flex-col items-center text-center">
          <PrizeAvatarHero avatarUrl={myAvatar} finalRank={finalRank} showPositionBadge={isTop3} />
          <h1 className="mt-6 text-4xl font-black">{isTop3 ? 'Bravo !' : 'Merci !'}</h1>
          <p className="mt-2 text-lg text-gray-400">
            {isTop3 ? 'Tu es sur le podium !' : 'Tu repars avec un cadeau !'}
          </p>
          {!isTop3 && (
            <div className="mt-3">
              <ScoreSummary
                finalRank={finalRank}
                totalPlayers={totalPlayers}
                scoreTotal={scoreTotal}
                isLateJoiner={isLateJoiner}
              />
            </div>
          )}
        </div>

        <div className="mt-10">
          <PrizeGiftCard
            label={gain.label}
            isSuperPrize={isSuperPrize}
            isConsolation={isConsolation}
          />
        </div>

        <div className="mt-10 flex flex-1 flex-col justify-end">
          {!emailSent ? (
            <PrizeEmailForm prizeLabel={gain.label} onSuccess={() => setEmailSent(true)} />
          ) : (
            <EmailSuccessMessage />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10">
      {myAvatar && <img src={myAvatar} alt="" className="h-28 w-28 rounded-full object-cover" />}

      {isTop3 ? (
        <>
          <div className="text-4xl" aria-hidden>
            🏆
          </div>
          <div className="text-2xl font-bold">Tu es sur le podium !</div>
        </>
      ) : (
        <div className="text-2xl font-bold">Merci d&apos;avoir joué !</div>
      )}

      <ScoreSummary
        finalRank={finalRank}
        totalPlayers={totalPlayers}
        scoreTotal={scoreTotal}
        isLateJoiner={isLateJoiner}
      />

      {isTop3 && <NoPrizeMessage />}
    </div>
  );
}
