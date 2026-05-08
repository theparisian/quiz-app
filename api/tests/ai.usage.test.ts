import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

describe('ai usage & generations', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('aggregates stats and paginates generations', async () => {
    const { user, token } = await createSuperAdminUser();
    const now = new Date();
    await prisma.aiGeneration.createMany({
      data: [
        {
          userId: user.id,
          status: 'success',
          modelUsed: 'claude-sonnet-4-6',
          tokensInput: 1000,
          tokensOutput: 500,
          costEstimateEur: 0.05,
          inputSummary: 'a',
          inputFull: 'full',
          outputJson: { questions: [] },
        },
        {
          userId: user.id,
          status: 'success',
          modelUsed: 'claude-opus-4-7',
          tokensInput: 2000,
          tokensOutput: 800,
          costEstimateEur: 0.12,
          inputSummary: 'b',
          createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        },
        {
          userId: user.id,
          status: 'failed',
          modelUsed: 'claude-sonnet-4-6',
          inputSummary: 'c',
        },
      ],
    });

    const app = getIntegrationApp();
    const stats = await authed(request(app).get('/api/ai/usage/stats'), token).expect(200);
    expect(stats.body.month.generations).toBeGreaterThanOrEqual(1);
    expect(stats.body.allTime.generations).toBeGreaterThanOrEqual(1);

    const list = await authed(request(app).get('/api/ai/generations?limit=2&page=1'), token).expect(
      200,
    );
    expect(list.body.items.length).toBeLessThanOrEqual(2);
    expect(list.body.total).toBeGreaterThanOrEqual(3);

    const firstId = list.body.items[0]?.id as string;
    expect(firstId).toBeDefined();
    const detail = await authed(request(app).get(`/api/ai/generations/${firstId}`), token).expect(
      200,
    );
    expect(detail.body.id).toBe(firstId);
    expect(detail.body.user).toBeDefined();
  });
});
