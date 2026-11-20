import { z } from 'zod';

/**
 * Moteur « tower » : la tour de livres. Chaque joueur empile des livres sur son téléphone : un
 * livre glisse de gauche à droite au-dessus de sa tour, un tap le lâche. Un livre mal centré
 * peut faire basculer tout ce qui est au-dessus de lui. La tour la plus haute à la fin gagne.
 *
 * Phases : `countdown` → `build` → `results` → `done`.
 *
 * Physique (tranchée par le serveur, prédite à l'identique par le téléphone avec les fonctions
 * pures de ce fichier) :
 * - unités en centimètres ; x = centre horizontal d'un livre, 0 = milieu du socle ;
 * - un livre i repose sur le livre i - 1 (le socle pour le premier). Il tient si le centre de
 *   gravité de la pile qu'il porte (lui compris) reste au-dessus de son support, avec une marge
 *   de sécurité qui grandit avec la charge : plus il y a de livres, plus l'équilibre est précaire ;
 * - à la première interface qui ne tient pas (en partant du bas), tout ce qui est au-dessus tombe.
 *   Le joueur garde le reste de sa tour et continue.
 *
 * Aucun secret : la suite des livres (tirée d'une graine commune) et les tours sont publiques.
 * Une vue mobile ne contient que la tour du joueur.
 */

export const TOWER_ENGINE_KEY = 'tower';

// ─── Livres ──────────────────────────────────────────────

export const TOWER_BOOK_KINDS = [
  'roman',
  'poche',
  'bd',
  'manga',
  'polar',
  'sf',
  'cuisine',
  'jeunesse',
  'atlas',
  'dictionnaire',
] as const;
export type TowerBookKind = (typeof TOWER_BOOK_KINDS)[number];
export const towerBookKindSchema = z.enum(TOWER_BOOK_KINDS);

export interface TowerBookSpec {
  label: string;
  /** Longueur du livre posé à plat (cm) : sa largeur dans la tour. */
  width: number;
  /** Épaisseur (cm) : ce qu'il ajoute à la hauteur. */
  thickness: number;
  /** Densité relative (masse = largeur × épaisseur × densité). */
  density: number;
  /** Couleur de couverture et couleur du titre sur la tranche. */
  color: string;
  ink: string;
  /** Titre imprimé sur la tranche (placeholder graphique). */
  spine: string;
  /** Fréquence de tirage relative. */
  weight: number;
}

/** Catalogue des livres (visuel provisoire : aplats de couleur et titre sur la tranche). */
export const TOWER_BOOKS: Record<TowerBookKind, TowerBookSpec> = {
  roman: {
    label: 'Roman',
    width: 30,
    thickness: 4.5,
    density: 1,
    color: '#b91c1c',
    ink: '#fde68a',
    spine: 'ROMAN',
    weight: 4,
  },
  poche: {
    label: 'Livre de poche',
    width: 22,
    thickness: 3,
    density: 0.9,
    color: '#f59e0b',
    ink: '#1f2937',
    spine: 'POCHE',
    weight: 4,
  },
  bd: {
    label: 'Bande dessinée',
    width: 36,
    thickness: 2.5,
    density: 1.1,
    color: '#2563eb',
    ink: '#ffffff',
    spine: 'BD',
    weight: 3,
  },
  manga: {
    label: 'Manga',
    width: 24,
    thickness: 3.5,
    density: 0.9,
    color: '#f8fafc',
    ink: '#dc2626',
    spine: 'MANGA',
    weight: 3,
  },
  polar: {
    label: 'Polar',
    width: 28,
    thickness: 5,
    density: 1,
    color: '#111827',
    ink: '#facc15',
    spine: 'POLAR',
    weight: 3,
  },
  sf: {
    label: 'Science-fiction',
    width: 29,
    thickness: 6,
    density: 1,
    color: '#7c3aed',
    ink: '#a5f3fc',
    spine: 'S-F',
    weight: 2,
  },
  cuisine: {
    label: 'Livre de cuisine',
    width: 34,
    thickness: 4,
    density: 1.2,
    color: '#16a34a',
    ink: '#fefce8',
    spine: 'CUISINE',
    weight: 2,
  },
  jeunesse: {
    label: 'Album jeunesse',
    width: 32,
    thickness: 2,
    density: 0.8,
    color: '#ec4899',
    ink: '#ffffff',
    spine: 'JEUNESSE',
    weight: 2,
  },
  atlas: {
    label: 'Atlas',
    width: 40,
    thickness: 5,
    density: 1.3,
    color: '#0e7490',
    ink: '#fef3c7',
    spine: 'ATLAS',
    weight: 1,
  },
  dictionnaire: {
    label: 'Dictionnaire',
    width: 31,
    thickness: 8,
    density: 1.6,
    color: '#78350f',
    ink: '#fcd34d',
    spine: 'DICO',
    weight: 1,
  },
};

