import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import {
  rehydrateRunningSessions,
  resetRunningSessionsForTests,
  setIoInstance,
} from '../src/modules/sessions/session-runtime.service.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';
import {
  answerPayload,
  sendGameAction,
  waitForGameState,
  waitForQuizQuestion,
  type GameStateEnvelope,
} from './helpers/game-protocol.js';

function waitSnap(socket: ClientSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('session:state_snapshot timeout')), 8000);
    socket.once('session:state_snapshot', (data: unknown) => {
      clearTimeout(t);
      resolve(data as Record<string, unknown>);
    });
  });
}

describe('session resume (integration)', () => {
  let httpServer: HttpServer;
  let baseUrl: string;
  let adminToken: string;
  let sockets: ClientSocket[];

  beforeEach(async () => {
    await truncateQuizRelatedTables();

    const app = buildApp();
    httpServer = createServer(app);
    const io = setupSocketGateway(httpServer);
    setIoInstance(io);
    app.set('io', io);

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${addr.port}`;
    sockets = [];

    const admin = await prisma.user.create({
      data: { email: `sr-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
    });
    adminToken = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });
  });

  afterEach(async () => {
    resetRunningSessionsForTests();
    for (const s of sockets) s.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('player:resume returns lobby snapshot', async () => {
    const infra = await minimalCinemaAndScreen();
    const quiz = await prisma.quiz.create({
      data: {
        slug: `qr-${Date.now()}`,
        title: 'R',
        status: 'published',
        createdByUserId: (await prisma.user.findFirst({ where: { role: 'super_admin' } }))!.id,
      },
    });

    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ quizSlug: quiz.slug, screenId: infra.screenId.toString() }),
    });
    const sess = (await res.json()) as { id: string; slugShort: string };

    const mobile = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'] });
    sockets.push(mobile);
    await new Promise<void>((r) => mobile.on('connect', r));

    const joinRes = await new Promise<{
      playerId: string;
      resumeToken: string;
    }>((resolve, reject) => {
      mobile.emit(
        'player:join',
        { pseudo: 'Snap', sessionSlugShort: sess.slugShort },
        (cb: unknown) => {
          const o = cb as Record<string, unknown>;
          if (o.playerId && o.resumeToken) resolve(o as { playerId: string; resumeToken: string });
          else reject(new Error(JSON.stringify(o)));
        },
      );
      setTimeout(() => reject(new Error('join timeout')), 5000);
    });

    const snapP = waitSnap(mobile);
    mobile.emit('player:resume', { resumeToken: joinRes.resumeToken, sessionId: sess.id });
    const snap = await snapP;

    expect((snap.session as { state: string }).state).toBe('lobby');
    expect((snap.player as { pseudo: string }).pseudo).toBe('Snap');
  });

  it('player:resume with bad token → error', async () => {
    const mobile = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'] });
    sockets.push(mobile);
    await new Promise<void>((r) => mobile.on('connect', r));

    const errP = new Promise<{ code: string }>((resolve) => {
      mobile.once('error', (e: unknown) => resolve(e as { code: string }));
    });
    mobile.emit('player:resume', { resumeToken: 'nope', sessionId: '1' });
    const err = await errP;
    expect(err.code).toBe('INVALID_RESUME_TOKEN');
  });

  it('nuc:resume without session → session null', async () => {
    const infra = await minimalCinemaAndScreen();
    const authKey = 'k'.repeat(64);
    const hash = await bcrypt.hash(authKey, 8);
    const nucUid = `nuc-r-${Date.now()}`;
    await prisma.nuc.create({
      data: { screenId: infra.screenId, nucUid, authKeyHash: hash, status: 'online' },
    });

    const authRes = await request(httpServer)
      .post('/api/nucs/auth')
      .send({ nucUid, authKey })
      .expect(200);
    const rawCookies = authRes.headers['set-cookie'];
    const cookieHeader = Array.isArray(rawCookies)
      ? rawCookies.join('; ')
      : String(rawCookies ?? '');

    const nucSocket = ioClient(`${baseUrl}/player`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: cookieHeader },
    });
    sockets.push(nucSocket);
    await new Promise<void>((r) => nucSocket.on('connect', r));

    const snapP = waitSnap(nucSocket);
    nucSocket.emit('nuc:resume', { nucUid });
    const snap = await snapP;

    expect(snap.session).toBeNull();
    expect(snap.nuc).toBeDefined();
  });

  it('console:resume returns quiz with isCorrect', async () => {
    const infra = await minimalCinemaAndScreen();
    const admin = (await prisma.user.findFirst({ where: { role: 'super_admin' } }))!;
    const quiz = await prisma.quiz.create({
      data: {
        slug: `qc-${Date.now()}`,
        title: 'Console R',
        status: 'published',
        createdByUserId: admin.id,
      },
    });
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 1,
        text: 'Q?',
        timeLimitSeconds: 10,
        pointsMax: 100,
        pointsFloor: 50,
        answers: {
          create: [
            { position: 'A', text: 'Y', isCorrect: true },
            { position: 'B', text: 'N', isCorrect: false },
          ],
        },
      },
    });

    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ quizSlug: quiz.slug, screenId: infra.screenId.toString() }),
    });
    const sess = (await res.json()) as { id: string };

    const con = ioClient(`${baseUrl}/console`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: `token=${adminToken}` },
    });
    sockets.push(con);
    await new Promise<void>((r) => con.on('connect', r));

    const snapP = waitSnap(con);
    con.emit('console:resume', { sessionId: sess.id });
    const snap = await snapP;

    // Règle 5 : aucun contenu de moteur au premier niveau du snapshot. La console garde les
    // bonnes réponses par sa source d'hydratation authentifiée (GET /api/sessions/:id/full).
    expect(snap.quiz).toBeUndefined();
    expect(snap).toMatchObject({ round: null, gameView: null, gameSeq: 0 });
    const full = await fetch(`${baseUrl}/api/sessions/${sess.id}/full`, {
      headers: { Cookie: `token=${adminToken}` },
    });
    const quizSnap = ((await full.json()) as { quiz: unknown }).quiz as {
      questions: { answers: { isCorrect: boolean }[] }[];
    };
    expect(quizSnap.questions[0]!.answers.some((a) => a.isCorrect === true)).toBe(true);
  });

  /** Séance de 2 questions lancée, un joueur connecté (socket mobile) sur la question 1. */
  async function startedSessionWithPlayer() {
    const infra = await minimalCinemaAndScreen();
    const admin = (await prisma.user.findFirst({ where: { role: 'super_admin' } }))!;
    const quiz = await prisma.quiz.create({
      data: {
        slug: `qs-${Date.now()}`,
        title: 'Snapshots',
        status: 'published',
        createdByUserId: admin.id,
      },
    });
    for (const position of [1, 2]) {
      await prisma.question.create({
        data: {
          quizId: quiz.id,
          position,
          text: `Q${position}?`,
          explanation: `Because ${position}`,
          timeLimitSeconds: 20,
          pointsMax: 1000,
          pointsFloor: 500,
          answers: {
            create: [
              { position: 'A', text: 'Correct', isCorrect: true },
              { position: 'B', text: 'Wrong', isCorrect: false },
            ],
          },
        },
      });
    }
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ quizSlug: quiz.slug, screenId: infra.screenId.toString() }),
    });
    const sess = (await res.json()) as { id: string; slugShort: string };

    const mobile = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'] });
    sockets.push(mobile);
    await new Promise<void>((r) => mobile.on('connect', r));
    const join = await new Promise<{ playerId: string; resumeToken: string }>((resolve, reject) => {
      mobile.emit(
        'player:join',
        { pseudo: 'Snapper', sessionSlugShort: sess.slugShort },
        (cb: unknown) => {
          const o = cb as Record<string, unknown>;
          if (o.playerId) resolve(o as { playerId: string; resumeToken: string });
          else reject(new Error(JSON.stringify(o)));
        },
      );
    });

    // Dernier seq reçu par ce joueur, pour le comparer au gameSeq des snapshots.
    let lastSeq = 0;
    mobile.on('game:state', (env: GameStateEnvelope) => {
      lastSeq = env.seq;
    });

    const opened = waitForQuizQuestion(mobile, 0);
    await fetch(`${baseUrl}/api/sessions/${sess.id}/start`, {
      method: 'POST',
      headers: { Cookie: `token=${adminToken}` },
    });
    const q = await opened;
    return { sess, mobile, join, q, lastSeq: () => lastSeq };
  }

  /** Snapshot obtenu par un second appareil du même joueur (player:resume). */
  async function resumeSnapshot(sessionId: string, resumeToken: string) {
    const other = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'], forceNew: true });
    sockets.push(other);
    await new Promise<void>((r) => other.on('connect', r));
    const snapP = waitSnap(other);
    other.emit('player:resume', { resumeToken, sessionId });
    return snapP;
  }

  it('player:resume snapshot: question, pause and reveal views of the player', async () => {
    process.env.COUNTDOWN_MS = '50';
    process.env.RESULTS_DISPLAY_MS = '5000';
    const { sess, mobile, join, q, lastSeq } = await startedSessionWithPlayer();
    const correct = q.question.answers.find((a) => a.text === 'Correct')!;

    const ack = await sendGameAction(mobile, {
      roundId: q.roundId,
      ...answerPayload(q.question.id, correct.id),
    });
    // Sa vue (avec sa réponse) part avant l'accusé : elle est déjà reçue.
    expect(ack.ok).toBe(true);

    // En question : sa réponse, l'échéance, jamais la bonne réponse.
    const inQuestion = await resumeSnapshot(sess.id, join.resumeToken);
    expect(inQuestion.round).toMatchObject({ roundId: q.roundId, engineKey: 'quiz', position: 1 });
    expect(inQuestion.gameView).toMatchObject({
      phase: 'question',
      questionIndex: 0,
      pausedRemainingMs: null,
      me: { answerId: correct.id, locked: false, result: null },
    });
    expect((inQuestion.gameView as { endsAt: string }).endsAt).toEqual(expect.any(String));
    expect(JSON.stringify(inQuestion.gameView)).not.toContain('correctAnswerId');
    expect(inQuestion.gameSeq).toBe(lastSeq());
    expect(inQuestion.currentQuestion).toBeUndefined();

    // En pause : temps restant figé à la place de l'échéance.
    const pausedView = waitForGameState(mobile, (v) => v.pausedRemainingMs !== null);
    await fetch(`${baseUrl}/api/sessions/${sess.id}/pause`, {
      method: 'POST',
      headers: { Cookie: `token=${adminToken}` },
    });
    await pausedView;
    const inPause = await resumeSnapshot(sess.id, join.resumeToken);
    expect((inPause.session as { state: string }).state).toBe('paused');
    expect(inPause.gameView).toMatchObject({ phase: 'question', endsAt: null });
    const remaining = (inPause.gameView as { pausedRemainingMs: number }).pausedRemainingMs;
    expect(remaining).toBeGreaterThan(15_000);
    expect(remaining).toBeLessThanOrEqual(20_000);
    expect(inPause.gameSeq).toBe(lastSeq());

    // Révélation (clôture forcée par la console) : bonne réponse et résultat personnel.
    await fetch(`${baseUrl}/api/sessions/${sess.id}/resume`, {
      method: 'POST',
      headers: { Cookie: `token=${adminToken}` },
    });
    const revealed = waitForGameState(mobile, (v) => v.phase === 'reveal');
    const forced = await fetch(`${baseUrl}/api/sessions/${sess.id}/force-advance`, {
      method: 'POST',
      headers: { Cookie: `token=${adminToken}` },
    });
    expect(forced.ok).toBe(true);
    await revealed;
    const inReveal = await resumeSnapshot(sess.id, join.resumeToken);
    expect(inReveal.gameView).toMatchObject({
      phase: 'reveal',
      questionIndex: 0,
      correctAnswerId: correct.id,
      explanation: 'Because 1',
      me: { answerId: correct.id, result: { isCorrect: true, rank: 1 } },
    });
    expect(inReveal.gameSeq).toBe(lastSeq());
  }, 30_000);

  it('server restart in the middle of a question: the resumed player sees the reveal', async () => {
    process.env.COUNTDOWN_MS = '50';
    process.env.RESULTS_DISPLAY_MS = '10000';
    const { sess, mobile, join, q } = await startedSessionWithPlayer();
    const correct = q.question.answers.find((a) => a.text === 'Correct')!;
    const ack = await sendGameAction(mobile, {
      roundId: q.roundId,
      ...answerPayload(q.question.id, correct.id),
    });
    expect(ack.ok).toBe(true);

    // Redémarrage : la mémoire est perdue, la base reste. La question est close et notée.
    resetRunningSessionsForTests();
    await rehydrateRunningSessions();

    const snap = await resumeSnapshot(sess.id, join.resumeToken);
    expect(snap.round).toMatchObject({ roundId: q.roundId, engineKey: 'quiz' });
    expect(snap.gameView).toMatchObject({
      phase: 'reveal',
      questionIndex: 0,
      correctAnswerId: correct.id,
      me: { answerId: correct.id, locked: false, result: { isCorrect: true, rank: 1 } },
    });
    expect((snap.gameView as { endsAt: string | null }).endsAt).toEqual(expect.any(String));
    // Nouvelle manche en mémoire : les seq repartent de la reprise, le snapshot donne la base.
    expect(snap.gameSeq).toBeGreaterThanOrEqual(1);
    const db = await prisma.player.findUniqueOrThrow({ where: { id: BigInt(join.playerId) } });
    expect(db.scoreTotal).toBeGreaterThan(0);
  }, 30_000);
});
