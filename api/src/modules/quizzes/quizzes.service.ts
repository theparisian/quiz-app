import { Prisma, type AnswerPosition, type QuizBackgroundMediaType } from '@prisma/client';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { extractKeyFromPublicUrl } from '../../shared/storage/storage-url.js';
import type { StorageProvider } from '../../shared/storage/storage-provider.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { logger } from '../../shared/logger/index.js';
import type { CreateQuizInput, SaveFullEditInput, UpdateQuizInput } from './quizzes.schemas.js';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function storagePublicBase(): string {
  return (process.env.STORAGE_PUBLIC_URL ?? 'http://localhost:3000/uploads').replace(/\/+$/, '');
}

function backgroundMediaTypeFromMime(mime: string): QuizBackgroundMediaType {
  return mime.startsWith('video/') ? 'video' : 'image';
}

const ANSWER_ORDER: Record<AnswerPosition, number> = { A: 0, B: 1, C: 2, D: 3 };

function sortAnswers<T extends { position: AnswerPosition }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => ANSWER_ORDER[a.position] - ANSWER_ORDER[b.position]);
}

async function allocateUniqueQuizSlug(title: string): Promise<string> {
  const base = slugify(title) || 'quiz';
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const exists = await prisma.quiz.findUnique({ where: { slug: candidate } });
    if (!exists) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

function parseSponsorId(val: string | null | undefined): bigint | null | undefined {
  if (val === undefined) return undefined;
  if (val === null) return null;
  try {
    return BigInt(val);
  } catch {
    throw new AppError('Invalid sponsor id', 400, 'INVALID_SPONSOR_ID');
  }
}

async function ensureSponsorIfNeeded(id: bigint | null | undefined) {
  if (id == null) return;
  const s = await prisma.sponsor.findUnique({ where: { id } });
  if (!s) throw new AppError('Sponsor not found', 404, 'SPONSOR_NOT_FOUND');
}

function collectPublishErrors(quiz: {
  questions: {
    id: bigint;
    answers: { isCorrect: boolean }[];
    pointsFloor: number;
    pointsMax: number;
  }[];
}): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const qList = quiz.questions ?? [];
  if (!qList.length) {
    errors._quiz = ['At least one question is required'];
  }
  for (const q of qList) {
    const errs: string[] = [];
    if (q.answers.length < 2 || q.answers.length > 4) {
      errs.push('Each question must have between 2 and 4 answers');
    }
    const correct = q.answers.filter((a) => a.isCorrect);
    if (correct.length !== 1) errs.push('Exactly one answer must be marked correct');
    if (q.pointsFloor >= q.pointsMax) errs.push('pointsFloor must be strictly less than pointsMax');
    if (errs.length) errors[q.id.toString()] = errs;
  }
  return errors;
}

