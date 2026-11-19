// ─── Jours civils parisiens (C3) ─────────────────────────
// Les périodes de campagne et les relevés se comptent en jours de Paris, quel que soit le
// fuseau du navigateur. Même logique que `parisDayRange` côté API, sans dépendance.

export const PARIS_TIME_ZONE = 'Europe/Paris';

const PARIS_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: PARIS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Décalage (ms) de l'heure de Paris par rapport à UTC à l'instant `at`. */
function parisOffsetMs(at: number): number {
  const p: Record<string, number> = {};
  for (const part of PARIS_PARTS.formatToParts(new Date(at))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** Instant UTC du minuit parisien ouvrant le jour civil `day` (`YYYY-MM-DD`). */
export function parisDayStart(day: string): Date {
  const [y, m, d] = day.split('-').map((v) => parseInt(v, 10)) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d);
  // Deux passes : le décalage peut changer entre l'estimation et le résultat (changement d'heure).
  let utc = wall - parisOffsetMs(wall);
  utc = wall - parisOffsetMs(utc);
  return new Date(utc);
}

/** Dernière seconde (incluse) du jour civil parisien `day` (`YYYY-MM-DD`). */
export function parisDayEnd(day: string): Date {
  const [y, m, d] = day.split('-').map((v) => parseInt(v, 10)) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return new Date(parisDayStart(next).getTime() - 1000);
}
