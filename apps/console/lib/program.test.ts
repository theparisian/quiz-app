import { describe, expect, it } from 'vitest';
import type { CatalogGame, ScreenProgram, ScreenProgramItem } from '@quiz-app/validation';
import {
  MAX_GAMES_PER_SCREEN,
  applyProgramChange,
  catalogGameFromProgramItem,
  isProgramFull,
  programDurationSeconds,
  programErrorMessage,
  programItemFromCatalog,
  withScreenItems,
  withScreenProgram,
} from './program';

function item(slug: string, extra: Partial<ScreenProgramItem> = {}): ScreenProgramItem {
  return {
    gameSlug: slug,
    title: `Jeu ${slug}`,
    tagline: null,
    coverImageUrl: null,
    engineKey: 'quiz',
    kind: 'internal',
    sponsorName: null,
    durationEstimateSeconds: 120,
    available: true,
    ...extra,
  };
}

function screen(screenId: string, items: ScreenProgramItem[]): ScreenProgram {
  return {
    screenId,
    name: `Salle ${screenId}`,
    capacity: null,
    status: 'active',
    nuc: null,
    activeSession: null,
    items,
  };
}

const slugs = (items: ScreenProgramItem[]) => items.map((i) => i.gameSlug);

describe('applyProgramChange', () => {
  it('adds at the end, refuses duplicates and a 6th game', () => {
    const added = applyProgramChange([item('a')], { kind: 'add', item: item('b') });
    expect(added.ok && slugs(added.items)).toEqual(['a', 'b']);

    expect(applyProgramChange([item('a')], { kind: 'add', item: item('a') })).toEqual({
      ok: false,
      reason: 'duplicate',
    });

    const full = ['1', '2', '3', '4', '5'].map((s) => item(s));
    expect(full).toHaveLength(MAX_GAMES_PER_SCREEN);
    expect(isProgramFull(full)).toBe(true);
    expect(applyProgramChange(full, { kind: 'add', item: item('6') })).toEqual({
      ok: false,
      reason: 'full',
    });
    expect(isProgramFull(full.slice(1))).toBe(false);
  });

  it('removes a game, including one withdrawn from the catalogue', () => {
    const items = [item('a'), item('b', { available: false }), item('c')];
    const removed = applyProgramChange(items, { kind: 'remove', gameSlug: 'b' });
    expect(removed.ok && slugs(removed.items)).toEqual(['a', 'c']);
    expect(applyProgramChange(items, { kind: 'remove', gameSlug: 'z' })).toEqual({
      ok: false,
      reason: 'noop',
    });
    expect(slugs(items)).toEqual(['a', 'b', 'c']);
  });

  it('moves a game without mutating the input', () => {
    const items = [item('a'), item('b'), item('c')];
    const down = applyProgramChange(items, { kind: 'move', from: 0, to: 2 });
    expect(down.ok && slugs(down.items)).toEqual(['b', 'c', 'a']);
    const up = applyProgramChange(items, { kind: 'move', from: 2, to: 0 });
    expect(up.ok && slugs(up.items)).toEqual(['c', 'a', 'b']);
    expect(applyProgramChange(items, { kind: 'move', from: 1, to: 1 }).ok).toBe(false);
    expect(applyProgramChange(items, { kind: 'move', from: 0, to: 3 }).ok).toBe(false);
    expect(slugs(items)).toEqual(['a', 'b', 'c']);
  });
});

describe('optimistic cache update and rollback', () => {
  it('replaces one screen only, and restores the snapshot', () => {
    const before = [screen('1', [item('a')]), screen('2', [item('b')])];
    const optimistic = withScreenItems(before, '1', [item('a'), item('c')]);
    expect(slugs(optimistic[0]!.items)).toEqual(['a', 'c']);
    expect(optimistic[1]).toBe(before[1]);
    // Retour arrière : l'instantané n'a pas été modifié.
    expect(slugs(before[0]!.items)).toEqual(['a']);

    const fromServer = screen('2', [item('b'), item('d')]);
    const settled = withScreenProgram(optimistic, fromServer);
    expect(settled[1]).toBe(fromServer);
    expect(settled[0]).toBe(optimistic[0]);
  });
});

describe('helpers', () => {
  it('converts between catalogue cards and program items', () => {
    const game: CatalogGame = {
      slug: 'g',
      title: 'G',
      tagline: 'Vite !',
      coverImageUrl: null,
      engineKey: 'poll',
      kind: 'sponsored',
      sponsor: { name: 'Pop', logoUrl: 'http://x/l.png' },
      revenue: null,
      durationEstimateSeconds: null,
      tags: ['fun'],
    };
    const programItem = programItemFromCatalog(game);
    expect(programItem).toMatchObject({ gameSlug: 'g', sponsorName: 'Pop', available: true });
    expect(catalogGameFromProgramItem(programItem)).toMatchObject({
      slug: 'g',
      sponsor: { name: 'Pop', logoUrl: null },
      tags: [],
    });
  });

  it('total duration ignores withdrawn games and uses the 5-minute default', () => {
    expect(
      programDurationSeconds([
        item('a', { durationEstimateSeconds: 60 }),
        item('b', { durationEstimateSeconds: null }),
        item('c', { available: false }),
      ]),
    ).toBe(60 + 300);
  });

  it('error messages', () => {
    expect(programErrorMessage({ code: 'VALIDATION_ERROR' }, 'update')).toBe(
      '5 jeux maximum par salle',
    );
    expect(programErrorMessage({ code: 'PROGRAM_EMPTY' }, 'launch')).toContain('Aucun jeu');
    expect(programErrorMessage(new Error('x'), 'launch')).toContain('lancée');
  });
});
