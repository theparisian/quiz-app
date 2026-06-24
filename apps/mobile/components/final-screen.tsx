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

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      {myAvatar && (
        <img
          src={myAvatar}
          alt=""
          className="h-28 w-28 rounded-full object-cover ring-4 ring-yellow-400/50"
        />
      )}
      {isTop3 ? (
        <>
          <div className="text-4xl">🏆</div>
          <div className="text-2xl font-bold">Tu es sur le podium !</div>
          <div className="text-center">
            <div className="text-lg text-gray-400">
              Position : <span className="font-bold text-white">#{finalRank}</span>
            </div>
            {isLateJoiner && (
              <div className="mt-1 text-xs text-gray-500">Arrivé en cours de partie</div>
            )}
            <div className="text-lg text-gray-400">
              Score : <span className="font-bold text-white">{scoreTotal} pts</span>
            </div>
          </div>

          {gain?.kind === 'rank' && (
            <div
              className={`rounded-xl px-6 py-4 text-center ${
                gain.isSuperPrize ? 'border border-yellow-400/40 bg-yellow-500/10' : 'bg-white/5'
              }`}
            >
              <div className="text-lg">
                {gain.medal} Tu remportes :{' '}
                <span className="font-bold text-white">{gain.label}</span>
              </div>
              {gain.isSuperPrize && (
                <div className="mt-1 text-sm font-semibold text-yellow-400">🎰 Super lot !</div>
              )}
            </div>
          )}

          {gain?.kind === 'consolation' && (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-6 py-4 text-center">
              <div className="text-sm text-emerald-300">Tout le monde gagne ce soir</div>
              <div className="mt-1 text-lg">
                🎁 Tu repars avec : <span className="font-bold text-white">{gain.label}</span>
              </div>
            </div>
          )}

          {gain ? (
            !emailSent ? (
              <PrizeEmailForm onSuccess={() => setEmailSent(true)} />
            ) : (
              <div className="rounded-xl bg-green-600/20 px-6 py-4 text-center text-green-400">
                Lot enregistré ! Tu recevras ton email sous peu (vérifie tes spams).
              </div>
            )
          ) : (
            <div className="text-center text-sm text-gray-400">
              Aucun lot n&apos;est prévu pour cette session.
            </div>
          )}
        </>
      ) : (
        <>
          <div className="text-2xl font-bold">Merci d&apos;avoir joué !</div>
          <div className="text-center">
            <div className="text-lg text-gray-400">
              Position finale :{' '}
              <span className="font-bold text-white">
                #{finalRank ?? '—'} / {totalPlayers}
              </span>
            </div>
            {isLateJoiner && (
              <div className="mt-1 text-xs text-gray-500">Arrivé en cours de partie</div>
            )}
            <div className="text-lg text-gray-400">
              Score : <span className="font-bold text-white">{scoreTotal} pts</span>
            </div>
          </div>

          {gain?.kind === 'consolation' && (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-6 py-4 text-center">
              <div className="text-sm text-emerald-300">Tout le monde gagne ce soir</div>
              <div className="mt-1 text-lg">
                🎁 Tu repars avec : <span className="font-bold text-white">{gain.label}</span>
              </div>
            </div>
          )}

          {gain ? (
            !emailSent ? (
              <PrizeEmailForm onSuccess={() => setEmailSent(true)} />
            ) : (
              <div className="rounded-xl bg-green-600/20 px-6 py-4 text-center text-green-400">
                Lot enregistré ! Tu recevras ton email sous peu (vérifie tes spams).
              </div>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