function assertPublishedFullEditStructure(
  dbQuestions: {
    id: bigint;
    position: number;
    timeLimitSeconds: number;
    pointsMax: number;
    pointsFloor: number;
    answers: { id: bigint; position: AnswerPosition; isCorrect: boolean }[];
  }[],
  payloadQuestions: SaveFullEditInput['questions'],
) {
  const sortedPayload = [...payloadQuestions].sort((a, b) => a.position - b.position);
  const sortedDb = [...dbQuestions].sort((a, b) => a.position - b.position);
  if (sortedPayload.length !== sortedDb.length) {
    throw new AppError(
      'Cannot change quiz structure while published',
      403,
      'QUIZ_PUBLISHED_STRUCTURE_LOCKED',
    );
  }
  for (let i = 0; i < sortedDb.length; i++) {
    const pq = sortedPayload[i];
    const dq = sortedDb[i];
    if (!pq || !dq) {
      throw new AppError(
        'Cannot change quiz structure while published',
        403,
        'QUIZ_PUBLISHED_STRUCTURE_LOCKED',
      );
    }
    if (!pq.id || pq.id !== dq.id.toString()) {
      throw new AppError(
        'Cannot change quiz structure while published',
        403,
        'QUIZ_PUBLISHED_STRUCTURE_LOCKED',
      );
    }
    if (pq.position !== dq.position) {
      throw new AppError(
        'Cannot reorder questions while published',
        403,
        'QUIZ_PUBLISHED_STRUCTURE_LOCKED',
      );
    }
    if (
      pq.timeLimitSeconds !== dq.timeLimitSeconds ||
      pq.pointsMax !== dq.pointsMax ||
      pq.pointsFloor !== dq.pointsFloor
    ) {
      throw new AppError(
        'Cannot change scoring or timing while published',
        403,
        'QUIZ_PUBLISHED_STRUCTURE_LOCKED',
      );
    }
    const dbA = sortAnswers(dq.answers);
    const plA = sortAnswers(
      pq.answers.map((a) => ({ ...a, position: a.position as AnswerPosition })),
    );
    if (dbA.length !== plA.length) {
      throw new AppError(
        'Cannot change answers structure while published',
        403,
        'QUIZ_PUBLISHED_STRUCTURE_LOCKED',
      );
    }
    for (let j = 0; j < dbA.length; j++) {
      const aDb = dbA[j];
      const aPl = plA[j];
      if (!aDb || !aPl) continue;
      if (!aPl.id || aPl.id !== aDb.id.toString() || aPl.position !== aDb.position) {
        throw new AppError(
          'Cannot change answers structure while published',
          403,
          'QUIZ_PUBLISHED_STRUCTURE_LOCKED',
        );
      }
      if (aPl.isCorrect !== aDb.isCorrect) {
        throw new AppError(
          'Cannot change correct answer while published',
          403,
          'QUIZ_PUBLISHED_ANSWER_LOCKED',
        );
      }
    }
  }
}

function assertPublishedMetadataUnchanged(
  current: {
    type: string;
    sponsorId: bigint | null;
    durationEstimateSeconds: number | null;
  },
  payload: SaveFullEditInput,
) {
  if (payload.type !== current.type) {
    throw new AppError('Field is locked for published quizzes', 403, 'QUIZ_FIELD_LOCKED_PUBLISHED');
  }
  const pSponsor = parseSponsorId(payload.sponsorId);
  const cur = current.sponsorId?.toString() ?? null;
  const cmp = pSponsor?.toString() ?? null;
  if (cmp !== cur) {
    throw new AppError('Field is locked for published quizzes', 403, 'QUIZ_FIELD_LOCKED_PUBLISHED');
  }
  const dur = payload.durationEstimateSeconds ?? null;
  if (dur !== current.durationEstimateSeconds) {
    throw new AppError('Field is locked for published quizzes', 403, 'QUIZ_FIELD_LOCKED_PUBLISHED');
  }
}

