import type { AiClient, GenerateQuizInput, GenerateQuizResult } from './ai-client.js';
import type { GeneratedQuizPayload } from './generated-quiz.zod.js';

function demoQuiz(numQuestions: number): GeneratedQuizPayload {
  const qs: GeneratedQuizPayload['questions'] = [];
  for (let i = 0; i < numQuestions; i += 1) {
    qs.push({
      text: `Question démo ${i + 1} (mode mock) ?`,
      imageUrl: null,
      timeLimitSeconds: 20,
      pointsMax: 1000,
      pointsFloor: 500,
      explanation: null,
      answers: [
        { position: 'A', text: 'Réponse A', isCorrect: true },
        { position: 'B', text: 'Réponse B', isCorrect: false },
        { position: 'C', text: 'Réponse C', isCorrect: false },
        { position: 'D', text: 'Réponse D', isCorrect: false },
      ],
    });
  }
  return { questions: qs };
}

export type MockAiClientOptions =
  | {
      quiz?: GeneratedQuizPayload;
      usage?: GenerateQuizResult['usage'];
      throwError?: never;
    }
  | {
      throwError: Error;
      quiz?: never;
      usage?: never;
    };

export class MockAiClient implements AiClient {
  private readonly customQuiz: GeneratedQuizPayload | undefined;
  private readonly customUsage: GenerateQuizResult['usage'] | undefined;
  private readonly throwError: Error | undefined;

  constructor(opts?: MockAiClientOptions) {
    if (opts && 'throwError' in opts && opts.throwError) {
      this.throwError = opts.throwError;
      return;
    }
    if (opts && 'quiz' in opts) {
      this.customQuiz = opts.quiz;
    }
    if (opts && 'usage' in opts && opts.usage) {
      this.customUsage = opts.usage;
    }
  }

  async generateQuiz(input: GenerateQuizInput): Promise<GenerateQuizResult> {
    if (this.throwError) throw this.throwError;

    const quiz = this.customQuiz ?? demoQuiz(input.parameters.numQuestions);

    if (quiz.questions.length !== input.parameters.numQuestions) {
      throw new Error(
        `MockAiClient: quiz has ${String(quiz.questions.length)} questions, expected ${String(input.parameters.numQuestions)}`,
      );
    }

    const usage = this.customUsage ?? {
      inputTokens: 1000,
      outputTokens: 500,
      estimatedCostEur: 0.01,
    };

    return {
      quiz,
      usage,
      rawResponse: { mock: true },
    };
  }
}
