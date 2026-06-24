import { z } from 'zod';

const answerSchema = z.object({
  id: z.string().optional(),
  position: z.enum(['A', 'B', 'C', 'D']),
  text: z.string().min(1).max(500),
  isCorrect: z.boolean(),
});

export const questionSaveSchema = z
  .object({
    id: z.string().optional(),
    position: z.number().int().min(0),
    text: z.string().min(1).max(2000),
    imageUrl: z.string().url().nullable().optional(),
    timeLimitSeconds: z.number().int().min(5).max(120),
    pointsMax: z.number().int().min(100).max(10000),
    pointsFloor: z.number().int().min(0).max(9999),
    explanation: z.string().max(500).nullable().optional(),
    answers: z.array(answerSchema).min(2).max(4),
  })
  .refine((q) => q.pointsFloor < q.pointsMax, {
    message: 'pointsFloor must be strictly less than pointsMax',
    path: ['pointsFloor'],
  })
  .refine((q) => q.answers.filter((a) => a.isCorrect).length === 1, {
    message: 'Exactly one answer must be marked as correct',
    path: ['answers'],
  })
  .refine((q) => new Set(q.answers.map((a) => a.position)).size === q.answers.length, {
    message: 'Answer positions must be unique within a question',
    path: ['answers'],
  });

export const saveFullEditSchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().nullable().optional(),
  type: z.enum(['standard', 'sponsored', 'custom']),
  sponsorId: z.string().nullable().optional(),
  language: z.string().max(10),
  durationEstimateSeconds: z.union([z.number().int().min(1).max(7200), z.null()]).optional(),
  brandingJson: z.record(z.unknown()).nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  backgroundOverlayOpacity: z.number().int().min(0).max(100).optional(),
  lobbyBackgroundOverlayOpacity: z.number().int().min(0).max(100).optional(),
  avatarsEnabled: z.boolean().optional(),
  avatarLibraryId: z.string().nullable().optional(),
  questions: z.array(questionSaveSchema),
});

export type SaveFullEditInput = z.infer<typeof saveFullEditSchema>;

export const createQuizSchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().nullable().optional(),
  type: z.enum(['standard', 'sponsored', 'custom']).default('standard'),
  sponsorId: z.string().nullable().optional(),
  language: z.string().max(10).default('fr'),
  durationEstimateSeconds: z.union([z.number().int().min(1).max(7200), z.null()]).optional(),
  brandingJson: z.record(z.unknown()).nullable().optional(),
});

export const updateQuizSchema = createQuizSchema.partial().merge(
  z.object({
    coverImageUrl: z.string().url().nullable().optional(),
    backgroundOverlayOpacity: z.number().int().min(0).max(100).optional(),
    lobbyBackgroundOverlayOpacity: z.number().int().min(0).max(100).optional(),
    avatarsEnabled: z.boolean().optional(),
    avatarLibraryId: z.string().nullable().optional(),
  }),
);

const quizStatusSchema = z.enum(['draft', 'published', 'archived']);
const quizTypeSchema = z.enum(['standard', 'sponsored', 'custom']);

export const listQuizzesQuerySchema = z
  .object({
    status: z.union([quizStatusSchema, z.array(quizStatusSchema)]).optional(),
    type: z.union([quizTypeSchema, z.array(quizTypeSchema)]).optional(),
    sponsorId: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((v) => ({
    status: v.status === undefined ? undefined : Array.isArray(v.status) ? v.status : [v.status],
    type: v.type === undefined ? undefined : Array.isArray(v.type) ? v.type : [v.type],
    sponsorId: v.sponsorId,
    search: v.search,
    page: v.page ?? 1,
    limit: v.limit ?? 20,
  }));

export const publishQuizSchema = z.object({});

export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
