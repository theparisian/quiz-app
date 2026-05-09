'use client';

import { useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import PrizeEmailForm from './prize-email-form';

export default function FinalScreen() {
  const finalRank = usePlayerStore((s) => s.finalRank);
  const scoreTotal = usePlayerStore((s) => s.scoreTotal);
  const totalPlayers = usePlayerStore((s) => s.totalPlayers);
  const [emailSent, setEmailSent] = useState(false);

  const isTop3 = finalRank !== null && finalRank <= 3;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      {isTop3 ? (
        <>
          <div className="text-4xl">🏆</div>
          <div className="text-2xl font-bold">Tu es sur le podium !</div>
          <div className="text-center">
            <div className="text-lg text-gray-400">
              Position : <span className="font-bold text-white">#{finalRank}</span>
            </div>
            <div className="text-lg text-gray-400">
              Score : <span className="font-bold text-white">{scoreTotal} pts</span>
            </div>
          </div>

          {!emailSent ? (
            <PrizeEmailForm onSuccess={() => setEmailSent(true)} />
          ) : (
            <div className="rounded-xl bg-green-600/20 px-6 py-4 text-center text-green-400">
              Email enregistré ! Tu recevras ton lot bientôt.
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
            <div className="text-lg text-gray-400">
              Score : <span className="font-bold text-white">{scoreTotal} pts</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
