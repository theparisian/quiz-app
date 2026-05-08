export function extractKeyFromPublicUrl(
  fullUrl: string | null | undefined,
  publicUrlBase: string,
): string | null {
  if (!fullUrl) return null;
  const trimmedBase = publicUrlBase.replace(/\/+$/, '');
  if (!fullUrl.startsWith(trimmedBase)) return null;
  const rest = fullUrl.slice(trimmedBase.length).replace(/^\/+/, '');
  const parts = rest.split('/').map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  return parts.join('/');
}
