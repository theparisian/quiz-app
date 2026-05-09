import 'dotenv/config';
import { createServer } from 'http';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { buildApp } from '../src/create-app.js';
import { setupSocketGateway } from '../src/shared/sockets/gateway.js';
import {
  rehydrateRunningSessions,
  setIoInstance,
} from '../src/modules/sessions/session-orchestrator.service.js';
import { prisma } from '../src/shared/db/index.js';
import { signJwt } from '../src/shared/auth/jwt.js';

const args = process.argv.slice(2);
function argVal(name: string, def: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1]! : def;
}
const PLAYER_COUNT = parseInt(argVal('players', '5'), 10);
const SPEED = parseFloat(argVal('speed', '1'));
const AUTO = args.includes('--auto') || true;
const QUIZ_SLUG = argVal('quiz', '');
const SCREEN_ID = argVal('screen', '');

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, Math.max(ms / SPEED, 50)));
}

async function main() {
  log('=== Quiz Session Simulator ===');
  log(`Players: ${PLAYER_COUNT} | Speed: ${SPEED}x | Auto: ${AUTO}`);

  process.env.RESULTS_DISPLAY_MS = String(Math.round(8000 / SPEED));
  process.env.COUNTDOWN_MS = String(Math.round(3000 / SPEED));

  const app = buildApp();
  const httpServer = createServer(app);
  const io = setupSocketGateway(httpServer);
  setIoInstance(io);
  app.set('io', io);

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

  let quiz;
  if (QUIZ_SLUG) {
    quiz = await prisma.quiz.findUnique({ where: { slug: QUIZ_SLUG } });
  } else {
    quiz = await prisma.quiz.findFirst({
      where: { status: 'published' },
      orderBy: { createdAt: 'desc' },
    });
  }
  if (!quiz) {
    log('ERROR: No published quiz found. Create and publish one first.');
    process.exit(1);
  }
  log(`Quiz: "${quiz.title}" (${quiz.slug})`);

  let screenId: bigint;
  if (SCREEN_ID) {
    screenId = BigInt(SCREEN_ID);
  } else {
    const screen = await prisma.screen.findFirst({ where: { status: 'active' } });
    if (!screen) {
      log('ERROR: No active screen found.');
      process.exit(1);
    }
    screenId = screen.id;
  }
  log(`Screen ID: ${screenId}`);

  const res = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ quizSlug: quiz.slug, screenId: screenId.toString() }),
  });
  if (!res.ok) {
    const body = await res.text();
    log(`ERROR creating session: ${res.status} ${body}`);
    process.exit(1);
  }
  const session = (await res.json()) as { id: string; slugShort: string; totalQuestions: number };
  log(
    `Session created: code=${session.slugShort} id=${session.id} questions=${session.totalQuestions}`,
  );

  const players: { socket: ClientSocket; id: string; pseudo: string; score: number }[] = [];
  const pseudos = Array.from({ length: PLAYER_COUNT }, (_, i) => `Player_${i + 1}`);

  log(`Connecting ${PLAYER_COUNT} players...`);
  for (const pseudo of pseudos) {
    const socket = ioClient(`${BASE}/mobile`, { transports: ['websocket'] });
    await new Promise<void>((resolve) => socket.on('connect', resolve));

    const joinResult = await new Promise<{ playerId: string; resumeToken: string }>(
      (resolve, reject) => {
        socket.emit(
          'player:join',
          { pseudo, sessionSlugShort: session.slugShort },
          (result: unknown) => {
            const r = result as { playerId?: string; resumeToken?: string; error?: unknown };
            if (r.playerId) resolve(r as { playerId: string; resumeToken: string });
            else reject(new Error(JSON.stringify(r)));
          },
        );

        socket.once('player:join_success', (data: unknown) => {
          resolve(data as { playerId: string; resumeToken: string });
        });

        setTimeout(() => reject(new Error('Join timeout')), 5000);
      },
    );

    players.push({ socket, id: joinResult.playerId, pseudo, score: 0 });
    log(`  ✓ ${pseudo} joined (id=${joinResult.playerId})`);
  }

  log('Starting session...');
  const startRes = await fetch(`${BASE}/api/sessions/${session.id}/start`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  if (!startRes.ok) {
    log(`ERROR starting session: ${startRes.status}`);
    process.exit(1);
  }

  let questionCount = 0;
  const totalQuestions = session.totalQuestions;

  await new Promise<void>((resolve) => {
    const refSocket = players[0]!.socket;

    refSocket.on(
      'session:question_started',
      async (payload: {
        questionPosition: number;
        questionText: string;
        answers: { id: string; position: string; text: string }[];
        timeLimitMs: number;
      }) => {
        questionCount++;
        log(`\n--- Question ${payload.questionPosition} ---`);
        log(`  "${payload.questionText}"`);
        log(`  Answers: ${payload.answers.map((a) => `${a.position}. ${a.text}`).join(' | ')}`);

        if (AUTO) {
          for (const p of players) {
            const answerDelay = Math.random() * Math.min(15000, payload.timeLimitMs * 0.8);
            setTimeout(() => {
              const correct = Math.random() < 0.7;
              const answerIdx = correct ? 0 : Math.floor(Math.random() * payload.answers.length);
              const answer = payload.answers[answerIdx];
              if (!answer) return;

              p.socket.emit('player:submit_answer', {
                questionId: payload.questionPosition.toString(),
                answerId: answer.id,
              });
            }, answerDelay / SPEED);
          }
        }
      },
    );

    refSocket.on(
      'session:question_ended',
      (payload: {
        correctAnswerId: string;
        scoreboard: {
          playerId: string;
          pseudo: string;
          scoreTotal: number;
          scoreThisQuestion: number;
        }[];
      }) => {
        log(`  Correct answer: ${payload.correctAnswerId}`);
        log('  Scores this question:');
        for (const entry of payload.scoreboard.slice(0, 5)) {
          log(`    ${entry.pseudo}: +${entry.scoreThisQuestion} (total: ${entry.scoreTotal})`);
        }
      },
    );

    refSocket.on(
      'session:ended',
      (payload: {
        finalScoreboard: { playerId: string; pseudo: string; scoreTotal: number; rank: number }[];
        winnerPlayerId: string | null;
      }) => {
        log('\n=== SESSION ENDED ===');
        log('Final Scoreboard:');
        for (const entry of payload.finalScoreboard) {
          const marker = entry.playerId === payload.winnerPlayerId ? ' 🏆' : '';
          log(`  #${entry.rank} ${entry.pseudo}: ${entry.scoreTotal} pts${marker}`);
        }
        resolve();
      },
    );

    refSocket.on('session:aborted', (payload: { reason: string | null }) => {
      log(`\n=== SESSION ABORTED === reason: ${payload.reason ?? 'none'}`);
      resolve();
    });
  });

  log('\nCleaning up...');
  for (const p of players) {
    p.socket.disconnect();
  }

  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await prisma.$disconnect();
  log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
