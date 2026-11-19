import { describe, expect, it, beforeEach } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import {
  ensureActiveSessionCodeIsUnique,
  findSessionIdByCode,
  generateUniqueSessionCode,
} from '../src/modules/sessions/session-code.service.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';

describe('session-code.service (integration)', () => {
  let screenId: bigint;
  let quizId: bigint;

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    const infra = await minimalCinemaAndScreen();
    screenId = infra.screenId;

    const admin = await prisma.user.findFirst({ where: { role: 'super_admin' } });
    const adminId =
      admin?.id ??
      (
        await prisma.user.create({
          data: { email: `t-${Date.now()}@test.local`, role: 'super_admin', displayName: 'T' },
        })
      ).id;

    const quiz = await prisma.quiz.create({
      data: {
        slug: `test-quiz-${Date.now()}`,
        title: 'Test',
        status: 'published',
        createdByUserId: adminId,
      },
    });
    quizId = quiz.id;
  });

  it('generates a 4-digit code', async () => {
    const code = await generateUniqueSessionCode();
    expect(code).toMatch(/^\d{4}$/);
    expect(parseInt(code, 10)).toBeGreaterThanOrEqual(1000);
    expect(parseInt(code, 10)).toBeLessThanOrEqual(9999);
  });

  it('generates unique codes for multiple active sessions', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const code = await generateUniqueSessionCode();
      await prisma.session.create({
        data: {
          slugShort: code,
          quizId,
          screenId,
          state: 'lobby',
          totalPlayers: 0,
        },
      });
      codes.add(code);
    }
    expect(codes.size).toBe(20);
  });

  it('can reuse code from ended session', async () => {
    const code = await generateUniqueSessionCode();
    await prisma.session.create({
      data: {
        slugShort: code,
        quizId,
        screenId,
        state: 'ended',
        endedAt: new Date(),
        totalPlayers: 0,
      },
    });

    // The ended session's code should be available for reuse
    // (it may or may not generate the same code, but it shouldn't fail)
    const code2 = await generateUniqueSessionCode();
    expect(code2).toMatch(/^\d{4}$/);
  });

  it('allows an ended session and a new active session to share a code', async () => {
    const ended = await prisma.session.create({
      data: {
        slugShort: '4242',
        quizId,
        screenId,
        state: 'ended',
        endedAt: new Date(),
        totalPlayers: 0,
      },
    });
    const active = await prisma.session.create({
      data: { slugShort: '4242', quizId, screenId, state: 'lobby', totalPlayers: 0 },
    });
    expect(await findSessionIdByCode('4242')).toBe(active.id);
    expect(await ensureActiveSessionCodeIsUnique(active.id, '4242')).toBe('4242');
    expect(ended.id).not.toBe(active.id);
  });

  it('concurrent creations with the same code: the newer session draws another code', async () => {
    const first = await prisma.session.create({
      data: { slugShort: '5555', quizId, screenId, state: 'lobby', totalPlayers: 0 },
    });
    const second = await prisma.session.create({
      data: { slugShort: '5555', quizId, screenId, state: 'lobby', totalPlayers: 0 },
    });

    expect(await ensureActiveSessionCodeIsUnique(first.id, '5555')).toBe('5555');
    const newCode = await ensureActiveSessionCodeIsUnique(second.id, '5555');
    expect(newCode).not.toBe('5555');
    expect(newCode).toMatch(/^\d{4}$/);
    const reloaded = await prisma.session.findUniqueOrThrow({ where: { id: second.id } });
    expect(reloaded.slugShort).toBe(newCode);
    expect(await findSessionIdByCode('5555')).toBe(first.id);
  });

  it('returns null for a code never used', async () => {
    expect(await findSessionIdByCode('0001')).toBeNull();
  });
});
