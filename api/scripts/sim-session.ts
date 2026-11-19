import 'dotenv/config';
import { createServer } from 'http';
import type { Namespace } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import {
  rehydrateRunningSessions,
  setIoInstance,
} from '../src/modules/sessions/session-runtime.service.js';
import { startNucOfflineMonitor } from '../src/shared/nuc-monitor/index.js';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';

/**
 * Simulateur de séance sur le protocole de manche (`round:*`, `game:state`, `game:cue`,
 * `game:action`). Mesure, par question : messages émis par le serveur (appels d'émission et
 * livraisons reçues par les clients connectés) et durée de clôture (échéance + tolérance →
 * révélation reçue par la console).
 *
 *   pnpm sim:session -- --players 300 [--speed 1] [--questions 3] [--quiz <slug>] [--screen <id>]
 *
 * Sans quiz publié ni écran actif, crée ses propres données (cinéma, écran, quiz).
 */

const args = process.argv.slice(2);
function argVal(name: string, def: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1]! : def;
}
const PLAYER_COUNT = parseInt(argVal('players', '5'), 10);
const SPEED = parseFloat(argVal('speed', '1'));
const QUESTIONS = parseInt(argVal('questions', '3'), 10);
const QUIZ_SLUG = argVal('quiz', '');
const SCREEN_ID = argVal('screen', '');
/** Tolérance serveur après l'échéance affichée (quiz.engine.ts). */
const TOLERANCE_MS = 500;

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

interface QuizView {
  phase: 'countdown' | 'question' | 'reveal' | 'done';
  questionIndex: number;
  question: {
    id: string;
    position: number;
    text: string;
    timeLimitMs: number;
    answers: { id: string; position: string; text: string }[];
  } | null;
  endsAt: string | null;
  answeredCount: number;
  totalPlayers: number;
  correctAnswerId?: string | null;
  scoreboard?: { pseudo: string; scoreTotal: number; scoreThisQuestion: number }[];
  me?: { answerId: string | null; locked: boolean };
}
interface StateEnvelope {
  roundId: string;
  seq: number;
  view: QuizView;
}

/** Par question : compteurs d'émissions serveur et de livraisons client. */
interface QuestionStats {
  serverEmits: number;
  serverEmitsByEvent: Record<string, number>;
  deliveries: number;
  revealDeadline: number | null;
  revealAtConsole: number | null;
  firstPlayerReveal: number | null;
  lastPlayerReveal: number | null;
}

const stats = new Map<number, QuestionStats>();
let currentIndex = -1;
function statsFor(index: number): QuestionStats {
  let s = stats.get(index);
  if (!s) {
    s = {
      serverEmits: 0,
      serverEmitsByEvent: {},
      deliveries: 0,
      revealDeadline: null,
      revealAtConsole: null,
      firstPlayerReveal: null,
      lastPlayerReveal: null,
    };
    stats.set(index, s);
  }
  return s;
}

/** Compte chaque appel `nsp.to(room).emit(event)` du serveur (un message par room). */
function instrumentNamespace(nsp: Namespace) {
  const originalTo = nsp.to.bind(nsp);
  nsp.to = ((room: string | string[]) => {
    const op = originalTo(room);
    const originalEmit = op.emit.bind(op);
    op.emit = ((event: string, ...rest: unknown[]) => {
      const payload = rest[0] as {
        view?: { questionIndex?: number };
        data?: { questionIndex?: number };
      };
      const index = payload?.view?.questionIndex ?? payload?.data?.questionIndex ?? currentIndex;
      if (event.startsWith('game:')) {
        const s = statsFor(index);
        s.serverEmits += 1;
        const key = `${nsp.name} ${event}`;
        s.serverEmitsByEvent[key] = (s.serverEmitsByEvent[key] ?? 0) + 1;
      }
      return originalEmit(event, ...rest);
    }) as typeof op.emit;
    return op;
  }) as typeof nsp.to;
}

