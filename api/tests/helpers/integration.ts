import type { Express } from 'express';
import supertest from 'supertest';
import { prisma } from '../../src/shared/db/index.js';
import { signJwt } from '../../src/shared/auth/jwt.js';
import { buildApp } from '../../src/create-app.js';
import { resetStorageForTests } from '../../src/shared/storage/index.js';

let cachedApp: Express | null = null;

export function getIntegrationApp(): Express {
  cachedApp ??= buildApp();
  return cachedApp;
}

export async function createSuperAdminUser() {
  const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const user = await prisma.user.create({
    data: {
      email,
      displayName: 'Test Admin',
      role: 'super_admin',
    },
  });
  const token = await signJwt({ userId: user.id.toString(), role: 'super_admin' });
  return { user, token };
}

export function authed(agent: supertest.Test, token: string) {
  return agent.set('Cookie', [`token=${token}`]);
}

export async function truncateQuizRelatedTables() {
  await prisma.aiGeneration.deleteMany({});
  await prisma.playerAnswer.deleteMany({});
  await prisma.player.deleteMany({});
  await prisma.prize.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.answer.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.quiz.deleteMany({});
  const tmp = await prisma.cinema.findMany({
    where: { slug: { startsWith: 'tmp-' } },
    select: { id: true },
  });
  const ids = tmp.map((c) => c.id);
  if (ids.length) {
    const screenIds = (
      await prisma.screen.findMany({ where: { cinemaId: { in: ids } }, select: { id: true } })
    ).map((s) => s.id);
    if (screenIds.length) {
      await prisma.nuc.deleteMany({ where: { screenId: { in: screenIds } } });
    }
    await prisma.screen.deleteMany({ where: { cinemaId: { in: ids } } });
    await prisma.cinema.deleteMany({ where: { id: { in: ids } } });
  }
}

export async function truncateSponsorsOnly() {
  await prisma.quiz.deleteMany({});
  await prisma.sponsor.deleteMany({});
}

export async function truncateSponsorsAndQuizzes() {
  await truncateQuizRelatedTables();
  await prisma.sponsor.deleteMany({});
}

export async function resetStorage() {
  resetStorageForTests();
}

export async function minimalCinemaAndScreen(): Promise<{ screenId: bigint }> {
  const slug = `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const c = await prisma.cinema.create({
    data: {
      slug,
      name: 'Test Cinema',
      status: 'trial',
    },
  });
  const s = await prisma.screen.create({
    data: {
      cinemaId: c.id,
      name: 'S1',
      status: 'active',
    },
  });
  return { screenId: s.id };
}
