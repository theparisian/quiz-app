import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getIntegrationApp } from './helpers/integration.js';

describe('GET /health et /health/detailed', () => {
  const app = getIntegrationApp();

  beforeEach(() => {
    process.env.HEALTH_CHECK_TOKEN = 'test-health-token-secret';
  });

  afterEach(() => {
    delete process.env.HEALTH_CHECK_TOKEN;
  });

  it('/health retourne uniquement ok', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('/health/detailed sans token → masqué', async () => {
    const res = await request(app).get('/health/detailed').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('/health/detailed mauvais token → masqué', async () => {
    const res = await request(app)
      .get('/health/detailed')
      .set('X-Health-Token', 'wrong')
      .expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('/health/detailed bon token → checks complets', async () => {
    const res = await request(app)
      .get('/health/detailed')
      .set('X-Health-Token', 'test-health-token-secret')
      .expect(200);
    expect(res.body.checks.database.status).toBe('ok');
    expect(typeof res.body.checks.database.latencyMs).toBe('number');
    expect(res.body.version).toBeDefined();
    expect(typeof res.body.checks.sessionsActive).toBe('number');
  });
});
