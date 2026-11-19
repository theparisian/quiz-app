import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import {
  authed,
  createCinemaUser,
  createSuperAdminUser,
  getIntegrationApp,
  minimalCinemaAndScreen,
  truncateQuizRelatedTables,
} from './helpers/integration.js';

/**
 * Droits sur les gabarits de lots (mode de retrait, codes) :
 * - gabarit sponsor : super_admin seul ;
 * - gabarit cinéma : super_admin ou cinema_admin de CE cinéma ; jamais le projectionniste.
 */
describe('prize template redeem rights', () => {
  let app: ReturnType<typeof getIntegrationApp>;
  let superToken: string;
  let cinemaSlug: string;
  let cinemaId: bigint;
  let otherCinemaSlug: string;
  let otherCinemaId: bigint;
  let sponsorSlug: string;

  async function cinemaIdOf(screenId: bigint) {
    return (await prisma.screen.findUniqueOrThrow({ where: { id: screenId } })).cinemaId;
  }

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    app = getIntegrationApp();
    superToken = (await createSuperAdminUser()).token;
    const a = await minimalCinemaAndScreen();
    cinemaSlug = a.cinemaSlug;
    cinemaId = await cinemaIdOf(a.screenId);
    const b = await minimalCinemaAndScreen();
    otherCinemaSlug = b.cinemaSlug;
    otherCinemaId = await cinemaIdOf(b.screenId);
    sponsorSlug = `sp-rights-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await prisma.sponsor.create({ data: { slug: sponsorSlug, name: 'Marque' } });
  });

  async function cinemaTemplate(token: string, slug = cinemaSlug, body: object = {}) {
    const res = await authed(request(app).post(`/api/cinemas/${slug}/prize-templates`), token)
      .send({ label: 'Place offerte', type: 'other', ...body })
      .expect(201);
    return res.body.id as string;
  }

  async function sponsorTemplate() {
    const res = await authed(
      request(app).post(`/api/sponsors/${sponsorSlug}/prize-templates`),
      superToken,
    )
      .send({ label: 'Boisson', type: 'other' })
      .expect(201);
    return res.body.id as string;
  }

  const patch = (id: string, token: string, body: object) =>
    authed(request(app).patch(`/api/prize-templates/${id}`), token).send(body);
  const importCodes = (id: string, token: string, text: string) =>
    authed(request(app).post(`/api/prize-templates/${id}/codes/import`), token).send({ text });
  const stats = (id: string, token: string) =>
    authed(request(app).get(`/api/prize-templates/${id}/codes/stats`), token);

  it('cinema_admin sets code_pool, imports codes and reads stats on its own cinema template', async () => {
    const admin = await createCinemaUser('cinema_admin', cinemaId);
    const id = await cinemaTemplate(admin.token);

    const res = await patch(id, admin.token, {
      redeemMode: 'code_pool',
      redeemInstructions: 'Présentez ce code en caisse',
      redeemUrl: 'https://cinema.example/offre',
    }).expect(200);
    expect(res.body).toMatchObject({ redeemMode: 'code_pool', stock: 0 });

    const imp = await importCodes(id, admin.token, 'C1\nC2\nC2').expect(200);
    expect(imp.body).toMatchObject({ imported: 2, duplicates: 1, remaining: 2 });
    expect((await stats(id, admin.token).expect(200)).body).toEqual({
      total: 2,
      assigned: 0,
      remaining: 2,
    });

    // Code fixe, directement à la création.
    const staticId = await cinemaTemplate(admin.token, cinemaSlug, {
      redeemMode: 'static_code',
      staticCode: 'CINE10',
    });
    const tpl = await prisma.prizeTemplate.findUniqueOrThrow({ where: { id: BigInt(staticId) } });
    expect(tpl.staticCode).toBe('CINE10');
  });

  it("cinema_admin cannot touch another cinema's template", async () => {
    const otherId = await cinemaTemplate(superToken, otherCinemaSlug, { redeemMode: 'code_pool' });
    const admin = await createCinemaUser('cinema_admin', cinemaId);

    const res = await patch(otherId, admin.token, { redeemMode: 'static_code', staticCode: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    await importCodes(otherId, admin.token, 'Z1').expect(403);
    await stats(otherId, admin.token).expect(403);
    expect(await prisma.prizeCode.count()).toBe(0);
    expect(otherCinemaId).not.toBe(cinemaId);
  });

  it('cinema_admin cannot change the mode of, or import codes into, a sponsor template', async () => {
    const id = await sponsorTemplate();
    await patch(id, superToken, { redeemMode: 'code_pool' }).expect(200);
    const admin = await createCinemaUser('cinema_admin', cinemaId);

    await patch(id, admin.token, { redeemMode: 'staff_pin' }).expect(403);
    await patch(id, admin.token, { redeemInstructions: 'Autre consigne' }).expect(403);
    await importCodes(id, admin.token, 'S1').expect(403);
    await stats(id, admin.token).expect(403);
    const tpl = await prisma.prizeTemplate.findUniqueOrThrow({ where: { id: BigInt(id) } });
    expect(tpl.redeemMode).toBe('code_pool');
    expect(tpl.redeemInstructions).toBeNull();
  });

  it('projectionist is refused everywhere', async () => {
    const id = await cinemaTemplate(superToken, cinemaSlug, { redeemMode: 'code_pool' });
    const proj = await createCinemaUser('projectionist', cinemaId);

    await patch(id, proj.token, { redeemMode: 'staff_pin' }).expect(403);
    await importCodes(id, proj.token, 'P1').expect(403);
    await stats(id, proj.token).expect(403);
    await authed(request(app).post(`/api/cinemas/${cinemaSlug}/prize-templates`), proj.token)
      .send({ label: 'X', type: 'other', redeemMode: 'code_pool' })
      .expect(403);
  });

  it('super_admin manages cinema and sponsor templates', async () => {
    const cinemaId1 = await cinemaTemplate(superToken);
    const sponsorId1 = await sponsorTemplate();
    for (const id of [cinemaId1, sponsorId1]) {
      await patch(id, superToken, {
        redeemMode: 'code_pool',
        redeemUrl: 'https://x.example',
      }).expect(200);
      await importCodes(id, superToken, `${id}-A\n${id}-B`).expect(200);
      expect((await stats(id, superToken).expect(200)).body.remaining).toBe(2);
      await patch(id, superToken, { redeemMode: 'static_code', staticCode: 'FIX' }).expect(200);
    }
  });
});
