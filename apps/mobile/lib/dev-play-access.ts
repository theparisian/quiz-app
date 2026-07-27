export const DEV_PLAY_PASSWORD = process.env.NEXT_PUBLIC_DEV_PLAY_PASSWORD ?? '';

const STORAGE_KEY = 'dev_play_unlocked';

export function isDevPlayEnabled(): boolean {
  return process.env.NODE_ENV === 'development' || DEV_PLAY_PASSWORD.length > 0;
}

export function devPlayRequiresPassword(): boolean {
  return DEV_PLAY_PASSWORD.length > 0;
}

export function isDevPlayUnlocked(): boolean {
  if (!devPlayRequiresPassword()) return true;
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(STORAGE_KEY) === '1';
}

export function unlockDevPlay(input: string): boolean {
  if (input !== DEV_PLAY_PASSWORD) return false;
  sessionStorage.setItem(STORAGE_KEY, '1');
  return true;
}

export function tryUnlockFromQuery(key: string | null): boolean {
  if (!key) return false;
  return unlockDevPlay(key);
}
