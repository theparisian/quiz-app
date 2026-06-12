export type Rng = () => number;

export function drawSuperPrizeWin(oddsOneIn: number, rng: Rng = Math.random): boolean {
  if (oddsOneIn < 2) return false;
  return rng() < 1 / oddsOneIn;
}
