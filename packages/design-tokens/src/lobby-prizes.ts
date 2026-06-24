export function readLobbyPrizesEnabled(brandingJson: unknown): boolean {
  if (brandingJson && typeof brandingJson === 'object' && !Array.isArray(brandingJson)) {
    const value = (brandingJson as Record<string, unknown>).lobbyPrizesEnabled;
    if (typeof value === 'boolean') return value;
  }
  return false;
}
