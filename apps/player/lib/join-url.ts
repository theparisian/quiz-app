const MOBILE_URL =
  process.env.NEXT_PUBLIC_MOBILE_URL || process.env.NEXT_PUBLIC_PLAY_URL || 'http://localhost:3002';

/** URL encodée dans le QR : jeton long si disponible, sinon code court (sessions antérieures). */
export function buildJoinUrl(params: {
  joinToken: string | null;
  slugShort: string | null;
}): string {
  if (params.joinToken) return `${MOBILE_URL}/?t=${encodeURIComponent(params.joinToken)}`;
  return `${MOBILE_URL}/?s=${params.slugShort ?? ''}`;
}
