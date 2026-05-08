# PR4 — Génération IA de quizz (résumé)

## Objectif atteint

Génération de quizz via Claude (tool `submit_quiz`), audit DB enrichi, rate limit mémoire, interface super-admin (modal + usage + dashboard), tests Vitest avec `AI_PROVIDER=mock`.

## Backend (`api/`)

- **Migration** `0004_ai_generation_extras` : `input_full`, `output_json`, `error_details` sur `ai_generations`.
- **`shared/ai/`** : erreurs typées, schéma Zod `generatedQuizPayloadSchema`, prompts + JSON Schema outil, `AnthropicClient` (`@anthropic-ai/sdk`, timeout 60s, vision URL/base64), `MockAiClient`, `getAiClient()` + `setAiClientForTests` (tests), `validateAiEnvironment()` au démarrage (`server.ts`).
- **Module `modules/ai/`** : `ai.service.ts` (création ligne `partial` → succès/échec, sanitization `imageUrl` hors liste, `recordSuccessfulGeneration` seulement après succès), `ai.routes.ts` (`POST /generate-quiz`, `POST /input-image/:assetId`, list/detail/stats), `ai.rate-limit.ts` (fenêtre 1h, `AI_RATE_LIMIT_PER_HOUR`).
- **Montage** : `create-app.ts` → `/api/ai`.
- **Coût** : constantes USD/MTok (Sonnet 3/15, Opus 15/75) avec commentaire de mise à jour ; conversion **1 USD = 0,92 EUR** (estimation). **À valider côté tarifs Anthropic en prod** si les grilles changent.
- **Variables** : `api/.env.example` (AI_PROVIDER, clé, modèle par défaut doc, max tokens, rate limit).

## Frontend (`apps/admin/`)

- **`quiz-editor-store`** : `replaceQuestions` / `appendQuestions`, types `AiGeneratedQuestion`.
- **`app/components/ai-generate-modal.tsx`** : paramètres, uploads `ai-input`, mode remplacer/ajouter, loader rotatif, erreurs HTTP mappées, bouton désactivé si non brouillon (`published` / `archived`).
- **`/ai/usage`** : cartes mois / 7 jours / total, tableau filtrable, panneau détail.
- **Dashboard** : carte IA + lien ; sidebar entrée « IA ».

## Tests & CI

- Fichiers `api/tests/ai.*.ts` (génération, rate limit, usage, prompt, tool schema). Setup : `AI_PROVIDER=mock`. Helpers `ai-fixtures.ts`, `truncateQuizRelatedTables` inclut `ai_generations`.
- **CI** : `AI_PROVIDER=mock` dans `.github/workflows/ci.yml`.
- **`pnpm test:ai-live`** (racine) → `pnpm --filter @quiz-app/api test:ai-live` : script `api/src/scripts/ai-live-smoke.ts`, nécessite `ANTHROPIC_API_KEY` réelle.

## Hors périmètre PR4 (comme prévu)

- Pas de cleanup automatique des fichiers `ai-input` orphelins (report batch ultérieur).

## Commandes utiles

```bash
pnpm exec prisma migrate deploy   # appliquer 0004
pnpm typecheck && pnpm lint && pnpm --filter @quiz-app/api test
pnpm test:ai-live                  # smoke Anthropic réel (clé dans l’environnement)
```

## Fichiers legacy

Non modifiés : `server.js`, `public/`, `config/`, `data/` à la racine.