/** Largeur du socle (cm), centré en x = 0. */
export const TOWER_BASE_WIDTH = 44;
/** Amplitude du livre qui glisse : son centre va de -TOWER_SLIDE_HALF à +TOWER_SLIDE_HALF (cm). */
export const TOWER_SLIDE_HALF = 30;
/** Marge de sécurité par livre porté (fraction de la demi-largeur du support). */
export const TOWER_LOAD_MARGIN_PER_BOOK = 0.02;
/** Marge de sécurité maximale (fraction de la demi-largeur du support). */
export const TOWER_LOAD_MARGIN_MAX = 0.6;
/** Nombre de concurrents détaillés dans la vue écran (les suivants sont seulement comptés). */
export const TOWER_SCREEN_RACERS = 10;
/** Nombre maximal de lâchers par joueur et par manche (borne des vues). */
export const TOWER_MAX_DROPS = 300;

/** Hachage 32 bits (mulberry32 d'une graine et d'un index) → [0, 1). */
function hash01(seed: number, index: number): number {
  let t = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  t = (t + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

const TOTAL_BOOK_WEIGHT = TOWER_BOOK_KINDS.reduce((s, k) => s + TOWER_BOOKS[k].weight, 0);

/** Le livre n° `index` (0 = premier lâcher) de la manche : même suite pour tous les joueurs. */
export function towerBookAt(seed: number, index: number): TowerBookKind {
  let r = hash01(seed, index) * TOTAL_BOOK_WEIGHT;
  for (const kind of TOWER_BOOK_KINDS) {
    r -= TOWER_BOOKS[kind].weight;
    if (r < 0) return kind;
  }
  return TOWER_BOOK_KINDS[0];
}

/**
 * Durée d'un aller-retour du livre qui glisse (ms) quand la tour compte `books` livres : de plus en
 * plus rapide. Affichage seulement (le serveur ne contrôle que l'amplitude du lâcher).
 */
export function towerSlidePeriodMs(books: number): number {
  return Math.max(1000, 2800 - books * 70);
}

/** Position du livre qui glisse, `elapsedMs` après son apparition (cm, triangle). */
export function towerSlideX(seed: number, index: number, books: number, elapsedMs: number): number {
  const period = towerSlidePeriodMs(books);
  const phase = (elapsedMs / period + hash01(seed ^ 0x5bd1e995, index)) % 1;
  const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
  return tri * TOWER_SLIDE_HALF;
}

// ─── Équilibre ───────────────────────────────────────────

export const towerBookSchema = z.object({
  k: towerBookKindSchema,
  /** Centre horizontal (cm). */
  x: z.number().finite(),
});
export type TowerBook = z.infer<typeof towerBookSchema>;

/** Lâcher arrondi au millimètre (même nombre des deux côtés du réseau). */
export function towerRoundX(x: number): number {
  return Math.round(Math.max(-TOWER_SLIDE_HALF, Math.min(TOWER_SLIDE_HALF, x)) * 10) / 10;
}

function massOf(b: TowerBook): number {
  const s = TOWER_BOOKS[b.k];
  return s.width * s.thickness * s.density;
}

/** Hauteur d'une tour (cm, au dixième). */
export function towerHeight(books: readonly TowerBook[]): number {
  let h = 0;
  for (const b of books) h += TOWER_BOOKS[b.k].thickness;
  return Math.round(h * 10) / 10;
}

export interface TowerInterfaceCheck {
  /** Écart du centre de gravité porté au centre du support (cm, signé). */
  offset: number;
  /** Écart toléré (cm). */
  allowed: number;
  /** offset / allowed : au-delà de 1 en valeur absolue, ça tombe. */
  stress: number;
}

/**
 * Contrôle de chaque interface : l'interface i est celle où le livre i repose sur son support
 * (le livre i - 1, ou le socle). Renvoie un contrôle par livre.
 */
export function towerInterfaces(books: readonly TowerBook[]): TowerInterfaceCheck[] {
  const n = books.length;
  const out: TowerInterfaceCheck[] = new Array<TowerInterfaceCheck>(n);
  let mass = 0;
  let moment = 0;
  for (let i = n - 1; i >= 0; i--) {
    const b = books[i]!;
    const m = massOf(b);
    mass += m;
    moment += m * b.x;
    const com = moment / mass;
    const supportX = i === 0 ? 0 : books[i - 1]!.x;
    const supportHalf = (i === 0 ? TOWER_BASE_WIDTH : TOWER_BOOKS[books[i - 1]!.k].width) / 2;
    const load = n - 1 - i;
    const margin = Math.min(TOWER_LOAD_MARGIN_MAX, TOWER_LOAD_MARGIN_PER_BOOK * load);
    const allowed = supportHalf * (1 - margin);
    const offset = com - supportX;
    out[i] = { offset, allowed, stress: offset / allowed };
  }
  return out;
}

export interface TowerSettleResult {
  /** Ce qui tient debout. */
  books: TowerBook[];
  /** Ce qui est tombé (du bas vers le haut), vide si tout tient. */
  fallen: TowerBook[];
  /** Côté de la chute (-1 gauche, +1 droite), 0 si rien ne tombe. */
  side: -1 | 0 | 1;
  /** Tension maximale de ce qui tient (0 = parfait, proche de 1 = au bord de la chute). */
  stress: number;
}

/** Une tour après un lâcher : la plus basse interface qui lâche fait tomber tout le dessus. */
export function towerSettle(books: readonly TowerBook[]): TowerSettleResult {
  const checks = towerInterfaces(books);
  for (let i = 0; i < checks.length; i++) {
    const c = checks[i]!;
    if (Math.abs(c.offset) > c.allowed) {
      const kept = books.slice(0, i);
      return {
        books: kept,
        fallen: books.slice(i),
        side: c.offset < 0 ? -1 : 1,
        stress: towerStress(kept),
      };
    }
  }
  return { books: [...books], fallen: [], side: 0, stress: maxStress(checks) };
}

function maxStress(checks: TowerInterfaceCheck[]): number {
  let s = 0;
  for (const c of checks) s = Math.max(s, Math.abs(c.stress));
  return s;
}

/** Tension maximale d'une tour (0..1 tant qu'elle tient). */
export function towerStress(books: readonly TowerBook[]): number {
  return maxStress(towerInterfaces(books));
}

// ─── Configuration (games.config_json) ───────────────────

export const towerConfigSchema = z.object({
  /** Compte à rebours avant la construction (s). */
  countdownSeconds: z.number().int().min(3).max(10).default(5),
  /** Durée de la construction (s). */
  durationSeconds: z.number().int().min(20).max(180).default(60),
  /** Durée de l'écran de résultats (s). */
  resultsSeconds: z.number().int().min(3).max(30).default(10),
  /** Points par centimètre de tour debout à la fin. */
  pointsPerCm: z.number().int().min(0).max(100).default(5),
  /** Bonus des trois plus hautes tours. */
  firstPlacePoints: z.number().int().min(0).max(5000).default(300),
  secondPlacePoints: z.number().int().min(0).max(5000).default(200),
  thirdPlacePoints: z.number().int().min(0).max(5000).default(100),
});
export type TowerConfig = z.infer<typeof towerConfigSchema>;
export type TowerConfigInput = z.input<typeof towerConfigSchema>;

/** Durée estimée d'une manche (s). */
export function towerDurationEstimateSeconds(config: TowerConfig): number {
  return config.countdownSeconds + config.durationSeconds + config.resultsSeconds;
}

/** Points d'un joueur en fin de manche (calcul serveur, exporté pour les tests et l'aide). */
export function towerPoints(
  config: TowerConfig,
  result: { heightCm: number; rank: number },
): number {
  if (result.heightCm <= 0) return 0;
  const bonus =
    result.rank === 1
      ? config.firstPlacePoints
      : result.rank === 2
        ? config.secondPlacePoints
        : result.rank === 3
          ? config.thirdPlacePoints
          : 0;
  return Math.round(result.heightCm * config.pointsPerCm) + bonus;
}

// ─── Vues ────────────────────────────────────────────────

export const towerPhaseSchema = z.enum(['countdown', 'build', 'results', 'done']);
export type TowerPhase = z.infer<typeof towerPhaseSchema>;

const towerCommonFields = {
  /** Échéance de la phase (fin du compte à rebours, de la construction, des résultats). */
  endsAt: z.string().datetime().nullable(),
  /** Temps restant figé pendant une pause (remplace `endsAt`). */
  pausedRemainingMs: z.number().int().nonnegative().nullable(),
  /** Durée de la construction (barre de temps). */
  durationMs: z.number().int().positive(),
  countdownMs: z.number().int().positive(),
  /** Graine de la suite des livres (`towerBookAt`). */
  seed: z.number().int().nonnegative(),
  totalPlayers: z.number().int().nonnegative(),
  /** Hauteur de la plus haute tour debout (cm). */
  topHeight: z.number().nonnegative(),
};

const towerBooksSchema = z.array(towerBookSchema).max(TOWER_MAX_DROPS);

/** Un concurrent vu par l'écran et la console (classé : le premier a la plus haute tour). */
export const towerRacerSchema = z.object({
  playerId: z.string(),
  pseudo: z.string(),
  avatarUrl: z.string().nullable(),
  /** Sa tour, du bas vers le haut. */
  books: towerBooksSchema,
  heightCm: z.number().nonnegative(),
  bestHeightCm: z.number().nonnegative(),
  collapses: z.number().int().nonnegative(),
  rank: z.number().int().positive(),
  /** Points de la manche, connus à partir de `results`. */
  points: z.number().int().nonnegative().nullable(),
});
export type TowerRacer = z.infer<typeof towerRacerSchema>;

const racersFields = { racers: z.array(towerRacerSchema) };

/** Vue écran (audience `screen`) et console (audience `console`) : même forme. */
export const towerScreenViewSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('countdown'), ...towerCommonFields }),
  z.object({ phase: z.literal('build'), ...towerCommonFields, ...racersFields }),
  z.object({ phase: z.literal('results'), ...towerCommonFields, ...racersFields }),
  z.object({ phase: z.literal('done'), ...towerCommonFields, ...racersFields }),
]);
export type TowerScreenView = z.infer<typeof towerScreenViewSchema>;

