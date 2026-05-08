import request from 'supertest';
import { describe, beforeEach, expect, it } from 'vitest';
import {
  authed,
  createSuperAdminUser,
  getIntegrationApp,
  truncateSponsorsAndQuizzes,
} from './helpers/integration.js';

describe('sponsors crud', () => {
  beforeEach(async () => {
    await truncateSponsorsAndQuizzes();
  });

  it('create list get patch deactivate activate slug conflict', async () => {
    const { token } = await createSuperAdminUser();
    const app = getIntegrationApp();
    const r = await authed(request(app).post('/api/sponsors'), token)
      .send({ name: 'Acme Corp' })
      .expect(201);
    const slug = r.body.slug as string;
    expect(slug.length).toBeGreaterThan(0);

    await authed(request(app).post('/api/sponsors'), token)
      .send({ name: 'Other', slug })
      .expect(409);

    const list = await authed(request(app).get('/api/sponsors?active=true'), token).expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);

    await authed(request(app).patch(`/api/sponsors/${slug}`), token)
      .send({ metadata: { region: 'FR' }, brandColorPrimary: '#AABBCC' })
      .expect(200);

    await authed(request(app).post(`/api/sponsors/${slug}/deactivate`), token).expect(200);
    await authed(request(app).post(`/api/sponsors/${slug}/activate`), token).expect(200);
  });
});
