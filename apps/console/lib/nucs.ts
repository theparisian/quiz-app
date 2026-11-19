/**
 * NUC de référence d'une salle qui en a plusieurs : le plus récemment vu, comme côté API
 * (`programs.service`, tri `lastSeenAt desc`). Un NUC jamais vu passe après les autres.
 */
export function latestNuc<T extends { lastSeenAt: string | null }>(nucs: T[]): T | undefined {
  let best: T | undefined;
  for (const nuc of nucs) {
    if (!best) best = nuc;
    else if (nuc.lastSeenAt && (!best.lastSeenAt || nuc.lastSeenAt > best.lastSeenAt)) best = nuc;
  }
  return best;
}
