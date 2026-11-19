import type { Prisma } from '@prisma/client';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { logger } from '../../shared/logger/index.js';
import { shapeQuizBackgroundPayload } from '../quizzes/quiz-background.js';
import { resolveQuizAudioPayload } from '../quizzes/quiz-audio.js';
import { assertTransition } from './session-state.service.js';
import { resolvePrizeConfig } from '../prizes/prize-config.service.js';
import { resolvePrizesPayload } from '../prizes/prize-display.service.js';
import { getEngine } from '../games/engine-registry.js';
import { ensureGameForQuiz } from '../games/games.service.js';
import type { RoundEndedPayload, RoundInfo } from '@quiz-app/validation';
import type {
  Audience,
  GameAction,
  GameRound,
  PlayerJoinInfo,
  RoundContext,
  RoundPlayerMeta,
  RoundRestore,
  ScoreAward,
} from '../games/engine.types.js';

/**
 * Plateforme d'exécution des séances : registre en mémoire, cycle de vie (lancement, pause,
 * reprise, abandon, son, fin avec classement et lots), réhydratation au démarrage et
 * construction du RoundContext de la manche active. Ce qui se passe pendant une manche
 * appartient au moteur de jeu (`modules/games/engines/<clé>`).
 */

/** Écriture regroupée de l'ensemble des participants d'une manche. */
const PARTICIPANTS_FLUSH_MS = 1000;

export interface RuntimePlayerMeta {
  pseudo: string;
  avatarUrl: string | null;
}

/** Forme de session_rounds.state_json : partie plateforme + partie moteur. */
interface RoundStateJson {
  platform: { participants: string[] };
  engine: unknown;
}

interface ActiveRound {
  roundId: bigint;
  position: number;
  engineKey: string;
  /** Payload de `round:started`, repris tel quel par les snapshots. */
  info: RoundInfo;
  round: GameRound | null;
  /** round.start() a été appelé : les nouveaux joueurs passent par onPlayerJoined. */
  started: boolean;
  finished: boolean;
  /** Joueurs dont au moins une action a été acceptée pendant la manche (convention 7). */
  participants: Set<string>;
  engineState: unknown;
  participantsFlushHandle: ReturnType<typeof setTimeout> | null;
  /** Écritures de state_json en série, la dernière l'emporte. */
  writeChain: Promise<void>;
  /** Numéro d'ordre des vues, par destinataire. */
  seq: Map<string, number>;
  /** Annule les minuteurs posés par le moteur via ctx.setTimer (filet de dispose()). */
  cancelTimers: () => void;
}

interface RunningSession {
  sessionId: bigint;
  cinemaId: bigint;
  audioMuted: boolean;
  players: Map<string, RoundPlayerMeta>;
  /** Étape courante de la manche (numéro de question du quiz), miroir de current_question_position. */
  progress: number | null;
  active: ActiveRound | null;
}

const runningSessions = new Map<string, RunningSession>();

let ioInstance: Server | null = null;

export function setIoInstance(io: Server) {
  ioInstance = io;
}

function sessionKey(id: bigint): string {
  return id.toString();
}

const AUDIENCE_NAMESPACE: Record<Audience, string> = {
  screen: '/player',
  mobile: '/mobile',
  console: '/console',
};

function broadcastToSession(sessionId: bigint, event: string, payload: unknown) {
  if (!ioInstance) return;
  const room = `session:${sessionId}`;
  ioInstance.of('/player').to(room).emit(event, payload);
  ioInstance.of('/mobile').to(room).emit(event, payload);
  ioInstance.of('/console').to(room).emit(event, payload);
}

/** Clé du compteur `seq` d'un destinataire : une audience, ou un joueur (mobile ciblé). */
function seqKey(audience: Audience, playerId?: bigint | string): string {
  return playerId !== undefined ? `mobile:${playerId}` : audience;
}

