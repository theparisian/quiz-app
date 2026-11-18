import type { Game, Prisma, PrismaClient, QuizType } from '@prisma/client';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logger/index.js';
import { QUIZ_ENGINE_KEY } from './games.schemas.js';

type Db = PrismaClient | Prisma.TransactionClient;

function gameKindFromQuizType(type: QuizType): 'internal' | 'sponsored' {
  return type === 'sponsored' ? 'sponsored' : 'internal';
}

/**
 * Crée ou met à jour le jeu lié à un quiz (mêmes règles que la reprise de la migration 0020).
 * Le jeu reprend le slug du quiz ; refuse (409 SLUG_TAKEN) si ce slug est déjà pris par un
 * autre jeu, non lié à ce quiz.
 */
export async function syncGameFromQuiz(quizId: bigint, tx?: Prisma.TransactionClient) {
  const db: Db = tx ?? prisma;
  const quiz = await db.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');

  const sameSlug = await db.game.findUnique({ where: { slug: quiz.slug } });
  if (sameSlug && sameSlug.quizId !== quiz.id) {
    throw new AppError('Slug already used by another game', 409, 'SLUG_TAKEN');
  }

  const data = {
    slug: quiz.slug,
    title: quiz.title,
    description: quiz.description,
    engineKey: QUIZ_ENGINE_KEY,
    kind: gameKindFromQuizType(quiz.type),
    sponsorId: quiz.sponsorId,
    status: quiz.status,
    coverImageUrl: quiz.coverImageUrl,
    durationEstimateSeconds: quiz.durationEstimateSeconds,
  };

  return db.game.upsert({
    where: { quizId: quiz.id },
    create: { ...data, quizId: quiz.id },
    update: data,
  });
}

/**
 * À appeler avant la suppression d'un quiz : supprime son jeu s'il n'a jamais été joué,
 * sinon l'archive et le détache du quiz (l'historique des manches reste lisible).
 */
export async function releaseGameOfDeletedQuiz(
  quizId: bigint,
  tx: Prisma.TransactionClient,
): Promise<'deleted' | 'archived' | 'none'> {
  const game = await tx.game.findUnique({
    where: { quizId },
    include: { _count: { select: { rounds: true } } },
  });
  if (!game) return 'none';
  if (game._count.rounds === 0) {
    await tx.game.delete({ where: { id: game.id } });
    return 'deleted';
  }
  await tx.game.update({ where: { id: game.id }, data: { status: 'archived', quizId: null } });
  logger.info({ gameSlug: game.slug }, 'Game archived after quiz deletion');
  return 'archived';
}

/** Jeu à utiliser pour une séance créée par quizSlug ; le crée s'il manque. */
export async function ensureGameForQuiz(
  quizId: bigint,
  tx: Prisma.TransactionClient,
): Promise<Game> {
  const existing = await tx.game.findUnique({ where: { quizId } });
  if (existing) return existing;
  return syncGameFromQuiz(quizId, tx);
}

export const gamesService = {
  syncGameFromQuiz,
  releaseGameOfDeletedQuiz,
  ensureGameForQuiz,
};
