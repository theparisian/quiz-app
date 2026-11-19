import type { Logger } from 'pino';

/**
 * Interface entre la plateforme (session, joueurs, pause, classement, lots, reprise) et un moteur
 * de jeu (ce qui se passe pendant une manche).
 *
 * Règles pour un moteur :
 * - il n'importe ni `socket.io` ni l'instance `io` ;
 * - il ne lit ni n'écrit `sessions` ou `players` (tout passe par le `RoundContext`) ;
 * - il peut lire son propre contenu et écrire ses propres tables de détail ;
 * - il n'a aucun état global de module : tout vit dans l'instance de manche.
 */

export type Audience = 'screen' | 'mobile' | 'console';

export interface RoundPlayerMeta {
  pseudo: string;
  avatarUrl: string | null;
  /** Le joueur est arrivé après le début de la manche. */
  joinedDuringRound: boolean;
}

export interface ScoreAward {
  playerId: bigint;
  points: number;
  reason: string;
  meta?: unknown;
}

/** Annule un minuteur posé par `RoundContext.setTimer`. */
export type CancelTimer = () => void;

export interface RoundContext {
  sessionId: bigint;
  roundId: bigint;
  /** Joueurs actifs de la manche. Un joueur exclu ou parti n'y est plus. */
  players: {
    ids(): string[];
    has(id: string): boolean;
    meta(id: string): RoundPlayerMeta | undefined;
  };
  /**
   * Vue complète pour une audience (`game:state`). Avec playerId : vers ce seul joueur
   * (audience 'mobile', room `player:<id>`). La plateforme ajoute `seq` (par destinataire) et
   * `serverNow`. La vue doit être exactement ce que `snapshot(audience, playerId)` renverrait.
   */
  emitState(audience: Audience, view: unknown, playerId?: bigint): void;
  /** Signal éphémère sans état (son, animation), vers la room de la séance de l'audience. */
  emitCue(audience: Audience, cue: string, data?: unknown): void;
  /**
   * Écrit les ScoreEvent et incrémente Player.scoreTotal, dans une seule transaction.
   * Les entrées à 0 point sont ignorées.
   */
  award(entries: ScoreAward[]): Promise<void>;
  /** Score total (Player.scoreTotal) des joueurs actifs de la manche, par id. */
  scores(): Promise<Map<string, number>>;
  /** Persiste l'état du moteur (session_rounds.state_json, partie moteur). */
  persistState(json: unknown): Promise<void>;
  /**
   * Étape courante de la manche (numéro de question pour le quiz), ou null avant la première.
   * Sert aux listes de séances et à `players.joined_question_position` (rapports).
   */
  reportProgress(step: number | null): Promise<void>;
  /** Fin de manche. Appelé une seule fois ; un second appel est ignoré. */
  finish(): Promise<void>;
  /** Horloge injectable (tests). */
  now(): number;
  /** Minuteur injectable (tests). Tous les délais du moteur passent par ici. */
  setTimer(ms: number, fn: () => void): CancelTimer;
  log: Logger;
}

export interface GameAction {
  type: string;
  payload: unknown;
}

export interface PlayerJoinInfo {
  /**
   * true : le joueur revient (reprise après un départ), ce n'est pas une nouvelle arrivée.
   * Le quiz ne le bloque pas sur la question en cours (comportement d'avant B2-B4).
   */
  rejoin: boolean;
}

export interface GameRound {
  /**
   * Démarre la manche, ou la reprend après une restauration. Peut être précédé de `pause()`
   * (réhydratation d'une séance en pause) : la manche démarre alors en pause.
   */
  start(): Promise<void>;
  /**
   * Action d'un joueur. Les contrôles et la réservation doivent être synchrones (avant tout
   * `await`). Rejette une AppError (code métier) si l'action est refusée.
   */
  onAction(playerId: bigint, action: GameAction): Promise<unknown>;
  /** Appelé après l'ajout d'un joueur au `RoundContext` en cours de manche. */
  onPlayerJoined(playerId: bigint, info: PlayerJoinInfo): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  forceAdvance(): Promise<void>;
  /** Synchrone : la vue courante. */
  snapshot(audience: Audience, playerId?: bigint): unknown;
  /** Annule tous les minuteurs. La manche ne fait plus rien ensuite. */
  dispose(): void;
}

export interface GameDefinition {
  id: bigint;
  configJson: unknown;
  quizId: bigint | null;
}

export interface RoundRestore {
  /** Partie moteur de session_rounds.state_json (null si jamais persistée). */
  stateJson: unknown;
  interruptedAt: Date;
}

export interface GameEngine {
  key: string;
  createRound(ctx: RoundContext, game: GameDefinition, restore?: RoundRestore): Promise<GameRound>;
}