function getRunning(sessionId: bigint): RunningSession {
  const rs = runningSessions.get(sessionKey(sessionId));
  if (!rs) throw new AppError('Session not active in memory', 404, 'SESSION_NOT_IN_MEMORY');
  return rs;
}

/** Joueurs actifs d'une session (une seule requête). */
async function loadActivePlayers(sessionId: bigint): Promise<Map<string, RoundPlayerMeta>> {
  const rows = await prisma.player.findMany({
    where: { sessionId, status: 'active' },
    select: { id: true, pseudo: true, avatar: { select: { imageUrl: true } } },
  });
  const players = new Map<string, RoundPlayerMeta>();
  for (const p of rows) {
    players.set(p.id.toString(), {
      pseudo: p.pseudo,
      avatarUrl: p.avatar?.imageUrl ?? null,
      joinedDuringRound: false,
    });
  }
  return players;
}

const ROUND_INCLUDE = {
  game: {
    include: { sponsor: { select: { name: true, logoUrl: true, brandColorPrimary: true } } },
  },
} satisfies Prisma.SessionRoundInclude;
type RoundRow = Prisma.SessionRoundGetPayload<{ include: typeof ROUND_INCLUDE }>;

/**
 * Manche 1 de la séance. Les séances créées hors de `sessionsService.create` (tests, données
 * anciennes) n'en ont pas : on la crée à la volée depuis le quiz de la séance (convention 9).
 */
async function ensureFirstRound(sessionId: bigint, quizId: bigint): Promise<RoundRow> {
  const where = { sessionId_position: { sessionId, position: 1 } };
  const existing = await prisma.sessionRound.findUnique({ where, include: ROUND_INCLUDE });
  if (existing) return existing;
  try {
    return await prisma.$transaction(async (tx) => {
      const game = await ensureGameForQuiz(quizId, tx);
      return tx.sessionRound.create({
        data: { sessionId, position: 1, gameId: game.id },
        include: ROUND_INCLUDE,
      });
    });
  } catch (err) {
    // Création concurrente (lancement et réhydratation simultanés) : la ligne existe déjà.
    const raced = await prisma.sessionRound.findUnique({ where, include: ROUND_INCLUDE });
    if (raced) return raced;
    throw err;
  }
}

function splitRoundState(json: unknown): { participants: string[]; engine: unknown } {
  if (json && typeof json === 'object' && 'platform' in json && 'engine' in json) {
    const s = json as Partial<RoundStateJson>;
    const participants = Array.isArray(s.platform?.participants)
      ? s.platform.participants.filter((p): p is string => typeof p === 'string')
      : [];
    return { participants, engine: s.engine ?? null };
  }
  return { participants: [], engine: null };
}

/** Écrit state_json (plateforme + moteur) ; les écritures d'une manche sont mises en série. */
function writeRoundState(active: ActiveRound): Promise<void> {
  const next = active.writeChain.then(async () => {
    const json: RoundStateJson = {
      platform: { participants: [...active.participants] },
      engine: active.engineState ?? null,
    };
    await prisma.sessionRound.update({
      where: { id: active.roundId },
      data: { stateJson: json as unknown as Prisma.InputJsonValue },
    });
  });
  active.writeChain = next.catch((err: unknown) => {
    logger.error({ err, roundId: active.roundId.toString() }, 'Writing round state failed');
  });
  return next;
}

function clearParticipantsFlush(active: ActiveRound) {
  if (active.participantsFlushHandle) {
    clearTimeout(active.participantsFlushHandle);
    active.participantsFlushHandle = null;
  }
}

function markParticipant(active: ActiveRound, playerId: string) {
  if (active.participants.has(playerId)) return;
  active.participants.add(playerId);
  if (active.participantsFlushHandle || active.finished) return;
  active.participantsFlushHandle = setTimeout(() => {
    active.participantsFlushHandle = null;
    void writeRoundState(active).catch(() => {});
  }, PARTICIPANTS_FLUSH_MS);
}

