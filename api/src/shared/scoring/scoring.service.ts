export interface ScoringInput {
  isCorrect: boolean;
  timeToAnswerMs: number;
  totalTimeMs: number;
  pointsMax: number;
  pointsFloor: number;
}

export function computeScore(input: ScoringInput): number {
  if (!input.isCorrect || input.timeToAnswerMs <= 0) return 0;
  const timeLeftMs = Math.max(0, input.totalTimeMs - input.timeToAnswerMs);
  const ratio = timeLeftMs / input.totalTimeMs;
  return Math.max(Math.round(input.pointsMax * ratio), input.pointsFloor);
}
