import { z } from 'zod';

/**
 * Audio du player cinéma (interface A uniquement — jamais de son côté mobile).
 *
 * Point d'extension : pour ajouter un nouveau son, il suffit d'ajouter une entrée
 * dans AUDIO_SLOTS puis d'appeler `playCue('<key>')` au bon endroit du player.
 * Le reste (DB, API, admin, résolution des URLs) est générique.
 */

export const SOUND_KINDS = ['music', 'sfx'] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];

export type AudioSlotKey =
  | 'lobbyMusic'
  | 'gameMusic'
  | 'scoresMusic'
  | 'questionStart'
  | 'answerReveal'
  | 'lastSeconds'
  | 'questionEnd'
  | 'playerAnswered'
  | 'final';

export interface AudioSlotDefinition {
  key: AudioSlotKey;
  /** Type de son attendu : filtre le sélecteur admin et pilote le comportement de lecture. */
  kind: SoundKind;
  label: string;
  description: string;
  /** Phase de l'écran cinéma à laquelle le slot se rattache (regroupement dans l'admin). */
  phase: 'lobby' | 'game' | 'results';
  /** Volume par défaut (0-100) si le super-admin n'en choisit pas. */
  defaultVolume: number;
  /**
   * Son livré avec l'app, utilisé quand aucun son n'est configuré sur le quiz.
   * Chemin servi par apps/player/public.
   */
  builtInUrl: string | null;
}

export const AUDIO_SLOTS: readonly AudioSlotDefinition[] = [
  {
    key: 'lobbyMusic',
    kind: 'music',
    label: 'Musique du lobby',
    description: "Boucle jouée pendant l'attente, tant que le quiz n'a pas démarré.",
    phase: 'lobby',
    defaultVolume: 30,
    builtInUrl: null,
  },
  {
    key: 'gameMusic',
    kind: 'music',
    label: 'Musique de la partie',
    description: 'Boucle jouée pendant les questions et les récaps inter-questions.',
    phase: 'game',
    defaultVolume: 25,
    builtInUrl: null,
  },
  {
    key: 'scoresMusic',
    kind: 'music',
    label: 'Musique du tableau des scores',
    description: 'Boucle jouée sur le podium et le classement final.',
    phase: 'results',
    defaultVolume: 30,
    builtInUrl: null,
  },
  {
    key: 'questionStart',
    kind: 'sfx',
    label: "Ouverture d'une question",
    description: "Joué à l'apparition d'une nouvelle question.",
    phase: 'game',
    defaultVolume: 60,
    builtInUrl: '/sounds/question-start.mp3',
  },
  {
    key: 'answerReveal',
    kind: 'sfx',
    label: "Apparition d'une réponse",
    description:
      'Mini son rejoué à chaque réponse qui apparaît (4 fois, synchronisé sur le décalage visuel).',
    phase: 'game',
    defaultVolume: 45,
    builtInUrl: null,
  },
  {
    key: 'lastSeconds',
    kind: 'sfx',
    label: 'Dernières secondes',
    description:
      "Joué une fois quand le timer passe sous le seuil d'urgence, en même temps que son animation.",
    phase: 'game',
    defaultVolume: 55,
    builtInUrl: null,
  },
  {
    key: 'questionEnd',
    kind: 'sfx',
    label: "Clôture d'une question",
    description: 'Joué au moment où la bonne réponse est révélée.',
    phase: 'game',
    defaultVolume: 60,
    builtInUrl: '/sounds/question-end.mp3',
  },
  {
    key: 'playerAnswered',
    kind: 'sfx',
    label: 'Un joueur a répondu',
    description:
      "Petit son synchronisé avec l'apparition du pseudo du joueur à l'écran. Volontairement très court.",
    phase: 'game',
    defaultVolume: 35,
    builtInUrl: null,
  },
  {
    key: 'final',
    kind: 'sfx',
    label: 'Résultats finaux',
    description: "Joué à l'arrivée sur le podium de fin de partie.",
    phase: 'results',
    defaultVolume: 60,
    builtInUrl: '/sounds/final.mp3',
  },
] as const;

export const AUDIO_SLOT_KEYS = AUDIO_SLOTS.map((s) => s.key) as AudioSlotKey[];

