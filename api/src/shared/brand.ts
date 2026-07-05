export function getBrandLogoUrl(): string {
  const base = (process.env.APP_URL_ADMIN ?? 'http://localhost:3004').replace(/\/+$/, '');
  return `${base}/logo.png`;
}
