import { containsBadWord } from './moderation/bad-words.js';

const BASES = [
  'Popcorn',
  'Clap',
  'Spoiler',
  'Cameo',
  'Projo',
  'Ticket',
  'Strapontin',
  'Rideau',
  'Casting',
  'Decor',
  'Zoom',
  'Plan',
  'Scenario',
  'Figurant',
  'Cadreur',
  'Entracte',
  'Generique',
  'Trailer',
  'Pitch',
  'Studio',
  'Neon',
  'Megaphone',
];

const QUALIFICATIFS = [
  'Furtif',
  'Masque',
  'Ruse',
  'Dore',
  'Cosmique',
  'Epique',
  'Magique',
  'Rebelle',
  'Supreme',
  'Turbo',
  'Ninja',
  'Fantome',
  'Express',
  'Royal',
  'Sauvage',
  'Malin',
  'Discret',
  'Vif',
  'Secret',
  'Geant',
  'Mini',
  'Zen',
];

function normalizeForPseudo(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

function combinePseudo(base: string, qualificatif: string): string {
  return `${normalizeForPseudo(base)}${normalizeForPseudo(qualificatif)}`;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function isExcluded(pseudo: string, excludedLower: Set<string>): boolean {
  return excludedLower.has(pseudo.toLowerCase());
}

function isValidSuggestion(pseudo: string, maxLength: number, excludedLower: Set<string>): boolean {
  if (pseudo.length < 2 || pseudo.length > maxLength) return false;
  if (containsBadWord(pseudo)) return false;
  if (isExcluded(pseudo, excludedLower)) return false;
  return true;
}

function tryWithSuffix(
  base: string,
  qualificatif: string,
  suffix: number,
  maxLength: number,
  excludedLower: Set<string>,
): string | null {
  const stem = combinePseudo(base, qualificatif);
  const candidate = `${stem}${suffix}`;
  if (candidate.length > maxLength) return null;
  if (!isValidSuggestion(candidate, maxLength, excludedLower)) return null;
  return candidate;
}

function generateOne(
  excludedLower: Set<string>,
  maxLength: number,
  usedLower: Set<string>,
): string | null {
  for (let attempt = 0; attempt < 10; attempt++) {
    const base = pickRandom(BASES);
    const qualificatif = pickRandom(QUALIFICATIFS);
    let candidate = combinePseudo(base, qualificatif);

    if (
      !isValidSuggestion(candidate, maxLength, excludedLower) ||
      usedLower.has(candidate.toLowerCase())
    ) {
      let found = false;
      for (let suffix = 10; suffix <= 99; suffix++) {
        const withSuffix = tryWithSuffix(base, qualificatif, suffix, maxLength, excludedLower);
        if (withSuffix && !usedLower.has(withSuffix.toLowerCase())) {
          candidate = withSuffix;
          found = true;
          break;
        }
      }
      if (!found) continue;
    }

    if (
      isValidSuggestion(candidate, maxLength, excludedLower) &&
      !usedLower.has(candidate.toLowerCase())
    ) {
      return candidate;
    }
  }
  return null;
}

export function generateSuggestions(input: {
  excluded: string[];
  count: number;
  maxLength: number;
}): string[] {
  const excludedLower = new Set(input.excluded.map((p) => p.toLowerCase()));
  const usedLower = new Set<string>();
  const results: string[] = [];

  for (let i = 0; i < input.count; i++) {
    const suggestion = generateOne(excludedLower, input.maxLength, usedLower);
    if (!suggestion) break;
    results.push(suggestion);
    usedLower.add(suggestion.toLowerCase());
  }

  return results;
}