export const quizzesService = {
  async create(input: CreateQuizInput, userId: bigint) {
    const slug = await allocateUniqueQuizSlug(input.title);
    const sponsorId = parseSponsorId(input.sponsorId);
    await ensureSponsorIfNeeded(sponsorId ?? undefined);

    return prisma.quiz.create({
      data: {
        slug,
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        sponsorId: sponsorId ?? null,
        language: input.language,
        durationEstimateSeconds: input.durationEstimateSeconds ?? null,
        ...(input.brandingJson !== undefined
          ? {
              brandingJson:
                input.brandingJson === null
                  ? Prisma.JsonNull
                  : (input.brandingJson as Prisma.InputJsonValue),
            }
          : {}),
        createdByUserId: userId,
        status: 'draft',
      },
    });
  },

  async getBySlug(slug: string) {
    const quiz = await prisma.quiz.findUnique({
      where: { slug },
      include: {
        sponsor: true,
        createdBy: { select: { id: true, displayName: true, email: true } },
        questions: {
          include: { answers: true },
          orderBy: { position: 'asc' },
        },
        _count: { select: { sessions: true } },
      },
    });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    return quiz;
  },

  async getById(id: bigint) {
    const quiz = await prisma.quiz.findUnique({ where: { id } });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    return quiz;
  },

  async update(slug: string, input: UpdateQuizInput) {
    const quiz = await prisma.quiz.findUnique({ where: { slug } });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quiz.status === 'archived')
      throw new AppError('Quiz is archived', 403, 'QUIZ_ARCHIVED_READONLY');

    const allowedPublished = new Set([
      'title',
      'description',
      'brandingJson',
      'coverImageUrl',
      'backgroundOverlayOpacity',
      'language',
    ]);

    if (quiz.status === 'published') {
      const keys = Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined);
      for (const k of keys) {
        if (!allowedPublished.has(k)) {
          throw new AppError(
            'Field is locked for published quizzes',
            403,
            'QUIZ_FIELD_LOCKED_PUBLISHED',
          );
        }
      }
    }

    const sponsorId = parseSponsorId(input.sponsorId);
    if (sponsorId !== undefined) await ensureSponsorIfNeeded(sponsorId);

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description ?? null;
    if (input.type !== undefined) data.type = input.type;
    if (input.sponsorId !== undefined) data.sponsorId = sponsorId ?? null;
    if (input.language !== undefined) data.language = input.language;
    if (input.durationEstimateSeconds !== undefined)
      data.durationEstimateSeconds = input.durationEstimateSeconds ?? null;
    if (input.brandingJson !== undefined) data.brandingJson = input.brandingJson ?? null;
    if (input.coverImageUrl !== undefined) data.coverImageUrl = input.coverImageUrl ?? null;
    if (input.backgroundOverlayOpacity !== undefined) {
      data.backgroundOverlayOpacity = input.backgroundOverlayOpacity;
    }

    return prisma.quiz.update({
      where: { id: quiz.id },
      data,
    });
  },

  async saveFullEdit(slug: string, payload: SaveFullEditInput, _userId: bigint) {
    const quizRow = await prisma.quiz.findUnique({
      where: { slug },
      include: {
        questions: {
          include: { answers: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!quizRow) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quizRow.status === 'archived')
      throw new AppError('Quiz is archived', 403, 'QUIZ_ARCHIVED_READONLY');

    const sponsorId = parseSponsorId(payload.sponsorId);
    if (sponsorId !== undefined) await ensureSponsorIfNeeded(sponsorId);

    if (quizRow.status === 'published') {
      assertPublishedMetadataUnchanged(quizRow, payload);
      assertPublishedFullEditStructure(quizRow.questions, payload.questions);
    }

    await prisma.$transaction(async (tx) => {
      const quizUpdate: Prisma.QuizUncheckedUpdateInput = {
        title: payload.title,
        description: payload.description ?? null,
        language: payload.language,
      };
      if (payload.brandingJson !== undefined) {
        quizUpdate.brandingJson =
          payload.brandingJson === null
            ? Prisma.JsonNull
            : (payload.brandingJson as Prisma.InputJsonValue);
      }
      if (payload.coverImageUrl !== undefined) {
        quizUpdate.coverImageUrl = payload.coverImageUrl ?? null;
      }
      if (payload.backgroundOverlayOpacity !== undefined) {
        quizUpdate.backgroundOverlayOpacity = payload.backgroundOverlayOpacity;
      }
      if (quizRow.status !== 'published') {
        quizUpdate.type = payload.type;
        quizUpdate.sponsorId = sponsorId ?? null;
        quizUpdate.durationEstimateSeconds = payload.durationEstimateSeconds ?? null;
      }
      await tx.quiz.update({
        where: { id: quizRow.id },
        data: quizUpdate,
      });

      const sortedQs = [...payload.questions].sort((a, b) => a.position - b.position);

      if (quizRow.status !== 'published') {
        const keepIds = new Set(
          sortedQs.map((q) => q.id).filter((id): id is string => Boolean(id)),
        );
        for (const q of quizRow.questions) {
          if (!keepIds.has(q.id.toString())) {
            await tx.question.delete({ where: { id: q.id } });
          }
        }
      }

      let orderIndex = 0;
      for (const pq of sortedQs) {
        const pos = orderIndex++;
        if (pq.id) {
          const qid = BigInt(pq.id);
          const qExisting = quizRow.questions.find((x) => x.id === qid);
          if (!qExisting) throw new AppError('Question not found', 404, 'QUESTION_NOT_FOUND');

          const publishedQData: Prisma.QuestionUpdateInput = {
            text: pq.text,
            explanation: pq.explanation ?? null,
          };
          if (pq.imageUrl !== undefined) publishedQData.imageUrl = pq.imageUrl ?? null;
          const draftQData: Prisma.QuestionUpdateInput = {
            position: pos,
            text: pq.text,
            timeLimitSeconds: pq.timeLimitSeconds,
            pointsMax: pq.pointsMax,
            pointsFloor: pq.pointsFloor,
            explanation: pq.explanation ?? null,
          };
          if (pq.imageUrl !== undefined) draftQData.imageUrl = pq.imageUrl ?? null;
          await tx.question.update({
            where: { id: qid },
            data: quizRow.status === 'published' ? publishedQData : draftQData,
          });

          if (quizRow.status === 'published') {
            const pays = sortAnswers(
              pq.answers.map((a) => ({ ...a, position: a.position as AnswerPosition })),
            );
            const byPos = sortAnswers(qExisting.answers);
            if (byPos.length !== pays.length)
              throw new AppError(
                'Cannot change answers structure while published',
                403,
                'QUIZ_PUBLISHED_STRUCTURE_LOCKED',
              );
            for (let j = 0; j < byPos.length; j++) {
              const pa = pays[j];
              if (!pa?.id) {
                throw new AppError(
                  'Cannot change answers structure while published',
                  403,
                  'QUIZ_PUBLISHED_STRUCTURE_LOCKED',
                );
              }
              await tx.answer.update({
                where: { id: BigInt(pa.id) },
                data: { text: pa.text },
              });
            }
          } else {
            const payloadAnswerIds = new Set(
              pq.answers.map((a) => a.id).filter((id): id is string => Boolean(id)),
            );
            const existingAnswers = quizRow.questions.find((x) => x.id === qid)!.answers;
            for (const a of existingAnswers) {
              if (!payloadAnswerIds.has(a.id.toString()))
                await tx.answer.delete({ where: { id: a.id } });
            }
            for (const a of pq.answers) {
              if (a.id) {
                await tx.answer.update({
                  where: { id: BigInt(a.id) },
                  data: {
                    position: a.position as AnswerPosition,
                    text: a.text,
                    isCorrect: a.isCorrect,
                  },
                });
              } else {
                await tx.answer.create({
                  data: {
                    questionId: qid,
                    position: a.position as AnswerPosition,
                    text: a.text,
                    isCorrect: a.isCorrect,
                  },
                });
              }
            }
          }
        } else if (quizRow.status === 'published') {
          throw new AppError(
            'Cannot add questions while published',
            403,
            'QUIZ_PUBLISHED_STRUCTURE_LOCKED',
          );
        } else {
          const created = await tx.question.create({
            data: {
              quizId: quizRow.id,
              position: pos,
              text: pq.text,
              imageUrl: pq.imageUrl ?? null,
              timeLimitSeconds: pq.timeLimitSeconds,
              pointsMax: pq.pointsMax,
              pointsFloor: pq.pointsFloor,
              explanation: pq.explanation ?? null,
            },
          });
          for (const a of pq.answers) {
            await tx.answer.create({
              data: {
                questionId: created.id,
                position: a.position as AnswerPosition,
                text: a.text,
                isCorrect: a.isCorrect,
              },
            });
          }
        }
      }
    });

    return quizzesService.getBySlug(slug);
  },

  async publish(slug: string) {
    const quiz = await prisma.quiz.findUnique({
      where: { slug },
      include: {
        questions: { include: { answers: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quiz.status !== 'draft')
      throw new AppError('Invalid status transition', 403, 'QUIZ_INVALID_TRANSITION');

    const errs = collectPublishErrors(quiz);
    if (Object.keys(errs).length) {
      logger.warn({ quizSlug: slug, errors: errs }, 'Quiz publish validation failed');
      throw new AppError('Quiz validation failed', 400, 'QUIZ_PUBLISH_VALIDATION_FAILED', true, {
        questionErrors: errs,
      });
    }

    await prisma.quiz.update({ where: { id: quiz.id }, data: { status: 'published' } });
    logger.info({ quizSlug: slug, quizId: quiz.id.toString() }, 'Quiz published');

    logEvent({
      level: 'info',
      eventType: 'quiz.published',
      payload: { quizSlug: slug },
    });

    return quizzesService.getBySlug(slug);
  },

  async archive(slug: string) {
    const quiz = await prisma.quiz.findUnique({ where: { slug } });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quiz.status === 'archived')
      throw new AppError('Quiz is already archived', 403, 'QUIZ_INVALID_TRANSITION');
    await prisma.quiz.update({ where: { id: quiz.id }, data: { status: 'archived' } });
    logger.info({ quizSlug: slug }, 'Quiz archived');

    logEvent({
      level: 'info',
      eventType: 'quiz.archived',
      payload: { quizSlug: slug },
    });

    return quizzesService.getBySlug(slug);
  },

  async unpublish(slug: string) {
    const quiz = await prisma.quiz.findUnique({ where: { slug } });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quiz.status !== 'published')
      throw new AppError('Invalid status transition', 403, 'QUIZ_INVALID_TRANSITION');
    await prisma.quiz.update({ where: { id: quiz.id }, data: { status: 'draft' } });
    logger.info({ quizSlug: slug }, 'Quiz unpublished');
    return quizzesService.getBySlug(slug);
  },

  async unarchive(slug: string) {
    const quiz = await prisma.quiz.findUnique({ where: { slug } });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quiz.status !== 'archived')
      throw new AppError('Invalid status transition', 403, 'QUIZ_INVALID_TRANSITION');
    await prisma.quiz.update({ where: { id: quiz.id }, data: { status: 'draft' } });
    logger.info({ quizSlug: slug }, 'Quiz unarchived');
    return quizzesService.getBySlug(slug);
  },

  async duplicate(slug: string, userId: bigint) {
    const quiz = await prisma.quiz.findUnique({
      where: { slug },
      include: {
        questions: {
          include: { answers: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');

    const newTitle = `${quiz.title} (copie)`;
    const newSlug = await allocateUniqueQuizSlug(newTitle);

    await prisma.$transaction(async (tx) => {
      const dupe = await tx.quiz.create({
        data: {
          slug: newSlug,
          title: newTitle,
          description: quiz.description,
          type: quiz.type,
          sponsorId: quiz.sponsorId,
          language: quiz.language,
          durationEstimateSeconds: quiz.durationEstimateSeconds,
          coverImageUrl: quiz.coverImageUrl,
          backgroundMediaUrl: quiz.backgroundMediaUrl,
          backgroundMediaType: quiz.backgroundMediaType,
          backgroundOverlayOpacity: quiz.backgroundOverlayOpacity,
          brandingJson:
            quiz.brandingJson == null
              ? Prisma.JsonNull
              : (quiz.brandingJson as Prisma.InputJsonValue),
          status: 'draft',
          aiGenerated: false,
          createdByUserId: userId,
        },
      });
      for (const q of quiz.questions) {
        const qq = await tx.question.create({
          data: {
            quizId: dupe.id,
            position: q.position,
            text: q.text,
            imageUrl: q.imageUrl,
            timeLimitSeconds: q.timeLimitSeconds,
            pointsMax: q.pointsMax,
            pointsFloor: q.pointsFloor,
            explanation: q.explanation,
          },
        });
        for (const a of q.answers) {
          await tx.answer.create({
            data: {
              questionId: qq.id,
              position: a.position,
              text: a.text,
              isCorrect: a.isCorrect,
            },
          });
        }
      }
    });

    logger.info({ fromSlug: slug, newSlug }, 'Quiz duplicated');
    return quizzesService.getBySlug(newSlug);
  },

  async delete(slug: string) {
    const quiz = await prisma.quiz.findUnique({
      where: { slug },
      include: { _count: { select: { sessions: true } } },
    });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quiz._count.sessions > 0) {
      throw new AppError('Quiz cannot be deleted: sessions exist', 409, 'QUIZ_HAS_SESSIONS');
    }
    await prisma.quiz.delete({ where: { id: quiz.id } });
    logger.info({ quizSlug: slug }, 'Quiz deleted');
  },

  async setCoverImage(slug: string, _key: string, url: string) {
    const quiz = await prisma.quiz.findUnique({ where: { slug } });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quiz.status === 'archived')
      throw new AppError('Quiz is archived', 403, 'QUIZ_ARCHIVED_READONLY');
    return prisma.quiz.update({ where: { id: quiz.id }, data: { coverImageUrl: url } });
  },

  async removeCoverImage(slug: string, storage: StorageProvider) {
    const quiz = await prisma.quiz.findUnique({ where: { slug } });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quiz.status === 'archived')
      throw new AppError('Quiz is archived', 403, 'QUIZ_ARCHIVED_READONLY');
    const base = storagePublicBase();
    const key = extractKeyFromPublicUrl(quiz.coverImageUrl, base);
    if (key) await storage.delete(key);
    return prisma.quiz.update({ where: { id: quiz.id }, data: { coverImageUrl: null } });
  },

  async setBackgroundMedia(slug: string, _key: string, url: string, mime: string) {
    const quiz = await prisma.quiz.findUnique({ where: { slug } });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quiz.status === 'archived')
      throw new AppError('Quiz is archived', 403, 'QUIZ_ARCHIVED_READONLY');
    return prisma.quiz.update({
      where: { id: quiz.id },
      data: {
        backgroundMediaUrl: url,
        backgroundMediaType: backgroundMediaTypeFromMime(mime),
      },
    });
  },

  async removeBackgroundMedia(slug: string, storage: StorageProvider) {
    const quiz = await prisma.quiz.findUnique({ where: { slug } });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quiz.status === 'archived')
      throw new AppError('Quiz is archived', 403, 'QUIZ_ARCHIVED_READONLY');
    const base = storagePublicBase();
    const key = extractKeyFromPublicUrl(quiz.backgroundMediaUrl, base);
    if (key) await storage.delete(key);
    return prisma.quiz.update({
      where: { id: quiz.id },
      data: {
        backgroundMediaUrl: null,
        backgroundMediaType: null,
      },
    });
  },

  async setQuestionImage(slug: string, questionId: bigint, url: string) {
    const quiz = await prisma.quiz.findUnique({ where: { slug } });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quiz.status === 'archived')
      throw new AppError('Quiz is archived', 403, 'QUIZ_ARCHIVED_READONLY');
    const q = await prisma.question.findFirst({ where: { id: questionId, quizId: quiz.id } });
    if (!q) throw new AppError('Question not found', 404, 'QUESTION_NOT_FOUND');
    return prisma.question.update({ where: { id: questionId }, data: { imageUrl: url } });
  },

  async removeQuestionImage(slug: string, questionId: bigint, storage: StorageProvider) {
    const quiz = await prisma.quiz.findUnique({ where: { slug } });
    if (!quiz) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    if (quiz.status === 'archived')
      throw new AppError('Quiz is archived', 403, 'QUIZ_ARCHIVED_READONLY');
    const q = await prisma.question.findFirst({ where: { id: questionId, quizId: quiz.id } });
    if (!q) throw new AppError('Question not found', 404, 'QUESTION_NOT_FOUND');
    const base = storagePublicBase();
    const k = extractKeyFromPublicUrl(q.imageUrl, base);
    if (k) await storage.delete(k);
    return prisma.question.update({ where: { id: questionId }, data: { imageUrl: null } });
  },

  async list(filters: {
    status?: ('draft' | 'published' | 'archived')[] | undefined;
    type?: ('standard' | 'sponsored' | 'custom')[] | undefined;
    sponsorId?: string | undefined;
    search?: string | undefined;
    page: number;
    limit: number;
  }) {
    const where: Prisma.QuizWhereInput = {};
    if (filters.status?.length) where.status = { in: filters.status };
    if (filters.type?.length) where.type = { in: filters.type };
    if (filters.sponsorId) where.sponsorId = BigInt(filters.sponsorId);
    if (filters.search) where.title = { contains: filters.search };

    const [items, total] = await Promise.all([
      prisma.quiz.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          slug: true,
          title: true,
          type: true,
          status: true,
          language: true,
          createdAt: true,
          sponsor: { select: { slug: true, name: true } },
          createdBy: { select: { id: true, displayName: true, email: true } },
          _count: { select: { questions: true } },
        },
      }),
      prisma.quiz.count({ where }),
    ]);

    return { items, total, page: filters.page, limit: filters.limit };
  },
};
