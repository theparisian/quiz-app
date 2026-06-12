import { prisma } from '../../shared/db/index.js';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';

function pick(chars: string, random: () => number): string {
  return chars[Math.floor(random() * chars.length)]!;
}

export function formatShortCode(letters: string, digits: string): string {
  return `${letters}-${digits}`;
}

export function generateShortCode(random: () => number = Math.random): string {
  const l = pick(LETTERS, random) + pick(LETTERS, random) + pick(LETTERS, random);
  const d = pick(DIGITS, random) + pick(DIGITS, random) + pick(DIGITS, random);
  return formatShortCode(l, d);
}

export async function generateUniqueShortCode(random: () => number = Math.random): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateShortCode(random);
    const existing = await prisma.prize.findUnique({
      where: { shortCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error('SHORT_CODE_GENERATION_FAILED');
}

export function normalizeShortCodeInput(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== 6) return raw.toUpperCase().trim();
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
}
