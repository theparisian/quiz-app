export function readLateJoinQrEnabled(brandingJson: unknown): boolean {
  if (brandingJson && typeof brandingJson === 'object' && !Array.isArray(brandingJson)) {
    const value = (brandingJson as Record<string, unknown>).lateJoinQrEnabled;
    if (typeof value === 'boolean') return value;
  }
  return false;
}
