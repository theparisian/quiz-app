import { createServer, type Server as HttpServer } from 'http';
import { type AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import {
  POLL_PARTICIPATION_REASON,
  pollConsoleViewSchema,
  pollMobileViewSchema,
  type PollMobileView,
  type PollScreenView,
  type RoundEndedPayload,
  type RoundInfo,
} from '@quiz-app/validation';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import { syncGameFromQuiz } from '../src/modules/games/games.service.js';
import {
  getSessionRuntime,
  rehydrateRunningSessions,
  resetRunningSessionsForTests,
  setIoInstance,
} from '../src/modules/sessions/session-runtime.service.js';
import { truncateQuizRelatedTables, minimalCinemaAndScreen } from './helpers/integration.js';
import {
  answerPayload,
  sendGameAction,
  type GameStateEnvelope,
  type QuizViewLike,
} from './helpers/game-protocol.js';

/**
 * Moteur sondage dans une vraie séance (B6) : deux manches quiz + sondage de bout en bout, puis
 * redémarrage du serveur pendant le vote d'une question.
 */
describe('poll engine in a session', () => {
  let httpServer: HttpServer;
  let baseUrl: string;
  let adminToken: string;
  let adminId: bigint;
  let sockets: ClientSocket[];

  beforeEach(async () => {
    await truncateQuizRelatedTables();
    const app = buildApp();
    httpServer = createServer(app);
    const io = setupSocketGateway(httpServer);
    setIoInstance(io);
    app.set('io', io);
    process.env.RESULTS_DISPLAY_MS = '100';
    process.env.COUNTDOWN_MS = '50';
    process.env.ROUND_INTERLUDE_MS = '200';
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    baseUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
    sockets = [];
    const admin = await prisma.user.create({
      data: { email: `sp-${Date.now()}@test.local`, role: 'super_admin', displayName: 'Admin' },
    });
    adminId = admin.id;
    adminToken = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });
  });

  afterEach(async () => {
    resetRunningSessionsForTests();
    delete process.env.ROUND_INTERLUDE_MS;
    for (const s of sockets) s.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  const cookie = () => `token=${adminToken}`;

  async function post(path: string, body?: unknown) {
    return fetch(`${baseUrl}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie() },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  async function createQuizGame() {
    const quiz = await prisma.quiz.create({
      data: {
        slug: `sp-quiz-${Date.now()}`,
        title: 'Quiz',
        status: 'published',
        createdByUserId: adminId,
      },
    });
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        position: 1,
        text: 'Q1?',
        timeLimitSeconds: 10,
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
    return syncGameFromQuiz(quiz.id);
  }

  /** Sondage de deux questions créé et publié par l'API REST. */
  async function createPollGame(): Promise<string> {
    const res = await post('/games', {
      engineKey: 'poll',
      title: 'Sondage de la séance',
      configJson: {
        participationPoints: 250,
        resultsSeconds: 3,
        questions: [
          {
            id: 'q1',
            text: 'Film préféré ?',
            options: [
              { id: 'a', text: 'Alien' },
              { id: 'b', text: 'Brazil' },
            ],
            durationSeconds: 30,
          },
          {
            id: 'q2',
            text: 'Popcorn ?',
            options: [
              { id: 'sweet', text: 'Sucré' },
              { id: 'salty', text: 'Salé' },
            ],
            durationSeconds: 30,
          },
        ],
      },
    });
    expect(res.status).toBe(201);
    const { slug } = (await res.json()) as { slug: string };
    expect((await post(`/games/${slug}/publish`)).status).toBe(200);
    return slug;
  }

  async function createSession(gameSlugs: string[]) {
    const infra = await minimalCinemaAndScreen();
    const res = await post('/sessions', { gameSlugs, screenId: infra.screenId.toString() });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string };
  }

  async function seedPlayer(sessionId: string, pseudo: string) {
    return prisma.player.create({
      data: {
        sessionId: BigInt(sessionId),
        pseudo,
        resumeToken: `sp-${pseudo}-${Math.random().toString(36).slice(2)}`,
        status: 'active',
      },
    });
  }

  interface Recorded {
    name: string;
    payload: unknown;
  }

  async function connectAs(sessionId: string, player: { id: bigint; resumeToken: string }) {
    const socket = ioClient(`${baseUrl}/mobile`, { transports: ['websocket'], forceNew: true });
    sockets.push(socket);
    const events: Recorded[] = [];
    socket.onAny((name: string, payload: unknown) => events.push({ name, payload }));
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    await new Promise<void>((resolve) => {
      socket.emit(
        'player:rejoin_room',
        { sessionId, playerId: player.id.toString(), resumeToken: player.resumeToken },
        () => resolve(),
      );
    });
    return { socket, events };
  }

  async function connectConsole(sessionId: string) {
    const socket = ioClient(`${baseUrl}/console`, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Cookie: cookie() },
    });
    sockets.push(socket);
    const events: Recorded[] = [];
    socket.onAny((name: string, payload: unknown) => events.push({ name, payload }));
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    await new Promise<void>((resolve) =>
      socket.emit('console:join', { sessionId }, () => resolve()),
    );
    return { socket, events };
  }

  async function until(cond: () => boolean | Promise<boolean>, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (!(await cond())) {
      if (Date.now() > deadline) throw new Error('until: timeout');
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
  }

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const named = <T>(events: Recorded[], name: string) =>
    events.filter((e) => e.name === name).map((e) => e.payload as T);

  async function roundStarted(events: Recorded[], position: number) {
    await until(() =>
      named<RoundInfo>(events, 'round:started').some((r) => r.position === position),
    );
    return named<RoundInfo>(events, 'round:started').find((r) => r.position === position)!;
  }

  async function roundEnded(events: Recorded[], position: number) {
    await until(() =>
      named<RoundEndedPayload>(events, 'round:ended').some((r) => r.position === position),
    );
    return named<RoundEndedPayload>(events, 'round:ended').find((r) => r.position === position)!;
  }

  /** Dernière vue sondage reçue pour cette manche qui satisfait `pred`. */
  async function pollView<V extends { phase: string; questionIndex: number }>(
    events: Recorded[],
    roundId: string,
    pred: (v: V) => boolean,
  ): Promise<V> {
    const find = () =>
      named<GameStateEnvelope<V>>(events, 'game:state')
        .filter((e) => e.roundId === roundId && pred(e.view))
        .at(-1);
    await until(() => find() !== undefined);
    return find()!.view;
  }

  const voteAs = (sessionId: string, playerId: bigint, questionId: string, optionId: string) =>
    getSessionRuntime().handleAction(BigInt(sessionId), playerId, {
      type: 'vote',
      payload: { questionId, optionId },
    });

  it('quiz then poll: generic protocol only, participation points, one session:ended', async () => {
    const quizGame = await createQuizGame();
    const pollSlug = await createPollGame();
    const session = await createSession([quizGame.slug, pollSlug]);
    const alice = await seedPlayer(session.id, 'Alice');
    const bob = await seedPlayer(session.id, 'Bob');
    const carol = await seedPlayer(session.id, 'Carol');
    const a = await connectAs(session.id, alice);
    const b = await connectAs(session.id, bob);
    const consoleConn = await connectConsole(session.id);

    expect((await post(`/sessions/${session.id}/start`)).ok).toBe(true);

    // Manche 1 (quiz) : Alice juste.
    const r1 = await roundStarted(a.events, 1);
    const q = await pollView<QuizViewLike>(a.events, r1.roundId, (v) => v.phase === 'question');
    const correct = q.question!.answers.find((x) => x.text === 'Correct')!.id;
    await getSessionRuntime().handleAction(
      BigInt(session.id),
      alice.id,
      answerPayload(BigInt(q.question!.id), BigInt(correct)),
    );
    await post(`/sessions/${session.id}/force-advance`);
    await roundEnded(a.events, 1);
    const quizPoints = (await prisma.player.findUniqueOrThrow({ where: { id: alice.id } }))
      .scoreTotal;
    expect(quizPoints).toBeGreaterThan(0);

    // Manche 2 (sondage).
    const r2 = await roundStarted(a.events, 2);
    expect(r2).toMatchObject({ engineKey: 'poll', game: { slug: pollSlug } });
    const open1 = await pollView<PollMobileView>(
      a.events,
      r2.roundId,
      (v) => v.phase === 'question' && v.questionIndex === 0,
    );
    expect(open1).toMatchObject({ myVote: null, totalPlayers: 3, totalVotes: 0 });

    // Vote par le socket (accusé), double vote refusé, option inconnue refusée.
    const ack = await sendGameAction(a.socket, {
      roundId: r2.roundId,
      type: 'vote',
      payload: { questionId: 'q1', optionId: 'a' },
    });
    expect(ack).toEqual({ ok: true, result: { accepted: true } });
    const again = await sendGameAction(a.socket, {
      roundId: r2.roundId,
      type: 'vote',
      payload: { questionId: 'q1', optionId: 'b' },
    });
    expect(again).toMatchObject({ ok: false, code: 'ALREADY_VOTED' });
    const unknown = await sendGameAction(b.socket, {
      roundId: r2.roundId,
      type: 'vote',
      payload: { questionId: 'q1', optionId: 'zz' },
    });
    expect(unknown).toMatchObject({ ok: false, code: 'INVALID_OPTION' });
    await pollView<PollMobileView>(a.events, r2.roundId, (v) => v.myVote === 'a');

    // Le vote d'Alice n'arrive pas chez Bob ; la console voit le compteur, sans répartition.
    await pollView<PollScreenView>(
      consoleConn.events,
      r2.roundId,
      (v) => v.phase === 'question' && v.totalVotes === 1,
    );
    for (const v of named<GameStateEnvelope<Record<string, unknown>>>(b.events, 'game:state')) {
      if (v.roundId === r2.roundId) expect(v.view.myVote ?? null).toBeNull();
    }

    // Bob et Carol votent : tous ont voté, résultats sans attendre l'échéance (30 s).
    await voteAs(session.id, bob.id, 'q1', 'b');
    await voteAs(session.id, carol.id, 'q1', 'a');
    const results1 = await pollView<PollScreenView>(
      consoleConn.events,
      r2.roundId,
      (v) => v.phase === 'results' && v.questionIndex === 0,
    );
    expect(results1).toMatchObject({
      totalVotes: 3,
      counts: [
        { optionId: 'a', votes: 2 },
        { optionId: 'b', votes: 1 },
      ],
    });
    const bobResults = await pollView<PollMobileView>(
      b.events,
      r2.roundId,
      (v) => v.phase === 'results',
    );
    expect(bobResults).toMatchObject({ myVote: 'b', totalVotes: 3 });

    // Question 2 (force-advance pendant les résultats) : seule Alice vote, puis fin forcée.
    await post(`/sessions/${session.id}/force-advance`);
    await pollView<PollMobileView>(
      a.events,
      r2.roundId,
      (v) => v.phase === 'question' && v.questionIndex === 1,
    );
    await voteAs(session.id, alice.id, 'q2', 'salty');
    await post(`/sessions/${session.id}/force-advance`); // → résultats
    await pollView<PollScreenView>(
      consoleConn.events,
      r2.roundId,
      (v) => v.phase === 'results' && v.questionIndex === 1,
    );
    await post(`/sessions/${session.id}/force-advance`); // → fin
    const ended2 = await roundEnded(a.events, 2);
    await until(() => named(a.events, 'session:ended').length > 0);
    await sleep(200);

    // Participation : 250 points à chacun des trois votants, ScoreEvent de la manche 2.
    for (const p of [alice, bob, carol]) {
      expect(ended2.scoreboard.find((x) => x.playerId === p.id.toString())?.scoreThisRound).toBe(
        250,
      );
    }
    const pollEvents = await prisma.scoreEvent.findMany({ where: { roundId: BigInt(r2.roundId) } });
    expect(pollEvents).toHaveLength(3);
    expect(pollEvents.every((e) => e.reason === POLL_PARTICIPATION_REASON)).toBe(true);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: alice.id } })).scoreTotal).toBe(
      quizPoints + 250,
    );

    // Protocole générique seulement : aucun événement session:question_*, aucune ligne
    // player_answers pour le sondage (seule la question du quiz en a).
    for (const conn of [a, b, consoleConn]) {
      expect(conn.events.some((e) => e.name.startsWith('session:question'))).toBe(false);
    }
    const answers = await prisma.playerAnswer.findMany({
      where: { playerId: { in: [alice.id, bob.id, carol.id] } },
    });
    expect(new Set(answers.map((x) => x.questionId)).size).toBe(1);

    // Vues reçues valides ; seq strictement croissant par destinataire.
    const consoleViews = named<GameStateEnvelope>(consoleConn.events, 'game:state').filter(
      (e) => e.roundId === r2.roundId,
    );
    for (const e of consoleViews)
      expect(pollConsoleViewSchema.safeParse(e.view).success).toBe(true);
    const aliceViews = named<GameStateEnvelope>(a.events, 'game:state').filter(
      (e) => e.roundId === r2.roundId,
    );
    for (const e of aliceViews) expect(pollMobileViewSchema.safeParse(e.view).success).toBe(true);
    const seqs = aliceViews.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((x, y) => x - y));
    expect(new Set(seqs).size).toBe(seqs.length);

    expect(named(a.events, 'session:ended')).toHaveLength(1);
    const rounds = await prisma.sessionRound.findMany({
      where: { sessionId: BigInt(session.id) },
      orderBy: { position: 'asc' },
    });
    expect(rounds.map((r) => r.state)).toEqual(['ended', 'ended']);
    // Participants de la manche (convention 7) : plateforme, sans rien demander au moteur.
    expect(
      (
        rounds[1]!.stateJson as { platform: { participants: string[] } }
      ).platform.participants.sort(),
    ).toEqual([alice.id, bob.id, carol.id].map(String).sort());
  }, 30_000);

  it('server restart during a poll question: resumes at its results, votes kept, then ends', async () => {
    const pollSlug = await createPollGame();
    const session = await createSession([pollSlug]);
    const alice = await seedPlayer(session.id, 'Alice');
    const bob = await seedPlayer(session.id, 'Bob');
    const a = await connectAs(session.id, alice);

    await post(`/sessions/${session.id}/start`);
    const r1 = await roundStarted(a.events, 1);
    await pollView<PollMobileView>(a.events, r1.roundId, (v) => v.phase === 'question');
    await voteAs(session.id, alice.id, 'q1', 'b');
    await sleep(500); // votes persistés au regroupement (250 ms)

    // Redémarrage pendant le vote : la mémoire est perdue, la base reste.
    resetRunningSessionsForTests();
    await rehydrateRunningSessions();

    const sid = BigInt(session.id);
    const snap = getSessionRuntime().roundSnapshot(sid, 'mobile', alice.id);
    expect(snap.round?.roundId).toBe(r1.roundId);
    expect(snap.gameView).toMatchObject({
      phase: 'results',
      questionIndex: 0,
      myVote: 'b',
      totalVotes: 1,
      counts: [
        { optionId: 'a', votes: 0 },
        { optionId: 'b', votes: 1 },
      ],
    });
    const bobSnap = getSessionRuntime().roundSnapshot(sid, 'mobile', bob.id);
    expect(bobSnap.gameView).toMatchObject({ phase: 'results', myVote: null });

    // La suite s'enchaîne : question 2, puis fin avec les points de participation d'Alice.
    await post(`/sessions/${session.id}/force-advance`);
    await pollView<PollMobileView>(
      a.events,
      r1.roundId,
      (v) => v.phase === 'question' && v.questionIndex === 1,
    );
    await post(`/sessions/${session.id}/force-advance`);
    await post(`/sessions/${session.id}/force-advance`);
    await until(async () => {
      const row = await prisma.session.findUnique({ where: { id: sid } });
      return row?.state === 'ended';
    });
    const events = await prisma.scoreEvent.findMany({ where: { sessionId: sid } });
    expect(events.map((e) => [e.playerId, e.points])).toEqual([[alice.id, 250]]);
  }, 30_000);
});
