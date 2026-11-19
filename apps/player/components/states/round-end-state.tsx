'use client';

import { useNucStore } from '@/lib/stores/nuc-store';
import QuizBackground from '@/components/shared/quiz-background';
import ScoreRow from '@/components/shared/score-row';
import { displayedRoundSponsor } from '@quiz-app/validation';
import SponsorBadge from '@/components/sponsor/sponsor-badge';

/** Lignes du classement de fin de manche affichées à l'écran. */
const ROUND_END_TOP = 5;

/**
 * Classement de fin de manche (`round:ended`), hors `GameStage` : affiché seulement entre deux
 * manches. Pour la dernière manche, `session:ended` suit aussitôt et l'écran final prend la
 * place directement (le store ne passe pas par cet état).
 */
export default function RoundEndState() {
  const board = useNucStore((s) => s.roundScoreboard);
  const round = useNucStore((s) => s.round);
  if (!board) return null;
  // C4 : sponsor de la manche qui vient de se terminer (pas celui de la manche suivante).
  const sponsor = round?.roundId === board.roundId ? displayedRoundSponsor(round) : null;
  const top = board.scoreboard.slice(0, ROUND_END_TOP);

  return (
    <div className="relative flex h-full flex-col">
      <QuizBackground />
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-center justify-center bg-white/5 py-4 text-xl font-medium text-gray-300">
          Manche {board.position} / {board.totalRounds} terminée
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-16">
          <div className="text-3xl font-bold">Classement</div>
          <div className="w-full max-w-2xl space-y-2">
            {top.map((entry, i) => (
              <ScoreRow
                key={entry.playerId}
                rank={i + 1}
                pseudo={entry.pseudo}
                avatarUrl={entry.avatarUrl}
                scoreTotal={entry.scoreTotal}
                scoreDiff={entry.scoreThisRound}
                index={i}
              />
            ))}
          </div>
          {sponsor && <SponsorBadge sponsor={sponsor} />}
        </div>
      </div>
    </div>
  );
}