async function ensureFixtures(adminId: bigint) {
  let quiz = QUIZ_SLUG
    ? await prisma.quiz.findUnique({ where: { slug: QUIZ_SLUG } })
    : await prisma.quiz.findFirst({ where: { status: 'published', slug: { startsWith: 'sim-' } } });
  if (!quiz) {
    quiz = await prisma.quiz.create({
      data: {
        slug: `sim-${Date.now().toString(36)}`,
        title: 'Simulation',
        status: 'published',
        createdByUserId: adminId,
      },
    });
    for (let i = 1; i <= QUESTIONS; i++) {
      await prisma.question.create({
        data: {
          quizId: quiz.id,
          position: i,
          text: `Question ${i} ?`,
          timeLimitSeconds: 10,
          pointsMax: 1000,
          pointsFloor: 500,
          answers: {
            create: ['A', 'B', 'C', 'D'].map((position, k) => ({
              position: position as 'A' | 'B' | 'C' | 'D',
              text: `Réponse ${position}`,
              isCorrect: k === 0,
            })),
          },
        },
      });
    }
  }

  let screenId: bigint;
  if (SCREEN_ID) {
    screenId = BigInt(SCREEN_ID);
  } else {
    // Capacité non renseignée : plafond de 400 joueurs.
    const screen =
      (await prisma.screen.findFirst({ where: { status: 'active', capacity: null } })) ??
      (await prisma.screen.create({
        data: {
          name: 'Sim',
          status: 'active',
          cinema: {
            create: { slug: `sim-${Date.now().toString(36)}`, name: 'Sim Cinema', status: 'trial' },
          },
        },
      }));
    screenId = screen.id;
  }
  return { quiz, screenId };
}

