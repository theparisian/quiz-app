import request from 'supertest';
import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

describe('quizzes create', () => {
  beforeEach(async () => {
    await truncateQuizRelatedTables();
  });

  it('auto slug and collision suffix', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const r1 = await authed(request(app).post('/api/quizzes'), token)
      .send({ title: 'Cinema Annees 80' })
      .expect(201);
    expect(r1.body.slug).toMatch(/cinema-annees-80/);

    await authed(request(app).post('/api/quizzes'), token)
      .send({ title: 'Cinema Annees 80' })
      .expect(201);
    const rows = await prisma.quiz.findMany({ orderBy: { id: 'asc' } });
    expect(rows.length).toBe(2);
    expect(rows[1]?.slug).toMatch(/cinema-annees-80-2$/);
  });
});
