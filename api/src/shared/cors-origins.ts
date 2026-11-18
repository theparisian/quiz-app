/**
 * Origines CORS autorisées (Express et Socket.io), depuis CORS_ORIGINS
 * (liste séparée par des virgules). En production la variable est obligatoire ;
 * hors production, toutes les origines sont acceptées.
 */
export function resolveCorsOrigins(): string[] | true {
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  if (origins.length > 0) return origins;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGINS must be set in production (comma-separated list of origins)');
  }
  return true;
}
