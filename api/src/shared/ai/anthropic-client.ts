import Anthropic, { APIConnectionTimeoutError, APIError } from '@anthropic-ai/sdk';
import type {
  ContentBlockParam,
  ImageBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages/messages.mjs';
import type { GenerateQuizInput, GenerateQuizResult } from './ai-client.js';
import { generatedQuizPayloadSchema, type GeneratedQuizPayload } from './generated-quiz.zod.js';
import { buildToolSchema } from './prompt.js';
import { AiError, AiInvalidOutputError, AiRefusalError, AiTimeoutError } from './errors.js';

// À mettre à jour si tarifs Anthropic changent (USD / million tokens, prix publics indicatifs).
const USD_PER_MILLION: Record<GenerateQuizInput['model'], { in: number; out: number }> = {
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-4-7': { in: 15, out: 75 },
};

/** Taux fixe indicatif USD → EUR (estimation coût uniquement). */
const USD_TO_EUR = 0.92;

function estimateCostEur(
  model: GenerateQuizInput['model'],
  inputTokens: number,
  outputTokens: number,
): number {
  const p = USD_PER_MILLION[model];
  const usd = (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
  return Math.round(usd * USD_TO_EUR * 1_000_000) / 1_000_000;
}

const REFUSAL_TEXT_RE = /\b(i cannot|i can't|i won't|i am unable|je ne peux pas)\b/i;

function shouldUseBase64Image(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
    const h = u.hostname.toLowerCase();
    if (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h.startsWith('192.168.') ||
      h.endsWith('.local')
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function normalizeMediaType(
  mime: string | null,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  const m = (mime ?? 'image/jpeg').split(';')[0]?.trim().toLowerCase();
  if (m === 'image/png') return 'image/png';
  if (m === 'image/webp') return 'image/webp';
  if (m === 'image/gif') return 'image/gif';
  return 'image/jpeg';
}

async function imageBlockFromUrl(url: string): Promise<ImageBlockParam> {
  if (!shouldUseBase64Image(url)) {
    return { type: 'image', source: { type: 'url', url } };
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new AiError(`Failed to fetch image: ${res.status}`, 'AI_IMAGE_FETCH');
  }
  const mime = normalizeMediaType(res.headers.get('content-type'));
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    type: 'image',
    source: { type: 'base64', media_type: mime, data: buf.toString('base64') },
  };
}

function buildUserTextPart(input: GenerateQuizInput): string {
  const p = input.parameters;
  const lines = [
    `<source_text>
${input.sourceText}
</source_text>`,
    '',
    'Paramètres de génération :',
    `- Nombre de questions : ${p.numQuestions}`,
    `- Difficulté : ${p.difficulty}`,
    `- Ton : ${p.tone}`,
    `- Langue : ${p.language}`,
    `- Inclure les explications : ${p.includeExplanations ? 'oui' : 'non'}`,
  ];
  if (p.contextHint?.trim()) {
    lines.push(`- Contexte additionnel : ${p.contextHint.trim()}`);
  }
  if (input.imageUrls.length) {
    lines.push(
      '',
      'URLs des images de référence (à utiliser telles quelles pour imageUrl si pertinent) :',
    );
    input.imageUrls.forEach((u, i) => lines.push(`  ${i + 1}. ${u}`));
  }
  return lines.join('\n');
}

function mapApiError(err: APIError): AiError {
  const status = err.status ?? 502;
  const code =
    status === 401
      ? 'AI_AUTH'
      : status === 429
        ? 'AI_RATE_LIMIT'
        : status >= 500
          ? 'AI_SERVER'
          : 'AI_PROVIDER';
  return new AiError(err.message || 'Anthropic API error', code, status);
}

export class AnthropicClient {
  private readonly client: Anthropic;

  constructor() {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY is missing');
    }
    this.client = new Anthropic({ apiKey: key, timeout: 60_000 });
  }

  async generateQuiz(input: GenerateQuizInput): Promise<GenerateQuizResult> {
    const userText = buildUserTextPart(input);
    const contentBlocks: ContentBlockParam[] = [{ type: 'text', text: userText }];

    for (const url of input.imageUrls) {
      try {
        contentBlocks.push(await imageBlockFromUrl(url));
      } catch (e) {
        throw e instanceof AiError
          ? e
          : new AiError('Failed to prepare image for AI', 'AI_IMAGE_PREP');
      }
    }

    try {
      const message = await this.client.messages.create({
        model: input.model,
        max_tokens: input.maxTokens,
        system: input.systemPrompt,
        tool_choice: { type: 'tool', name: 'submit_quiz' },
        tools: [
          {
            name: 'submit_quiz',
            description: 'Soumet le quizz généré au format structuré.',
            input_schema: buildToolSchema() as Anthropic.Tool['input_schema'],
          },
        ],
        messages: [{ role: 'user', content: contentBlocks }],
      });
      const rawMessage: unknown = message;

      if (message.stop_reason === 'refusal') {
        throw new AiRefusalError();
      }

      for (const block of message.content) {
        if (block.type === 'text' && REFUSAL_TEXT_RE.test(block.text)) {
          throw new AiRefusalError();
        }
      }

      if (message.stop_reason !== 'tool_use') {
        throw new AiInvalidOutputError(`Unexpected stop_reason: ${String(message.stop_reason)}`, {
          stop_reason: message.stop_reason,
        });
      }

      const toolBlock = message.content.find(
        (b): b is ToolUseBlock => b.type === 'tool_use' && b.name === 'submit_quiz',
      );
      if (!toolBlock) {
        throw new AiInvalidOutputError('No submit_quiz tool_use block in response', {
          content: message.content,
        });
      }

      const parsed = generatedQuizPayloadSchema.safeParse(toolBlock.input);
      if (!parsed.success) {
        throw new AiInvalidOutputError('Tool output failed Zod validation', parsed.error.flatten());
      }

      if (parsed.data.questions.length !== input.parameters.numQuestions) {
        throw new AiInvalidOutputError(
          `Expected ${String(input.parameters.numQuestions)} questions, got ${String(parsed.data.questions.length)}`,
          { expected: input.parameters.numQuestions, got: parsed.data.questions.length },
        );
      }

      const quiz: GeneratedQuizPayload = parsed.data;
      const inputTokens = message.usage.input_tokens;
      const outputTokens = message.usage.output_tokens;

      return {
        quiz,
        usage: {
          inputTokens,
          outputTokens,
          estimatedCostEur: estimateCostEur(input.model, inputTokens, outputTokens),
        },
        rawResponse: rawMessage,
      };
    } catch (e: unknown) {
      if (e instanceof AiRefusalError || e instanceof AiInvalidOutputError) throw e;
      if (e instanceof APIConnectionTimeoutError) {
        throw new AiTimeoutError();
      }
      if (e instanceof APIError) {
        throw mapApiError(e);
      }
      throw e;
    }
  }
}
