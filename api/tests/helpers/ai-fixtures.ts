import type { GeneratedQuizPayload } from '../../src/shared/ai/generated-quiz.zod.js';

export function makeValidQuiz(n: number): GeneratedQuizPayload {
  const questions: GeneratedQuizPayload['questions'] = [];
  for (let i = 0; i < n; i += 1) {
    questions.push({
      text: `Q${String(i + 1)} ?`,
      imageUrl: null,
      timeLimitSeconds: 20,
      pointsMax: 1000,
      pointsFloor: 500,
      explanation: null,
      answers: [
        { position: 'A', text: 'Ok', isCorrect: true },
        { position: 'B', text: 'No', isCorrect: false },
        { position: 'C', text: 'No2', isCorrect: false },
        { position: 'D', text: 'No3', isCorrect: false },
      ],
    });
  }
  return { questions };
}

export function makeInvalidQuizTwoCorrect(): GeneratedQuizPayload {
  const q = makeValidQuiz(8);
  const first = q.questions[0];
  if (first && first.answers[1]) {
    first.answers[1].isCorrect = true;
  }
  return q;
}