/** Écrit tout de suite l'ensemble des participants en attente. */
async function flushRoundState(active: ActiveRound): Promise<void> {
  const pending = active.participantsFlushHandle !== null;
  clearParticipantsFlush(active);
  if (pending) await writeRoundState(active).catch(() => {});
  await active.writeChain;
}

function disposeActiveRound(rs: RunningSession) {
  const active = rs.active;
  if (!active) return;
  clearParticipantsFlush(active);
  active.round?.dispose();
  active.cancelTimers();
}

function buildRoundContext(rs: RunningSession, active: ActiveRound): RoundContext {
  const sessionId = rs.sessionId;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  active.cancelTimers = () => {
    for (const handle of timers) clearTimeout(handle);
    timers.clear();
  };
  const nextSeq = (key: string) => {
    const value = (active.seq.get(key) ?? 0) + 1;
    active.seq.set(key, value);
    return value;
  };
  const roundId = active.roundId.toString();

  return {
    sessionId,
    roundId: active.roundId,
    players: {
      ids: () => [...rs.players.keys()],
      has: (id) => rs.players.has(id),
      meta: (id) => rs.players.get(id),
    },
    emitState(audience, view, playerId) {
      // Le seq avance même sans io (tests) : il reste cohérent avec les snapshots.
      const seq = nextSeq(seqKey(audience, playerId));
      if (!ioInstance) return;
      const target = playerId !== undefined ? `player:${playerId}` : `session:${sessionId}`;
      ioInstance.of(AUDIENCE_NAMESPACE[audience]).to(target).emit('game:state', {
        roundId,
        engineKey: active.engineKey,
        seq,
        serverNow: new Date().toISOString(),
        view,
      });
    },
    emitCue(audience, cue, data) {
      if (!ioInstance) return;
      ioInstance
        .of(AUDIENCE_NAMESPACE[audience])
        .to(`session:${sessionId}`)
        .emit('game:cue', data === undefined ? { roundId, cue } : { roundId, cue, data });
    },
    async award(entries: ScoreAward[]) {
      const scored = entries.filter((e) => e.points !== 0);
      if (scored.length === 0) return;
      // Une seule transaction : incréments de Player.scoreTotal (valeur lue partout)
      // et journal des ScoreEvent de la manche.
      await prisma.$transaction([
        ...scored.map((e) =>
          prisma.player.update({
            where: { id: e.playerId },
            data: { scoreTotal: { increment: e.points } },
          }),
        ),
        prisma.scoreEvent.createMany({
          data: scored.map((e) => ({
            sessionId,
            roundId: active.roundId,
            playerId: e.playerId,
            points: e.points,
            reason: e.reason,
            ...(e.meta !== undefined ? { metaJson: e.meta as Prisma.InputJsonValue } : {}),
          })),
        }),
      ]);
    },
    async scores() {
      const ids = [...rs.players.keys()].map((id) => BigInt(id));
      if (ids.length === 0) return new Map();
      const rows = await prisma.player.findMany({
        where: { id: { in: ids }, sessionId, status: 'active' },
        select: { id: true, scoreTotal: true },
      });
      return new Map(rows.map((p) => [p.id.toString(), p.scoreTotal]));
    },
    persistState(json) {
      active.engineState = json;
      return writeRoundState(active);
    },
    async reportProgress(step) {
      rs.progress = step;
      await prisma.session.update({
        where: { id: sessionId },
        data: { currentQuestionPosition: step },
      });
    },
    finish: () => finishRound(rs, active),
    now: () => Date.now(),
    setTimer(ms, fn) {
      const handle = setTimeout(() => {
        timers.delete(handle);
        fn();
      }, ms);
      timers.add(handle);
      return () => {
        clearTimeout(handle);
        timers.delete(handle);
      };
    },
    log: logger.child({
      sessionId: sessionId.toString(),
      roundId: active.roundId.toString(),
      engine: active.engineKey,
    }),
  };
}

