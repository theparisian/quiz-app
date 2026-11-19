import {
  MAX_GAMES_PER_SCREEN_PROGRAM,
  type CatalogGame,
  type ScreenProgram,
  type ScreenProgramItem,
} from '@quiz-app/validation';
import { estimateGameSeconds } from '@/components/catalog/format';

/**
 * Programmation des salles (C2) : logique pure du programme d'une salle (ajout, retrait,
 * déplacement, règle des 5 jeux) et mise à jour du cache TanStack Query.
 */

export const MAX_GAMES_PER_SCREEN = MAX_GAMES_PER_SCREEN_PROGRAM;
export const PROGRAM_FULL_MESSAGE = '5 jeux maximum par salle';

export type ProgramChange =
  | { kind: 'add'; item: ScreenProgramItem }
  | { kind: 'remove'; gameSlug: string }
  | { kind: 'move'; from: number; to: number };

export type ProgramChangeResult =
  | { ok: true; items: ScreenProgramItem[] }
  | { ok: false; reason: 'full' | 'duplicate' | 'noop' };

/** Applique un changement au programme d'une salle, sans le modifier (5 jeux au plus). */
export function applyProgramChange(
  items: ScreenProgramItem[],
  change: ProgramChange,
): ProgramChangeResult {
  switch (change.kind) {
    case 'add': {
      if (items.some((i) => i.gameSlug === change.item.gameSlug)) {
        return { ok: false, reason: 'duplicate' };
      }
      if (items.length >= MAX_GAMES_PER_SCREEN) return { ok: false, reason: 'full' };
      return { ok: true, items: [...items, change.item] };
    }
    case 'remove': {
      const next = items.filter((i) => i.gameSlug !== change.gameSlug);
      return next.length === items.length
        ? { ok: false, reason: 'noop' }
        : { ok: true, items: next };
    }
    case 'move': {
      const { from, to } = change;
      if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
        return { ok: false, reason: 'noop' };
      }
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return { ok: true, items: next };
    }
  }
}

/** Liste des salles avec le programme de `screenId` remplacé par `items`. */
export function withScreenItems(
  programs: ScreenProgram[],
  screenId: string,
  items: ScreenProgramItem[],
): ScreenProgram[] {
  return programs.map((p) => (p.screenId === screenId ? { ...p, items } : p));
}

/** Liste des salles avec la salle renvoyée par l'API à la place de l'ancienne. */
export function withScreenProgram(
  programs: ScreenProgram[],
  program: ScreenProgram,
): ScreenProgram[] {
  return programs.map((p) => (p.screenId === program.screenId ? program : p));
}

export function isProgramFull(items: ScreenProgramItem[]): boolean {
  return items.length >= MAX_GAMES_PER_SCREEN;
}

/** Jeu du catalogue mis au programme (disponible par définition). */
export function programItemFromCatalog(game: CatalogGame): ScreenProgramItem {
  return {
    gameSlug: game.slug,
    title: game.title,
    tagline: game.tagline,
    coverImageUrl: game.coverImageUrl,
    engineKey: game.engineKey,
    kind: game.kind,
    sponsorName: game.sponsor?.name ?? null,
    durationEstimateSeconds: game.durationEstimateSeconds,
    available: true,
  };
}

/** Données de carte d'un jeu du programme, pour ouvrir sa fiche (game-detail-drawer). */
export function catalogGameFromProgramItem(item: ScreenProgramItem): CatalogGame {
  return {
    slug: item.gameSlug,
    title: item.title,
    tagline: item.tagline,
    coverImageUrl: item.coverImageUrl,
    engineKey: item.engineKey,
    kind: item.kind,
    sponsor: item.sponsorName ? { name: item.sponsorName, logoUrl: null } : null,
    durationEstimateSeconds: item.durationEstimateSeconds,
    tags: [],
  };
}

/** Durée totale estimée des jeux qui seront lancés (les jeux retirés du catalogue sont ignorés). */
export function programDurationSeconds(items: ScreenProgramItem[]): number {
  return items.filter((i) => i.available).reduce((acc, i) => acc + estimateGameSeconds(i), 0);
}

/** Message, en vouvoiement, d'un refus de l'API sur le programme ou son lancement. */
export function programErrorMessage(err: unknown, context: 'update' | 'launch'): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'GAME_NOT_AVAILABLE':
      return 'Ce jeu n’est plus disponible pour votre cinéma.';
    case 'VALIDATION_ERROR':
      return PROGRAM_FULL_MESSAGE;
    case 'PROGRAM_EMPTY':
      return 'Aucun jeu disponible à lancer dans cette salle.';
    case 'SCREEN_HAS_ACTIVE_SESSION':
      return 'Une session est déjà en cours dans cette salle.';
    case 'SCREEN_NOT_ACTIVE':
      return 'Cette salle est désactivée.';
    case 'FORBIDDEN':
      return 'Vous n’avez pas les droits pour cette action.';
    default:
      return context === 'launch'
        ? 'La session n’a pas pu être lancée. Réessayez dans un instant.'
        : 'La modification n’a pas pu être enregistrée. Réessayez dans un instant.';
  }
}
