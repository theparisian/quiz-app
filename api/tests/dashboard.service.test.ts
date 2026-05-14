import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import type { AuthUser } from '../src/shared/auth/middleware.js';
import { dashboardService } from '../src/modules/dashboard/dashboard.service.js';
import { startOfTodayParis } from '../src/shared/time/paris-calendar.js';
import {
  createSuperAdminUser,
  minimalCinemaAndScreen,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

async function seedPublishedQuiz(userId: bigint, slug: string) {
  const quiz = await prisma.quiz.create({
    data: {
      slug,
      title: 'T',
      status: 'published',
      createdByUserId: userId,
    },
  });
  await prisma.question.create({
    data: {
      quizId: quiz.id,
      position: 1,
      text: 'Q',
      answers: {
        create: [
          { position: 'A', text: 'A', isCorrect: true },
          { position: 'B', text: 'B', isCorrect: false },
        ],
      },
    },
  });
  return quiz;
}

describe('dashboard.service', () => {
  beforeEach(async () => {
    await prisma.eventLog.deleteMany();
    await truncateQuizRelatedTables();
  });

  it('agrège NUCs et sessions (super_admin)', async () => {
    const { user } = await createSuperAdminUser();
    const q = await seedPublishedQuiz(user.id, `dq-${Date.now()}`);

    const a1 = await minimalCinemaAndScreen();
    const cinemaRow = await prisma.screen.findUniqueOrThrow({
      where: { id: a1.screenId },
      select: { cinemaId: true },
    });
    const a2Screen = await prisma.screen.create({
      data: {
        cinemaId: cinemaRow.cinemaId,
        name: 'S2',
        status: 'active',
      },
    });
    const bInfra = await minimalCinemaAndScreen();

    const uidPrefix = `${Date.now()}`;
    await prisma.nuc.createMany({
      data: [
        { screenId: a1.screenId, nucUid: `${uidPrefix}-online-a`, status: 'online' },
        { screenId: a2Screen.id, nucUid: `${uidPrefix}-offline-a`, status: 'offline' },
        { screenId: bInfra.screenId, nucUid: `${uidPrefix}-online-b`, status: 'online' },
      ],
    });

    await prisma.session.create({
      data: {
        slugShort: '8765',
        quizId: q.id,
        screenId: a1.screenId,
        state: 'lobby',
        totalPlayers: 0,
      },
    });
    await prisma.session.create({
      data: {
        slugShort: '8766',
        quizId: q.id,
        screenId: bInfra.screenId,
        state: 'running',
        startedAt: new Date(),
        totalPlayers: 0,
      },
    });

    const superAdmin: AuthUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: 'super_admin',
      cinemaId: user.cinemaId,
    };
    const scope = dashboardService.resolveScope(superAdmin);
    const h = await dashboardService.getHealth(scope);
    expect(h.nucs.total).toBe(3);
    expect(h.nucs.online).toBe(2);
    expect(h.nucs.offline).toBe(1);
    expect(h.sessions.lobby).toBe(1);
    expect(h.sessions.running).toBe(1);
    expect(h.offlineNucs).toHaveLength(1);

    await prisma.session.updateMany({ data: { state: 'aborted', endedAt: new Date() } });

    const h2 = await dashboardService.getHealth(scope);
    expect(h2.abortedToday).toBeGreaterThanOrEqual(1);
  });

  it('today + erreurs + sessions — scoping cinema_admin', async () => {
    const { user: superU } = await createSuperAdminUser();
    const q = await seedPublishedQuiz(superU.id, `dq2-${Date.now()}`);

    const { screenId: sA } = await minimalCinemaAndScreen();
    const cinemaAId = (await prisma.screen.findUniqueOrThrow({ where: { id: sA } })).cinemaId;
    const { screenId: sB } = await minimalCinemaAndScreen();

    const adminA = await prisma.user.create({
      data: {
        email: `ca-${Date.now()}@test.local`,
        role: 'cinema_admin',
        cinemaId: cinemaAId,
      },
    });

    const day = startOfTodayParis();
    const inDay = new Date(day.getTime() + 3_600_000);

    const sessA = await prisma.session.create({
      data: {
        slugShort: '9991',
        quizId: q.id,
        screenId: sA,
        state: 'ended',
        endedAt: inDay,
        totalPlayers: 2,
        createdAt: inDay,
      },
    });
    await prisma.session.create({
      data: {
        slugShort: '9992',
        quizId: q.id,
        screenId: sB,
        state: 'ended',
        endedAt: inDay,
        totalPlayers: 1,
        createdAt: inDay,
      },
    });

    const pA = await prisma.player.create({
      data: {
        sessionId: sessA.id,
        pseudo: 'J1',
        resumeToken: `rt-${Date.now()}-aaaaaaaaaaaa`,
        joinedAt: inDay,
      },
    });
    await prisma.prize.create({
      data: {
        sessionId: sessA.id,
        playerId: pA.id,
        redeemCode: `rc${Date.now()}`.slice(0, 16),
        signature: 'a'.repeat(64),
        rank: 1,
        label: 'L',
        type: 'discount_qr',
        emailSentAt: inDay,
      },
    });

    await prisma.eventLog.createMany({
      data: [
        {
          level: 'error',
          eventType: 'e.a',
          sessionId: sessA.id,
          cinemaId: cinemaAId,
          createdAt: inDay,
        },
        {
          level: 'info',
          eventType: 'noise',
          sessionId: sessA.id,
          createdAt: inDay,
        },
        {
          level: 'error',
          eventType: 'e.b.other',
          createdAt: inDay,
        },
      ],
    });

    const authA: AuthUser = {
      id: adminA.id,
      email: adminA.email,
      displayName: adminA.displayName,
      role: 'cinema_admin',
      cinemaId: adminA.cinemaId,
    };
    const scopeA = dashboardService.resolveScope(authA);

    const todayA = await dashboardService.getToday(scopeA);
    expect(todayA.sessionsCount).toBe(1);
    expect(todayA.playersCount).toBe(1);
    expect(todayA.prizesSentCount).toBe(1);

    const errsA = await dashboardService.getRecentErrors(scopeA);
    expect(errsA.errors.every((e) => e.level !== 'info')).toBe(true);
    expect(errsA.errors.some((e) => e.eventType === 'e.a')).toBe(true);
    expect(errsA.errors.some((e) => e.eventType === 'e.b.other')).toBe(false);

    const superAdmin: AuthUser = {
      id: superU.id,
      email: superU.email,
      displayName: superU.displayName,
      role: 'super_admin',
      cinemaId: superU.cinemaId,
    };
    const errsSuper = await dashboardService.getRecentErrors(
      dashboardService.resolveScope(superAdmin),
    );
    expect(errsSuper.errors.length >= 2).toBe(true);

    const recentSessionsA = await dashboardService.getRecentSessions(scopeA);
    expect(recentSessionsA.sessions).toHaveLength(1);
    expect(recentSessionsA.sessions[0]?.screenName).toBeTruthy();
  });
});