async function main() {
  log('=== Quiz Session Simulator (protocole de manche) ===');
  log(`Players: ${PLAYER_COUNT} | Speed: ${SPEED}x`);

  process.env.RESULTS_DISPLAY_MS = String(Math.round(8000 / SPEED));
  process.env.COUNTDOWN_MS = String(Math.round(3000 / SPEED));

  const app = buildApp();
  const httpServer = createServer(app);
  const io = setupSocketGateway(httpServer);
  for (const ns of ['/player', '/mobile', '/console']) instrumentNamespace(io.of(ns));
  setIoInstance(io);
  app.set('io', io);
  startNucOfflineMonitor(io);

  await rehydrateRunningSessions();

  const PORT = 3999;
  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
  log(`Server listening on port ${PORT}`);
  const BASE = `http://localhost:${PORT}`;

  let admin = await prisma.user.findFirst({ where: { role: 'super_admin' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: { email: 'sim-admin@test.local', displayName: 'Sim Admin', role: 'super_admin' },
    });
  }
  const token = await signJwt({ userId: admin.id.toString(), role: 'super_admin' });
  const cookie = `token=${token}`;

  const { quiz, screenId } = await ensureFixtures(admin.id);
  log(`Quiz: "${quiz.title}" (${quiz.slug}) | Screen ID: ${screenId}`);

  const res = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ quizSlug: quiz.slug, screenId: screenId.toString() }),
  });
  if (!res.ok) {
    log(`ERROR creating session: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const session = (await res.json()) as { id: string; slugShort: string; totalQuestions: number };
  log(
    `Session created: code=${session.slugShort} id=${session.id} questions=${session.totalQuestions}`,
  );

  // Console du cinéma : observe les vues `console` (compteur, révélation).
  const consoleSocket = ioClient(`${BASE}/console`, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: { Cookie: cookie },
  });
  await new Promise<void>((resolve) => consoleSocket.on('connect', resolve));
  await new Promise<void>((resolve) =>
    consoleSocket.emit('console:join', { sessionId: session.id }, () => resolve()),
  );
  const countDelivery = (index: number) => {
    statsFor(index).deliveries += 1;
  };
  consoleSocket.on('game:cue', () => countDelivery(currentIndex));
  consoleSocket.on('game:state', (env: StateEnvelope) => {
    countDelivery(env.view.questionIndex);
    const v = env.view;
    if (v.phase === 'question' && v.questionIndex > currentIndex) {
      currentIndex = v.questionIndex;
      log(`\n--- Question ${v.question!.position} : "${v.question!.text}" ---`);
    }
    if (v.phase === 'question' && v.endsAt) {
      statsFor(v.questionIndex).revealDeadline = Date.parse(v.endsAt) + TOLERANCE_MS;
    }
    if (v.phase === 'reveal' && statsFor(v.questionIndex).revealAtConsole === null) {
      statsFor(v.questionIndex).revealAtConsole = Date.now();
      log(`  Correct answer: ${v.correctAnswerId} | answered ${v.answeredCount}/${v.totalPlayers}`);
      for (const e of (v.scoreboard ?? []).slice(0, 3)) {
        log(`    ${e.pseudo}: +${e.scoreThisQuestion} (total: ${e.scoreTotal})`);
      }
    }
  });

  const players: { socket: ClientSocket; id: string; answered: Set<number> }[] = [];
  log(`Connecting ${PLAYER_COUNT} players...`);
  const joinStartedAt = Date.now();
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const socket = ioClient(`${BASE}/mobile`, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    const join = await new Promise<{ playerId: string }>((resolve, reject) => {
      socket.emit(
        'player:join',
        { pseudo: `Player_${i + 1}`, sessionSlugShort: session.slugShort },
        (result: { playerId?: string }) => {
          if (result.playerId) resolve(result as { playerId: string });
          else reject(new Error(JSON.stringify(result)));
        },
      );
      setTimeout(() => reject(new Error('Join timeout')), 10_000);
    });
    const player = { socket, id: join.playerId, answered: new Set<number>() };
    players.push(player);

    socket.on('game:cue', () => countDelivery(currentIndex));
    socket.on('game:state', (env: StateEnvelope) => {
      countDelivery(env.view.questionIndex);
      const v = env.view;
      if (v.phase === 'reveal') {
        const s = statsFor(v.questionIndex);
        const now = Date.now();
        s.firstPlayerReveal ??= now;
        s.lastPlayerReveal = Math.max(s.lastPlayerReveal ?? 0, now);
      }
      if (v.phase !== 'question' || !v.question || v.me?.locked || v.me?.answerId) return;
      if (player.answered.has(v.questionIndex)) return;
      player.answered.add(v.questionIndex);
      const q = v.question;
      const delay = (Math.random() * Math.min(15_000, q.timeLimitMs * 0.8)) / SPEED;
      setTimeout(() => {
        const answer =
          Math.random() < 0.7
            ? q.answers[0]!
            : q.answers[Math.floor(Math.random() * q.answers.length)]!;
        socket.emit(
          'game:action',
          {
            roundId: env.roundId,
            type: 'answer',
            payload: { questionId: q.id, answerId: answer.id },
          },
          (ack: { ok: boolean; code?: string }) => {
            if (!ack.ok) log(`  ! ${player.id} answer refused: ${ack.code}`);
          },
        );
      }, delay);
    });
  }
  log(`${PLAYER_COUNT} players joined in ${Date.now() - joinStartedAt} ms`);

  const ended = new Promise<void>((resolve) => {
    consoleSocket.on(
      'session:ended',
      (payload: { finalScoreboard: { pseudo: string; scoreTotal: number; rank: number }[] }) => {
        log('\n=== SESSION ENDED ===');
        for (const e of payload.finalScoreboard.slice(0, 5))
          log(`  #${e.rank} ${e.pseudo}: ${e.scoreTotal} pts`);
        resolve();
      },
    );
    consoleSocket.on('session:aborted', () => resolve());
  });

  log('Starting session...');
  const startRes = await fetch(`${BASE}/api/sessions/${session.id}/start`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  if (!startRes.ok) {
    log(`ERROR starting session: ${startRes.status}`);
    process.exit(1);
  }
  await ended;

  log('\n=== MESURES PAR QUESTION ===');
  for (const [index, s] of [...stats.entries()].sort((a, b) => a[0] - b[0])) {
    if (index < 0) {
      log(`Compte à rebours : émissions serveur=${s.serverEmits} | livraisons=${s.deliveries}`);
      continue;
    }
    const close =
      s.revealAtConsole !== null && s.revealDeadline !== null
        ? `${s.revealAtConsole - s.revealDeadline} ms`
        : 'n/a';
    const fanOut =
      s.firstPlayerReveal !== null && s.lastPlayerReveal !== null
        ? `${s.lastPlayerReveal - s.firstPlayerReveal} ms`
        : 'n/a';
    log(
      `Q${index + 1}: émissions serveur=${s.serverEmits} | livraisons clients (mobiles + console)=${s.deliveries} | clôture (échéance+${TOLERANCE_MS} ms → révélation console)=${close} | étalement révélation mobiles=${fanOut}`,
    );
    log(`    ${JSON.stringify(s.serverEmitsByEvent)}`);
  }

  log('\nCleaning up...');
  for (const p of players) p.socket.disconnect();
  consoleSocket.disconnect();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await prisma.$disconnect();
  log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
