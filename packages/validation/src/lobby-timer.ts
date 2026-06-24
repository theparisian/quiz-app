export interface LobbyTimerConfig {
  /** Si false : le projectionniste lance manuellement (aucun compte à rebours). */
  enabled: boolean;
  /** Durée totale d'attente avant lancement automatique (minutes). */
  durationMinutes: number;
  /** Nombre de joueurs à partir duquel on réduit l'attente (jamais < 2). */
  autoStartPlayerThreshold: number;
  /** Attente réduite une fois le seuil de joueurs atteint (minutes). */
  reducedDurationMinutes: number;
}

export const LOBBY_TIMER_LIMITS = {
  durationMinutes: { min: 1, max: 120 },
  autoStartPlayerThreshold: { min: 2, max: 500 },
  reducedDurationMinutes: { min: 1, max: 120 },
} as const;

export const LOBBY_TIMER_DEFAULTS: LobbyTimerConfig = {
  enabled: false,
  durationMinutes: 30,
  autoStartPlayerThreshold: 2,
  reducedDurationMinutes: 5,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

/** Lit et normalise la config du timer de lobby depuis brandingJson.lobbyTimer. */
export function readLobbyTimerConfig(brandingJson: unknown): LobbyTimerConfig {
  if (!brandingJson || typeof brandingJson !== 'object' || Array.isArray(brandingJson)) {
    return { ...LOBBY_TIMER_DEFAULTS };
  }
  const raw = (brandingJson as Record<string, unknown>).lobbyTimer;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...LOBBY_TIMER_DEFAULTS };
  }
  const o = raw as Record<string, unknown>;

  const enabled = typeof o.enabled === 'boolean' ? o.enabled : LOBBY_TIMER_DEFAULTS.enabled;
  const durationMinutes = clampInt(
    o.durationMinutes,
    LOBBY_TIMER_LIMITS.durationMinutes.min,
    LOBBY_TIMER_LIMITS.durationMinutes.max,
    LOBBY_TIMER_DEFAULTS.durationMinutes,
  );
  const autoStartPlayerThreshold = clampInt(
    o.autoStartPlayerThreshold,
    LOBBY_TIMER_LIMITS.autoStartPlayerThreshold.min,
    LOBBY_TIMER_LIMITS.autoStartPlayerThreshold.max,
    LOBBY_TIMER_DEFAULTS.autoStartPlayerThreshold,
  );
  // L'attente réduite ne peut jamais dépasser l'attente totale.
  const reducedDurationMinutes = Math.min(
    durationMinutes,
    clampInt(
      o.reducedDurationMinutes,
      LOBBY_TIMER_LIMITS.reducedDurationMinutes.min,
      LOBBY_TIMER_LIMITS.reducedDurationMinutes.max,
      LOBBY_TIMER_DEFAULTS.reducedDurationMinutes,
    ),
  );

  return { enabled, durationMinutes, autoStartPlayerThreshold, reducedDurationMinutes };
}
