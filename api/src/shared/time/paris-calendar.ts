import { fromZonedTime } from 'date-fns-tz';

const PARIS_TZ = 'Europe/Paris';

/** Instant UTC correspondant au minuit civil « aujourd'hui » à Paris. */
export function startOfTodayParis(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('sv-SE', { timeZone: PARIS_TZ }).format(now);
  return fromZonedTime(`${ymd}T00:00:00`, PARIS_TZ);
}

/** Borne haute exclusive (minuit Paris du lendemain). */
export function endOfTodayParisExclusive(now?: Date): Date {
  return new Date(startOfTodayParis(now).getTime() + 24 * 60 * 60 * 1000);
}

/** Bornes [début, fin) du jour civil parisien contenant `at`. */
export function parisDayRange(at: Date): { start: Date; end: Date } {
  const ymd = new Intl.DateTimeFormat('sv-SE', { timeZone: PARIS_TZ }).format(at);
  const start = fromZonedTime(`${ymd}T00:00:00`, PARIS_TZ);
  const next = new Date(`${ymd}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextYmd = next.toISOString().slice(0, 10);
  return { start, end: fromZonedTime(`${nextYmd}T00:00:00`, PARIS_TZ) };
}

/** Bornes [début, fin) d'un mois civil parisien (`YYYY-MM`). */
export function parisMonthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map((v) => parseInt(v, 10)) as [number, number];
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return {
    start: fromZonedTime(`${y}-${pad(m)}-01T00:00:00`, PARIS_TZ),
    end: fromZonedTime(`${nextY}-${pad(nextM)}-01T00:00:00`, PARIS_TZ),
  };
}
