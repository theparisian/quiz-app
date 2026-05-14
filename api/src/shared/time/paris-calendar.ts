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
