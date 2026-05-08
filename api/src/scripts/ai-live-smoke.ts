/**
 * Smoke test manuel : appelle Anthropic avec une vraie clé.
 * Usage : définir ANTHROPIC_API_KEY et lancer `pnpm test:ai-live` depuis la racine du monorepo.
 */
import 'dotenv/config';
import { AnthropicClient } from '../shared/ai/anthropic-client.js';
import { buildSystemPrompt } from '../shared/ai/prompt.js';

if (!process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error('Variable ANTHROPIC_API_KEY manquante.');
  process.exit(1);
}

const sourceText =
  "Inception est un film de Christopher Nolan sorti en 2010 avec Leonardo DiCaprio. Le film explore le concept de rêves dans des rêves et la manipulation de l'inconscient.".repeat(
    2,
  );

async function main(): Promise<void> {
  const client = new AnthropicClient();
  const result = await client.generateQuiz({
    systemPrompt: buildSystemPrompt({
      language: 'fr',
      tone: 'serious',
      difficulty: 'medium',
      includeExplanations: false,
      type: 'standard',
      hasImages: false,
      numQuestions: 5,
    }),
    sourceText,
    imageUrls: [],
    parameters: {
      numQuestions: 5,
      difficulty: 'medium',
      tone: 'serious',
      language: 'fr',
      contextHint: null,
      includeExplanations: false,
    },
    model: 'claude-sonnet-4-6',
    maxTokens: 4096,
  });
  console.log('OK — questions:', result.quiz.questions.length);
  console.log('Tokens (in/out):', result.usage.inputTokens, result.usage.outputTokens);
  console.log('Coût estimé (EUR):', result.usage.estimatedCostEur);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