/** Crée la manche active (moteur compris) sans la démarrer. */
async function createActiveRound(
  rs: RunningSession,
  row: RoundRow,
  restore?: RoundRestore & { participants: string[] },
): Promise<ActiveRound> {
  const engine = getEngine(row.game.engineKey);
  const totalRounds = await prisma.sessionRound.count({ where: { sessionId: rs.sessionId } });
  const active: ActiveRound = {
    roundId: row.id,
    position: row.position,
    engineKey: engine.key,
    info: {
      roundId: row.id.toString(),
      position: row.position,
      totalRounds: Math.max(totalRounds, row.position),
      engineKey: engine.key,
      game: {
        slug: row.game.slug,
        title: row.game.title,
        kind: row.game.kind,
        sponsor: row.game.sponsor
          ? {
              name: row.game.sponsor.name,
              logoUrl: row.game.sponsor.logoUrl,
              brandColorPrimary: row.game.sponsor.brandColorPrimary,
            }
          : null,
      },
    },
    round: null,
    started: false,
    finished: false,
    participants: new Set(restore?.participants ?? []),
    engineState: restore?.stateJson ?? null,
    participantsFlushHandle: null,
    writeChain: Promise.resolve(),
    seq: new Map(),
    cancelTimers: () => {},
  };
  const ctx = buildRoundContext(rs, active);
  active.round = await engine.createRound(
    ctx,
    { id: row.game.id, configJson: row.game.configJson, quizId: row.game.quizId },
    restore ? { stateJson: restore.stateJson, interruptedAt: restore.interruptedAt } : undefined,
  );
  return active;
}

/** Annonce la manche (`round:started`, avant toute vue) puis la démarre. */
async function startActiveRound(rs: RunningSession, active: ActiveRound) {
  active.started = true;
  broadcastToSession(rs.sessionId, 'round:started', active.info);
  await active.round!.start();
}

/** Classement de fin de manche : joueurs actifs, points marqués pendant la manche. */
async function buildRoundEnded(
  rs: RunningSession,
  active: ActiveRound,
): Promise<RoundEndedPayload> {
  const [players, sums] = await Promise.all([
    prisma.player.findMany({
      where: { sessionId: rs.sessionId, status: 'active' },
      orderBy: [{ scoreTotal: 'desc' }, { joinedAt: 'asc' }],
      select: { id: true, pseudo: true, scoreTotal: true, avatar: { select: { imageUrl: true } } },
    }),
    prisma.scoreEvent.groupBy({
      by: ['playerId'],
      where: { roundId: active.roundId },
      _sum: { points: true },
    }),
  ]);
  const thisRound = new Map(sums.map((s) => [s.playerId.toString(), s._sum.points ?? 0]));
  return {
    roundId: active.info.roundId,
    position: active.info.position,
    totalRounds: active.info.totalRounds,
    scoreboard: players.map((p) => ({
      playerId: p.id.toString(),
      pseudo: p.pseudo,
      avatarUrl: p.avatar?.imageUrl ?? null,
      scoreTotal: p.scoreTotal,
      scoreThisRound: thisRound.get(p.id.toString()) ?? 0,
    })),
  };
}

/** Fin de manche signalée par le moteur (une seule fois). */
async function finishRound(rs: RunningSession, active: ActiveRound): Promise<void> {
  if (active.finished) {
    logger.warn(
      { sessionId: rs.sessionId.toString(), roundId: active.roundId.toString() },
      'Round finish called twice: ignored',
    );
    return;
  }
  active.finished = true;
  active.round?.dispose();
  await flushRoundState(active);
  await prisma.sessionRound.update({
    where: { id: active.roundId },
    data: { state: 'ended', endedAt: new Date() },
  });
  broadcastToSession(rs.sessionId, 'round:ended', await buildRoundEnded(rs, active));
  await advanceOrEnd(rs.sessionId);
}

