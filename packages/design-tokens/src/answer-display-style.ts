export type AnswerDisplayStyle = 'multicolor' | 'glass';

export const ANSWER_DISPLAY_STYLES: { value: AnswerDisplayStyle; label: string }[] = [
  { value: 'multicolor', label: 'Multicolore' },
  { value: 'glass', label: 'Transparent (glass)' },
];

export function readAnswerDisplayStyle(brandingJson: unknown): AnswerDisplayStyle {
  if (brandingJson && typeof brandingJson === 'object' && !Array.isArray(brandingJson)) {
    const value = (brandingJson as Record<string, unknown>).answerDisplayStyle;
    if (value === 'glass' || value === 'multicolor') return value;
  }
  return 'multicolor';
}
