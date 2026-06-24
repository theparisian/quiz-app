import type { Server } from 'socket.io';
import { readLobbyTimerConfig, type LobbyTimerConfig } from '@quiz-app/validation';
import { prisma } from '../../shared/db/index.js';
import { logger } from '../../shared/logger/index.js';
import { logEvent } from '../../shared/events/event-log.service.js';
import { getOrchestrator } from './session-orchestrator.service.js';

const BROADCAST_INTERVAL_MS = 1000;
const SESSION_NAMESPACES = ['/player', '/console', '/mobile'] as const;

interface LobbyTimerState {
  sessionId: bigint;
  config: LobbyTimerConfig;
  deadlineAt: number;
  reduced: boolean;
  interval: ReturnType<typeof setInterval> | null;
}

const lobbyTimers = new Map<string, LobbyTimerState>();

let ioInstance: Server | null = null;

export function setLobbyTimerIo(io: Server): void {
  ioInstance = io;
}

function key(sessionId: bigint): string {
  return sessionId.toString();
}

function broadcast(sessionId: bigint, remainingMs: number): void {
  if (!ioInstance) return;
  const room = `session:${sessionId}`;
  const payload = { remainingMs };
  for (const ns of SESSION_NAMESPACES) {
    ioInstance.of(ns).to(room).emit('session:lobby_timer_update', payload);
  }
}

function computeRemainingMs(state: LobbyTimerState): number {
  return Math.max(0, state.deadlineAt - Date.now());
}

/** Compte à rebours expiré : on lance la session automatiquement. */
async function fireAutoStart(sessionId: bigint): Promise<void> {
  clearLobbyTimer(sessionId);
  try {
    await getOrchestrator().start(sessionId);
    logger.info({ sessionId: sessionId.toString() }, 'Lobby timer auto-started session');
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { screen: { select: { cinemaId: true } } },
    });
    if (session) {
      logEvent({
        level: 'info',
        eventType: 'session.lobby_auto_started',
        sessionId,
        cinemaId: session.screen.cinemaId,
        payload: {},
      });
    }
  } catch (err) {
    // Transition impossible (déjà lancée/annulée) ou quiz vide : on logge sans casser.
    logger.warn({ err, sessionId: sessionId.toString() }, 'Lobby timer auto-start skipped');
  }
}

function scheduleInterval(state: LobbyTimerState): void {
  if (state.interval) clearInterval(state.interval);
  state.interval = setInterval(() => {
    const remaining = computeRemainingMs(state);
    broadcast(state.sessionId, remaining);
    if (remaining <= 0) {
      void fireAutoStart(state.sessionId);
    }
  }, BROADCAST_INTERVAL_MS);
}

/**
 * Démarre le compte à rebours d'un lobby si la config quiz l'active.
 * No-op si déjà démarré ou si le timer est désactivé.
 */
export function startLobbyTimer(params: {
  sessionId: bigint;
  brandingJson: unknown;
  createdAt: Date;
  currentPlayers: number;
}): void {
  const config = readLobbyTimerConfig(params.brandingJson);
  if (!config.enabled) return;
  if (lobbyTimers.has(key(params.sessionId))) return;

  // Deadline déterministe basée sur createdAt → survit à un redémarrage serveur.
  let deadlineAt = params.createdAt.getTime() + config.durationMinutes * 60_000;
  let reduced = false;

  if (params.currentPlayers >= config.autoStartPlayerThreshold) {
    deadlineAt = Math.min(deadlineAt, Date.now() + config.reducedDurationMinutes * 60_000);
    reduced = true;
  }

  const state: LobbyTimerState = {
    sessionId: params.sessionId,
    config,
    deadlineAt,
    reduced,
    interval: null,
  };
  lobbyTimers.set(key(params.sessionId), state);

  broadcast(params.sessionId, computeRemainingMs(state));

  if (computeRemainingMs(state) <= 0) {
    void fireAutoStart(params.sessionId);
    return;
  }
  scheduleInterval(state);

  logger.info(
    {
      sessionId: params.sessionId.toString(),
      durationMinutes: config.durationMinutes,
      reduced,
    },
    'Lobby timer started',
  );
}

/**
 * À appeler quand un joueur rejoint un lobby : abaisse l'attente si le seuil est atteint.
 * On ne rallonge jamais le temps restant.
 */
export function notifyLobbyPlayerJoined(sessionId: bigint, currentPlayers: number): void {
  const state = lobbyTimers.get(key(sessionId));
  if (!state || state.reduced) return;
  if (currentPlayers < state.config.autoStartPlayerThreshold) return;

  const reducedDeadline = Date.now() + state.config.reducedDurationMinutes * 60_000;
  if (reducedDeadline < state.deadlineAt) {
    state.deadlineAt = reducedDeadline;
  }
  state.reduced = true;

  broadcast(sessionId, computeRemainingMs(state));
  if (computeRemainingMs(state) <= 0) {
    void fireAutoStart(sessionId);
    return;
  }
  scheduleInterval(state);

  logger.info(
    { sessionId: sessionId.toString(), currentPlayers },
    'Lobby timer reduced after player threshold reached',
  );
}

/** Temps restant avant lancement auto, ou null si aucun timer actif. */
export function getLobbyTimerRemainingMs(sessionId: bigint): number | null {
  const state = lobbyTimers.get(key(sessionId));
  if (!state) return null;
  return computeRemainingMs(state);
}

/** Stoppe et oublie le timer d'un lobby (lancement manuel, abandon, etc.). */
export function clearLobbyTimer(sessionId: bigint): void {
  const state = lobbyTimers.get(key(sessionId));
  if (!state) return;
  if (state.interval) clearInterval(state.interval);
  lobbyTimers.delete(key(sessionId));
}

/** Reconstruit les timers de lobby au démarrage du serveur. */
export async function rehydrateLobbyTimers(): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { state: 'lobby' },
    select: {
      id: true,
      createdAt: true,
      quiz: { select: { brandingJson: true } },
      _count: { select: { players: { where: { status: 'active' } } } },
    },
  });

  for (const s of sessions) {
    startLobbyTimer({
      sessionId: s.id,
      brandingJson: s.quiz.brandingJson,
      createdAt: s.createdAt,
      currentPlayers: s._count.players,
    });
  }

  if (sessions.length > 0) {
    logger.info({ count: sessions.length }, 'Rehydrated lobby timers on boot');
  }
}

/** Nettoyage entre tests d'intégration. */
export function resetLobbyTimersForTests(): void {
  if (process.env.NODE_ENV !== 'test') return;
  for (const state of lobbyTimers.values()) {
    if (state.interval) clearInterval(state.interval);
  }
  lobbyTimers.clear();
}