/**
 * Point d'extension des séances à plusieurs manches (B5) : après la fin d'une manche,
 * lance la suivante ou termine la séance. Une séance n'a qu'une manche pour l'instant.
 */
export async function advanceOrEnd(sessionId: bigint): Promise<void> {
  await endSessionInternal(sessionId);
}

async function endSessionInternal(sessionId: bigint) {
  const key = sessionKey(sessionId);
  const rs = runningSessions.get(key);
  if (rs) disposeActiveRound(rs);

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { screen: { select: { cinemaId: true } } },
  });
  if (!session) return;

  // Fin de partie décidée par le jeu : aussi possible depuis la pause (clôture forcée ou
  // reprise après redémarrage d'une séance en pause).
  if (session.state !== 'ended' && session.state !== 'aborted' && session.state !== 'paused') {
    assertTransition(session.state, 'ended');
  }

  const players = await prisma.player.findMany({
    where: { sessionId, status: 'active' },
    orderBy: [{ scoreTotal: 'desc' }, { joinedAt: 'asc' }],
    include: { avatar: { select: { imageUrl: true } } },
  });

  if (players.length > 0) {
    await prisma.$transaction(
      players.map((p, i) =>
        prisma.player.update({
          where: { id: p.id },
          data: { rankFinal: i + 1 },
        }),
      ),
    );
  }

  const winnerId = players[0]?.id ?? null;

  const endedAt = new Date();
  const durationMs =
    session.startedAt !== null ? endedAt.getTime() - session.startedAt.getTime() : 0;

  await prisma.$transaction([
    prisma.session.update({
      where: { id: sessionId },
      data: {
        state: 'ended',
        endedAt,
        winnerPlayerId: winnerId,
        currentQuestionStartedAt: null,
        currentQuestionPausedAt: null,
      },
    }),
    prisma.sessionRound.updateMany({
      where: { sessionId, state: { in: ['pending', 'running'] } },
      data: { state: 'ended', endedAt },
    }),
  ]);

  const finalScoreboard = players.map((p, i) => ({
    playerId: p.id.toString(),
    pseudo: p.pseudo,
    avatarUrl: p.avatar?.imageUrl ?? null,
    scoreTotal: p.scoreTotal,
    rank: i + 1,
  }));

  const prizeAvailabilityByRank: Record<string, boolean> = {};
  for (const rank of [1, 2, 3] as const) {
    const cfg = await resolvePrizeConfig(sessionId, rank);
    prizeAvailabilityByRank[`rank${rank}`] = cfg !== null;
  }

  const prizes = await resolvePrizesPayload(sessionId);

  broadcastToSession(sessionId, 'session:ended', {
    finalScoreboard,
    winnerPlayerId: winnerId?.toString() ?? null,
    prizeAvailabilityByRank,
    ...(prizes ? { prizes } : {}),
  });

  broadcastToSession(sessionId, 'session:state_changed', {
    sessionId: sessionId.toString(),
    oldState: session.state,
    newState: 'ended',
  });

  runningSessions.delete(key);

  logger.info(
    { sessionId: sessionId.toString(), winnerId: winnerId?.toString() ?? null },
    'Session ended',
  );

  logEvent({
    level: 'info',
    eventType: 'session.ended',
    sessionId,
    cinemaId: session.screen.cinemaId,
    payload: {
      winnerPlayerId: winnerId?.toString() ?? null,
      totalPlayers: players.length,
      durationMs,
    },
  });
}

type RehydrateSessionRow = Prisma.SessionGetPayload<{
  include: { screen: { select: { cinemaId: true } } };
}>;

