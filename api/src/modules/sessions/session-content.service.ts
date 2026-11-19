import type { Prisma, Quiz } from '@prisma/client';
import { EMPTY_RESOLVED_AUDIO } from '@quiz-app/validation';
import { prisma } from '../../shared/db/index.js';
import { shapeQuizBackgroundPayload } from '../quizzes/quiz-background.js';
import { resolveQuizAudioPayload } from '../quizzes/quiz-audio.js';

/**
 * Contenu d'une séance à plusieurs manches (B5). `sessions.quiz_id` n'est plus que le quiz de la
 * première manche de moteur quiz (null s'il n'y en a pas) : l'habillage, le lobby et les lots se
 * lisent sur les manches.
 *
 * - Lobby (fonds et sons du lobby, timer, avatars, lots) : jeu de la PREMIÈRE manche.
 * - Pendant une manche (fonds et sons de jeu) : jeu de la manche active s'il a un quiz, sinon
 *   celui de la première manche.
 * - Séance sans ligne `session_rounds` (données anciennes, convention 9) : `sessions.quiz_id`.
 */

/** Manche 1 et son jeu : titre et sponsor des listes de séances. */
export const FIRST_ROUND_SELECT = {
  where: { position: 1 },
  take: 1,
  select: {
    game: {
      select: {
        title: true,
        slug: true,
        sponsor: { select: { name: true, logoUrl: true } },
      },
    },
  },
} satisfies Prisma.Session$roundsArgs;

interface TitleSource {
  quiz: { title: string; slug: string } | null;
  rounds?: { game: { title: string; slug: string } }[];
}

/** Titre et slug affichés pour une séance : jeu de la première manche, sinon quiz de la séance. */
export function sessionTitle(s: TitleSource): { title: string; slug: string } {
  const game = s.rounds?.[0]?.game;
  if (game) return { title: game.title, slug: game.slug };
  if (s.quiz) return { title: s.quiz.title, slug: s.quiz.slug };
  return { title: '', slug: '' };
}

const ROUND_GAME_INCLUDE = {
  game: { include: { quiz: true, sponsor: true } },
} satisfies Prisma.SessionRoundInclude;

export type SessionRoundWithGame = Prisma.SessionRoundGetPayload<{
  include: typeof ROUND_GAME_INCLUDE;
}>;

/** Manches de la séance (dans l'ordre), avec leur jeu, son quiz et son sponsor. */
export function loadSessionRounds(sessionId: bigint): Promise<SessionRoundWithGame[]> {
  return prisma.sessionRound.findMany({
    where: { sessionId },
    orderBy: { position: 'asc' },
    include: ROUND_GAME_INCLUDE,
  });
}

async function legacySessionQuiz(sessionId: bigint): Promise<Quiz | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { quiz: true },
  });
  return session?.quiz ?? null;
}

/** Quiz qui configure le lobby (fonds, sons, timer, avatars, lots) : celui de la première manche. */
export async function resolveLobbyQuiz(sessionId: bigint): Promise<Quiz | null> {
  const first = await prisma.sessionRound.findFirst({
    where: { sessionId },
    orderBy: { position: 'asc' },
    include: { game: { include: { quiz: true } } },
  });
  if (!first) return legacySessionQuiz(sessionId);
  return first.game.quiz;
}

/**
 * Quiz qui habille l'écran pendant une manche : celui de la manche s'il en a un, sinon celui de
 * la première manche. Sans manche donnée : celui de la première manche.
 */
export async function resolveRoundThemeQuiz(
  sessionId: bigint,
  roundId: bigint | null,
): Promise<Quiz | null> {
  if (roundId !== null) {
    const round = await prisma.sessionRound.findUnique({
      where: { id: roundId },
      include: { game: { include: { quiz: true } } },
    });
    if (round?.game.quiz) return round.game.quiz;
  }
  return resolveLobbyQuiz(sessionId);
}

/** Habillage d'écran (`quiz`) et sons (`audio`) d'un quiz ; valeurs neutres sans quiz. */
export async function shapeThemePayload(quiz: Quiz | null) {
  if (!quiz) {
    return {
      quiz: shapeQuizBackgroundPayload({
        backgroundMediaUrl: null,
        backgroundMediaType: null,
        backgroundOverlayOpacity: 0,
        lobbyBackgroundMediaUrl: null,
        lobbyBackgroundMediaType: null,
        lobbyBackgroundOverlayOpacity: 0,
        brandingJson: null,
      }),
      audio: EMPTY_RESOLVED_AUDIO,
    };
  }
  return { quiz: shapeQuizBackgroundPayload(quiz), audio: await resolveQuizAudioPayload(quiz) };
}