export function getAudioSlot(key: string): AudioSlotDefinition | undefined {
  return AUDIO_SLOTS.find((s) => s.key === key);
}

/** Slots musique concernés par l'option « une seule piste sans interruption ». */
export const CONTINUOUS_MUSIC_SLOTS: readonly AudioSlotKey[] = [
  'lobbyMusic',
  'gameMusic',
  'scoresMusic',
];

/** Durée du fondu enchaîné entre deux musiques (ms). */
export const MUSIC_CROSSFADE_MS = 900;

/** Anti-saturation : nombre max de SFX identiques joués par seconde (rafale de réponses joueurs). */
export const SFX_MAX_PER_SECOND = 6;

// ─── Limites d'upload ─────────────────────────────────────

export const AUDIO_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
] as const;

// ─── Configuration audio d'un quiz (colonne quizzes.audio_config) ───

export const audioSlotAssignmentSchema = z.object({
  /** Id d'un `sounds` (bibliothèque ou son local au quiz). Null = son intégré ou silence. */
  soundId: z.string().min(1).nullable(),
  volume: z.number().int().min(0).max(100),
});

export type AudioSlotAssignment = z.infer<typeof audioSlotAssignmentSchema>;

export const quizAudioConfigSchema = z.object({
  enabled: z.boolean(),
  /** Une seule piste musicale, jouée sans interruption du lobby jusqu'aux scores. */
  continuousMusic: z.boolean(),
  masterVolume: z.number().int().min(0).max(100),
  slots: z.record(z.string(), audioSlotAssignmentSchema),
});

export type QuizAudioConfig = z.infer<typeof quizAudioConfigSchema>;

export function defaultQuizAudioConfig(): QuizAudioConfig {
  const slots: Record<string, AudioSlotAssignment> = {};
  for (const slot of AUDIO_SLOTS) {
    slots[slot.key] = { soundId: null, volume: slot.defaultVolume };
  }
  return { enabled: true, continuousMusic: false, masterVolume: 80, slots };
}

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Lit et normalise `quizzes.audio_config`. Tolérant par construction : un JSON absent,
 * partiel ou corrompu retombe sur les valeurs par défaut plutôt que de casser une session.
 */
export function readQuizAudioConfig(raw: unknown): QuizAudioConfig {
  const config = defaultQuizAudioConfig();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return config;
  const o = raw as Record<string, unknown>;

  if (typeof o.enabled === 'boolean') config.enabled = o.enabled;
  if (typeof o.continuousMusic === 'boolean') config.continuousMusic = o.continuousMusic;
  config.masterVolume = clampVolume(o.masterVolume, config.masterVolume);

  if (o.slots && typeof o.slots === 'object' && !Array.isArray(o.slots)) {
    const slots = o.slots as Record<string, unknown>;
    for (const slot of AUDIO_SLOTS) {
      const entry = slots[slot.key];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const e = entry as Record<string, unknown>;
      config.slots[slot.key] = {
        soundId: typeof e.soundId === 'string' && e.soundId ? e.soundId : null,
        volume: clampVolume(e.volume, slot.defaultVolume),
      };
    }
  }

  return config;
}

// ─── Payload résolu envoyé au player (URLs prêtes à jouer) ───

export const resolvedAudioCueSchema = z.object({
  url: z.string().min(1),
  /**
   * `storage` : fichier uploadé, l'URL doit être résolue contre l'API.
   * `builtin` : son livré dans les assets du player, l'URL est déjà locale.
   */
  source: z.enum(['storage', 'builtin']),
  /** Volume effectif 0..1, master déjà appliqué côté serveur. */
  volume: z.number().min(0).max(1),
  loop: z.boolean(),
});

export const resolvedQuizAudioSchema = z.object({
  enabled: z.boolean(),
  continuousMusic: z.boolean(),
  cues: z.record(z.string(), resolvedAudioCueSchema),
});

export type ResolvedAudioCue = z.infer<typeof resolvedAudioCueSchema>;
export type ResolvedQuizAudio = z.infer<typeof resolvedQuizAudioSchema>;

export const EMPTY_RESOLVED_AUDIO: ResolvedQuizAudio = {
  enabled: false,
  continuousMusic: false,
  cues: {},
};