async function rehydrateSession(session: RehydrateSessionRow) {
  const sessionId = session.id;
  const row = await ensureFirstRound(sessionId, session.quizId);

  if (row.state === 'ended' || row.state === 'skipped') {
    // Arrêt entre la fin de la manche et la fin de la séance : on termine la séance.
    await advanceOrEnd(sessionId);
    return;
  }

  const rs: RunningSession = {
    sessionId,
    cinemaId: session.screen.cinemaId,
    audioMuted: session.audioMuted,
    players: await loadActivePlayers(sessionId),
    progress: session.currentQuestionPosition,
    active: null,
  };
  const { participants, engine } = splitRoundState(row.stateJson);
  const active = await createActiveRound(rs, row, {
    stateJson: engine,
    interruptedAt: new Date(),
    participants,
  });
  rs.active = active;

  if (row.state === 'pending') {
    await prisma.sessionRound.update({
      where: { id: row.id },
      data: { state: 'running', startedAt: session.startedAt ?? new Date() },
    });
  }

  runningSessions.set(sessionKey(sessionId), rs);

  // Séance en pause : la manche reprend en pause (une question interrompue est tout de même
  // close et notée), la suite attend la reprise par le projectionniste.
  if (session.state === 'paused') await active.round!.pause();
  await startActiveRound(rs, active);
}

