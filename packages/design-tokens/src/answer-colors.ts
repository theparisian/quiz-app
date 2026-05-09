export const ANSWER_COLORS = {
  A: { bg: '#E74C3C', name: 'red' },
  B: { bg: '#3498DB', name: 'blue' },
  C: { bg: '#27AE60', name: 'green' },
  D: { bg: '#F1C40F', name: 'yellow' },
} as const;

export type AnswerLetter = keyof typeof ANSWER_COLORS;
