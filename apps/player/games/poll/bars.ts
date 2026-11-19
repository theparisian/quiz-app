import { ANSWER_COLORS, ANSWER_POSITIONS, type AnswerPosition } from '@quiz-app/design-tokens';
import { pollPercentages, type PollOptionCount, type PollQuestionView } from '@quiz-app/validation';

export interface PollBar {
  optionId: string;
  /** Lettre de l'option (A à D, par ordre) : même couleur que les réponses du quiz. */
  letter: AnswerPosition;
  color: string;
  text: string;
  votes: number;
  percent: number;
}

/** Barres de résultats (ordre des options), sans JSX : testable hors navigateur. */
export function pollBars(view: {
  question: PollQuestionView;
  counts: PollOptionCount[];
}): PollBar[] {
  const percents = pollPercentages(view.counts);
  return view.question.options.map((option, index) => {
    const letter = ANSWER_POSITIONS[index] ?? 'A';
    return {
      optionId: option.id,
      letter,
      color: ANSWER_COLORS[letter].bg,
      text: option.text,
      votes: view.counts.find((c) => c.optionId === option.id)?.votes ?? 0,
      percent: percents.get(option.id) ?? 0,
    };
  });
}