/** Reconstruit en mémoire les séances interrompues par un redémarrage du serveur. */
export async function rehydrateRunningSessions(): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { state: { in: ['running', 'paused'] } },
    include: { screen: { select: { cinemaId: true } } },
  });

  logger.info({ count: sessions.length }, 'Rehydrating sessions on boot');

  for (const session of sessions) {
    try {
      await rehydrateSession(session);
    } catch (err) {
      runningSessions.delete(sessionKey(session.id));
      logger.error({ err, sessionId: session.id.toString() }, 'Rehydrate session failed');
      logEvent({
        level: 'critical',
        eventType: 'server.boot_recovery_anomaly',
        sessionId: session.id,
        cinemaId: session.screen.cinemaId,
        payload: {
          detail: 'rehydrate_exception',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
}

/**
 * Action d'un joueur sur la manche active. Aucun `await` avant l'appel au moteur : la
 * réservation synchrone du moteur reste atomique. Un joueur exclu ou parti est refusé.
 */
function handleAction(
  sessionId: bigint,
  playerId: bigint,
  action: GameAction,
  expectedRoundId?: bigint,
): Promise<unknown> {
  const rs = runningSessions.get(sessionKey(sessionId));
  if (!rs) {
    return Promise.reject(
      new AppError('Session not active in memory', 404, 'SESSION_NOT_IN_MEMORY'),
    );
  }
  const active = rs.active;
  if (!active?.round || !active.started || active.finished) {
    return Promise.reject(new AppError('No active round', 409, 'NO_ACTIVE_ROUND'));
  }
  if (expectedRoundId !== undefined && expectedRoundId !== active.roundId) {
    return Promise.reject(new AppError('Wrong round', 409, 'WRONG_ROUND'));
  }
  const pid = playerId.toString();
  if (!rs.players.has(pid)) {
    return Promise.reject(new AppError('Player not in session', 403, 'PLAYER_NOT_IN_SESSION'));
  }
  return active.round.onAction(playerId, action).then((result) => {
    markParticipant(active, pid);
    return result;
  });
}

export function getSessionRuntime() {
  return {
    async start(sessionId: bigint) {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          screen: { select: { cinemaId: true } },
          quiz: { include: { questions: { select: { id: true } } } },
        },
      });
      if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');

      assertTransition(session.state, 'running');

      const row = await ensureFirstRound(sessionId, session.quizId);
      const rs: RunningSession = {
        sessionId,
        cinemaId: session.screen.cinemaId,
        audioMuted: false,
        players: new Map(),
        progress: null,
        active: null,
      };
      // Le moteur charge son contenu et refuse un jeu vide (QUIZ_EMPTY) avant tout changement.
      const active = await createActiveRound(rs, row);
      rs.active = active;

      const startedAt = new Date();
      await prisma.$transaction([
        prisma.session.update({
          where: { id: sessionId },
          data: {
            state: 'running',
            startedAt,
            currentQuestionStartedAt: null,
            currentQuestionPausedAt: null,
            audioMuted: false,
          },
        }),
        prisma.sessionRound.update({
          where: { id: row.id },
          data: { state: 'running', startedAt },
        }),
      ]);

      // Enregistrée avant la lecture des joueurs : un retardataire arrivé entre-temps est
      // ajouté par addPlayer, les autres par la lecture ci-dessous.
      runningSessions.set(sessionKey(sessionId), rs);
      for (const [id, meta] of await loadActivePlayers(sessionId)) {
        if (!rs.players.has(id)) rs.players.set(id, meta);
      }

      const totalQuestions = session.quiz.questions.length;
      broadcastToSession(sessionId, 'session:started', {
        sessionId: sessionId.toString(),
        quiz: shapeQuizBackgroundPayload(session.quiz),
        audio: await resolveQuizAudioPayload(session.quiz),
      });

      broadcastToSession(sessionId, 'session:state_changed', {
        sessionId: sessionId.toString(),
        oldState: 'lobby',
        newState: 'running',
      });

      logger.info({ sessionId: sessionId.toString() }, 'Session started');

      logEvent({
        level: 'info',
        eventType: 'session.started',
        sessionId,
        cinemaId: session.screen.cinemaId,
        payload: { totalQuestions },
      });

      await startActiveRound(rs, active);
    },

    async pauseSession(sessionId: bigint) {
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
      assertTransition(session.state, 'paused');

      const rs = getRunning(sessionId);
      await rs.active?.round?.pause();

      await prisma.session.update({
        where: { id: sessionId },
        data: { state: 'paused' },
      });

      broadcastToSession(sessionId, 'session:paused', {
        sessionId: sessionId.toString(),
      });
      broadcastToSession(sessionId, 'session:state_changed', {
        sessionId: sessionId.toString(),
        oldState: 'running',
        newState: 'paused',
      });

      logger.info({ sessionId: sessionId.toString() }, 'Session paused');
    },

    async resumeSession(sessionId: bigint) {
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
      assertTransition(session.state, 'running');

      const rs = getRunning(sessionId);
      await rs.active?.round?.resume();

      await prisma.session.update({
        where: { id: sessionId },
        data: { state: 'running', currentQuestionPausedAt: null },
      });

      broadcastToSession(sessionId, 'session:resumed', {
        sessionId: sessionId.toString(),
      });
      broadcastToSession(sessionId, 'session:state_changed', {
        sessionId: sessionId.toString(),
        oldState: 'paused',
        newState: 'running',
      });

      logger.info({ sessionId: sessionId.toString() }, 'Session resumed');
    },

    /** Fait avancer la manche (quiz : clôt la question en cours). */
    async forceAdvance(sessionId: bigint) {
      const rs = getRunning(sessionId);
      await rs.active?.round?.forceAdvance();
    },

    async abortSession(sessionId: bigint, reason?: string) {
      const key = sessionKey(sessionId);
      const rs = runningSessions.get(key);
      if (rs) {
        disposeActiveRound(rs);
        runningSessions.delete(key);
        if (rs.active) await flushRoundState(rs.active);
      }

      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { screen: { select: { cinemaId: true } } },
      });
      if (!session) throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');

      assertTransition(session.state, 'aborted');

      await prisma.$transaction([
        prisma.session.update({
          where: { id: sessionId },
          data: {
            state: 'aborted',
            endedAt: new Date(),
            currentQuestionStartedAt: null,
            currentQuestionPausedAt: null,
          },
        }),
        prisma.sessionRound.updateMany({
          where: { sessionId, state: { in: ['pending', 'running'] } },
          data: { state: 'skipped' },
        }),
      ]);

      broadcastToSession(sessionId, 'session:aborted', { reason: reason ?? null });
      broadcastToSession(sessionId, 'session:state_changed', {
        sessionId: sessionId.toString(),
        oldState: session.state,
        newState: 'aborted',
      });

      logger.info(
        { sessionId: sessionId.toString(), reason: reason ?? null },
        'Session aborted via runtime',
      );

      logEvent({
        level: 'error',
        eventType: 'session.aborted',
        sessionId,
        cinemaId: session.screen.cinemaId,
        payload: { reason: reason ?? null },
      });
    },

    async toggleMute(sessionId: bigint): Promise<boolean> {
      const rs = getRunning(sessionId);
      rs.audioMuted = !rs.audioMuted;
      await prisma.session.update({
        where: { id: sessionId },
        data: { audioMuted: rs.audioMuted },
      });
      broadcastToSession(sessionId, 'session:audio_muted', { muted: rs.audioMuted });
      return rs.audioMuted;
    },

    handleAction,

    /**
     * Ajoute un joueur à la partie en cours (retardataire, ou reprise d'un joueur reparti).
     * Sans effet si la séance n'est pas en mémoire ou si le joueur y est déjà.
     */
    addPlayer(
      sessionId: bigint,
      playerId: bigint,
      meta: RuntimePlayerMeta,
      info: PlayerJoinInfo,
    ): void {
      const rs = runningSessions.get(sessionKey(sessionId));
      if (!rs) return;
      const pid = playerId.toString();
      if (rs.players.has(pid)) return;
      rs.players.set(pid, { ...meta, joinedDuringRound: !info.rejoin });
      const active = rs.active;
      if (active?.round && active.started && !active.finished) {
        active.round.onPlayerJoined(playerId, info);
      }
    },

    /** Retire un joueur exclu ou parti : il ne peut plus agir ni être noté. */
    removePlayer(sessionId: bigint, playerId: bigint): void {
      runningSessions.get(sessionKey(sessionId))?.players.delete(playerId.toString());
    },

    hasPlayer(sessionId: bigint, playerId: bigint): boolean {
      return runningSessions.get(sessionKey(sessionId))?.players.has(playerId.toString()) ?? false;
    },

    /** Étape courante de la manche active (numéro de question du quiz), ou null. */
    getProgress(sessionId: bigint): number | null {
      return runningSessions.get(sessionKey(sessionId))?.progress ?? null;
    },

    getActiveRound(sessionId: bigint): GameRound | undefined {
      return runningSessions.get(sessionKey(sessionId))?.active?.round ?? undefined;
    },

    /**
     * Champs de manche d'un `session:state_snapshot` (règle 5) : la manche active, la vue
     * courante du destinataire (`round.snapshot`) et le `seq` de sa dernière vue émise.
     */
    roundSnapshot(sessionId: bigint, audience: Audience, playerId?: bigint): RoundSnapshotFields {
      const active = runningSessions.get(sessionKey(sessionId))?.active;
      if (!active?.round || !active.started || active.finished) {
        return { round: null, gameView: null, gameSeq: 0 };
      }
      return {
        round: active.info,
        gameView: active.round.snapshot(audience, playerId),
        gameSeq: active.seq.get(seqKey(audience, playerId)) ?? 0,
      };
    },

    isRunning(sessionId: bigint): boolean {
      return runningSessions.has(sessionKey(sessionId));
    },
  };
}

/** Arrête les minuteurs des manches entre tests d'intégration (évite P2025 après truncate). */
export function resetRunningSessionsForTests(): void {
  if (process.env.NODE_ENV !== 'test') return;
  for (const rs of runningSessions.values()) {
    disposeActiveRound(rs);
  }
  runningSessions.clear();
}

export type SessionRuntime = ReturnType<typeof getSessionRuntime>;

export interface RoundSnapshotFields {
  round: RoundInfo | null;
  gameView: unknown;
  gameSeq: number;
}
