import request from 'supertest';
import { activeSessionsHealthResponseSchema } from '@quiz-app/validation';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import {
  getIntegrationApp,
  minimalCinemaAndScreen,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

const TOKEN = 'test-health-token-secret';

describe('GET /health/active-sessions', () => {
  const app = getIntegrationApp();

  beforeEach(async () => {
    process.env.HEALTH_CHECK_TOKEN = TOKEN;
    await truncateQuizRelatedTables();
  });

  afterEach(() => {
    delete process.env.HEALTH_CHECK_TOKEN;
  });

  it('401 sans token', async () => {
    const res = await request(app).get('/health/active-sessions').expect(401);
    expect(res.body.error.code).toBe('HEALTH_TOKEN_INVALID');
  });

  it('401 avec un mauvais token', async () => {
    await request(app).get('/health/active-sessions').set('X-Health-Token', 'wrong').expect(401);
  });

  it('401 si HEALTH_CHECK_TOKEN absent côté serveur', async () => {
    delete process.env.HEALTH_CHECK_TOKEN;
    await request(app).get('/health/active-sessions').set('X-Health-Token', TOKEN).expect(401);
  });

  it('aucune session : blocking = 0', async () => {
    const res = await request(app)
      .get('/health/active-sessions')
      .set('X-Health-Token', TOKEN)
      .expect(200);
    expect(res.body).toEqual({ running: 0, paused: 0, lobbyWithPlayers: 0, blocking: 0 });
  });

  it('compte running, paused et les lobbys récents avec joueur actif', async () => {
    const admin = await prisma.user.create({
      data: {
        email: `health-as-${Date.now()}@test.local`,
        role: 'super_admin',
        displayName: 'Admin',
      },
    });
    const { screenId } = await minimalCinemaAndScreen();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `has-${Date.now()}`,
        title: 'Health Quiz',
        status: 'published',
        createdByUserId: admin.id,
      },
    });

    let n = 0;
    async function session(
      state: 'lobby' | 'running' | 'paused' | 'ended' | 'aborted',
      opts: { createdAt?: Date; players?: Array<'active' | 'disconnected' | 'kicked'> } = {},
    ) {
      n += 1;
      const s = await prisma.session.create({
        data: {
          slugShort: `HAS${n}${Math.random().toString(36).slice(2, 5)}`.slice(0, 10),
          quizId: quiz.id,
          screenId,
          state,
          ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
        },
      });
      for (const [i, status] of (opts.players ?? []).entries()) {
        await prisma.player.create({
          data: {
            sessionId: s.id,
            pseudo: `p${n}-${i}`,
            resumeToken: `rt-${s.id}-${i}-${Math.random().toString(36).slice(2)}`,
            status,
          },
        });
      }
    }

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    await session('running', { players: ['active'] });
    await session('running');
    await session('paused');
    // Lobby récent avec un joueur actif : bloquant.
    await session('lobby', { players: ['active', 'disconnected'] });
    // Lobby récent sans joueur, ou seulement avec des joueurs non actifs : non bloquant.
    await session('lobby');
    await session('lobby', { players: ['disconnected', 'kicked'] });
    // Lobby ancien (plus de 60 min) avec joueur actif : non bloquant.
    await session('lobby', { createdAt: twoHoursAgo, players: ['active'] });
    // Sessions terminées : non bloquantes.
    await session('ended', { players: ['active'] });
    await session('aborted');

    const res = await request(app)
      .get('/health/active-sessions')
      .set('X-Health-Token', TOKEN)
      .expect(200);
    const body = activeSessionsHealthResponseSchema.parse(res.body);
    expect(body).toEqual({ running: 2, paused: 1, lobbyWithPlayers: 1, blocking: 4 });
  });
});
