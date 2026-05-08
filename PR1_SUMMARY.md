# PR1 — Fondations du monorepo

## Ce qui a été fait

### Monorepo Turborepo + pnpm

- `turbo.json` avec tasks `dev`, `build`, `lint`, `typecheck`
- `pnpm-workspace.yaml` couvrant `apps/*`, `packages/*`, `api`
- `tsconfig.base.json` avec `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`

### 4 apps Next.js 15 (App Router, React 19)

| App            | Port | Description                  |
| -------------- | ---- | ---------------------------- |
| `apps/player`  | 3001 | Écran cinéma (NUC)           |
| `apps/mobile`  | 3002 | Interface joueur (téléphone) |
| `apps/console` | 3003 | Console projectionniste      |
| `apps/admin`   | 3004 | Super-admin                  |

Chaque app affiche un "Hello [interface]", un indicateur de connexion Socket.io, et un bouton ping/pong de test.

### 5 packages partagés

| Package                   | Rôle                                          |
| ------------------------- | --------------------------------------------- |
| `@quiz-app/types`         | Types TypeScript partagés (enums, interfaces) |
| `@quiz-app/validation`    | Schémas Zod (events Socket.io)                |
| `@quiz-app/design-tokens` | Tailwind preset partagé                       |
| `@quiz-app/ui`            | Composants React partagés                     |
| `@quiz-app/socket-client` | Hook `useSocket()` avec auto-reconnect        |

### Backend Express + Socket.io (`api/`)

- Structure modulaire conforme section 6.1 du `PROJECT_REFERENCE.md`
- 4 namespaces Socket.io : `/player`, `/mobile`, `/console`, `/admin`
- Event de test `ping` → `pong` validé par Zod
- Healthcheck `GET /health` → `{ status, version, uptime }`
- Logger Pino (JSON structuré en prod, pretty en dev)
- Classe `AppError` + middleware de gestion d'erreurs
- Helper de validation Zod

### Prisma (schéma complet)

14 entités : `cinemas`, `screens`, `nucs`, `users`, `quizzes`, `questions`, `answers`, `sessions`, `players`, `player_answers`, `sponsors`, `prizes`, `events_log`, `ai_generations`

- BigInt auto-increment pour tous les IDs
- Enums Prisma pour les statuts
- Index obligatoires (slug_short, resume_token, nuc_uid, FKs)
- Migration SQL générée (non appliquée)

### Tailwind CSS

- Preset partagé `@quiz-app/design-tokens` avec palette brand, animations
- Configuré dans les 4 apps via `tailwind.config.ts`

### Qualité de code

- TypeScript strict partout (10/10 packages passent)
- ESLint avec `@typescript-eslint`, no-explicit-any en erreur
- Prettier avec plugin Tailwind
- Husky + lint-staged (pre-commit)

### CI GitHub Actions

- `.github/workflows/ci.yml` : `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`

---

## Comment démarrer

```bash
pnpm install
cp api/.env.example api/.env  # configurer DATABASE_URL
pnpm --filter @quiz-app/api db:generate
pnpm dev  # lance tout simultanément
```

- Player : http://localhost:3001
- Mobile : http://localhost:3002
- Console : http://localhost:3003
- Admin : http://localhost:3004
- API healthcheck : http://localhost:3000/health

---

## Vérifications manuelles avant merge

- [x] `pnpm install` fonctionne sans erreur
- [x] `pnpm dev` démarre les 4 apps + backend simultanément
- [x] Chaque app affiche son "Hello [interface]"
- [x] Connexion Socket.io établie (visible dans les logs API)
- [x] `pnpm typecheck` passe (10/10)
- [x] `pnpm lint` passe (10/10)
- [x] Migration Prisma générée (SQL valide)
- [x] `GET /health` répond `{ status: 'ok', version, uptime }`
- [x] `.gitignore` complet
- [x] `README.md` à jour
- [x] CI GitHub Actions configurée
- [ ] Ping/pong Socket.io visible dans la console navigateur (nécessite test manuel en navigateur)
- [ ] `prisma migrate dev` sur une DB MySQL locale (nécessite MySQL installé)

---

## Hors périmètre (reporté aux PRs suivantes)

- Auth (PR2)
- Modules métier (PR2+)
- UI réelle (PR3+)
- Données de test / seed (PR2)