export const towerConsoleViewSchema = towerScreenViewSchema;
export type TowerConsoleView = TowerScreenView;

/** Ce que voit un joueur de sa propre tour. */
export const towerMeSchema = z.object({
  books: towerBooksSchema,
  /** Nombre de livres déjà lâchés (= index du prochain livre de la suite). */
  drops: z.number().int().nonnegative(),
  heightCm: z.number().nonnegative(),
  bestHeightCm: z.number().nonnegative(),
  collapses: z.number().int().nonnegative(),
  /** Rang final (à partir de `results`). */
  rank: z.number().int().positive().nullable(),
  points: z.number().int().nonnegative().nullable(),
});
export type TowerMe = z.infer<typeof towerMeSchema>;

const meField = { me: towerMeSchema };

export const towerMobileViewSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('countdown'), ...towerCommonFields, ...meField }),
  z.object({ phase: z.literal('build'), ...towerCommonFields, ...meField }),
  z.object({ phase: z.literal('results'), ...towerCommonFields, ...meField }),
  z.object({ phase: z.literal('done'), ...towerCommonFields, ...meField }),
]);
export type TowerMobileView = z.infer<typeof towerMobileViewSchema>;

// ─── Action (game:action) ────────────────────────────────

export const TOWER_DROP_ACTION = 'drop';

export const towerDropActionSchema = z.object({
  type: z.literal(TOWER_DROP_ACTION),
  payload: z.object({
    /** Index du livre lâché dans la suite (= `me.drops` connu du téléphone). */
    index: z.number().int().nonnegative().max(TOWER_MAX_DROPS),
    /** Centre du livre au moment du lâcher (cm). */
    x: z.number().finite().min(-TOWER_SLIDE_HALF).max(TOWER_SLIDE_HALF),
  }),
});
export type TowerDropAction = z.infer<typeof towerDropActionSchema>;

/** `result` de l'accusé d'un lâcher accepté. */
export const towerDropResultSchema = z.object({
  heightCm: z.number().nonnegative(),
  /** Livres tombés à ce lâcher (0 = tout tient). */
  fallen: z.number().int().nonnegative(),
  drops: z.number().int().nonnegative(),
});
export type TowerDropResult = z.infer<typeof towerDropResultSchema>;

/** Cue : une tour vient de s'effondrer (au moins `TOWER_COLLAPSE_CUE_MIN` livres à terre). */
export const TOWER_CUES = { collapsed: 'tower_collapsed' } as const;
export const TOWER_COLLAPSE_CUE_MIN = 3;
export const towerCollapsedCueSchema = z.object({
  pseudo: z.string(),
  fallen: z.number().int().positive(),
  heightCm: z.number().nonnegative(),
});
export type TowerCollapsedCue = z.infer<typeof towerCollapsedCueSchema>;

/** Points de la tour : motif des ScoreEvent. */
export const TOWER_SCORE_REASON = 'book_tower';

/** « 1,24 m » ou « 86 cm » */
export function formatTowerHeight(cm: number): string {
  if (cm >= 100) return `${(cm / 100).toFixed(2).replace('.', ',')} m`;
  return `${Math.round(cm)} cm`;
}
