# Shh!

Plateforme multi-cinéma de quizz interactifs joués en direct par le public d'une salle de cinéma.

## Architecture

Monorepo Turborepo avec pnpm workspaces :

```
apps/
├── player/        → Écran cinéma (NUC)          → port 3001
├── mobile/        → Interface joueur (téléphone) → port 3002
├── console/       → Console projectionniste     → port 3003
└── admin/         → Super-admin                 → port 3004

packages/
├── ui/            → Composants React partagés
├── socket-client/ → Hook useSocket() + types events
├── types/         → Types TypeScript partagés
├── validation/    → Schémas Zod partagés
└── design-tokens/ → Tailwind preset partagé

api/               → Backend Express + Socket.io + Prisma
```

## Prérequis

- Node.js 20+
- pnpm 9+
- MySQL 8+ (pour Prisma)

## Démarrage rapide

```bash
# 1. Cloner le repo
git clone <url> && cd quiz-app

# 2. Installer les dépendances
pnpm install

# 3. Configurer l'environnement
cp api/.env.example api/.env
# Éditer api/.env avec vos credentials MySQL

# 4. Générer le client Prisma
pnpm --filter @quiz-app/api db:generate

# 5. Lancer en dev (4 apps + backend simultanément)
pnpm dev
```

## Scripts disponibles

| Commande                                     | Description                          |
| -------------------------------------------- | ------------------------------------ |
| `pnpm dev`                                   | Démarre tout en mode dev (Turborepo) |
| `pnpm build`                                 | Build de production                  |
| `pnpm typecheck`                             | Vérification TypeScript              |
| `pnpm lint`                                  | ESLint sur tous les packages         |
| `pnpm format`                                | Prettier sur tous les fichiers       |
| `pnpm --filter @quiz-app/api db:migrate:dev` | Appliquer les migrations Prisma      |
| `pnpm --filter @quiz-app/api db:studio`      | Ouvrir Prisma Studio                 |

## Stack technique

- **Frontend :** Next.js 15 (App Router), React 19, Tailwind CSS 3
- **Backend :** Express 4, Socket.io 4, Prisma (MySQL)
- **Validation :** Zod 3 (schémas partagés front/back)
- **Monorepo :** Turborepo, pnpm workspaces
- **Qualité :** TypeScript strict, ESLint, Prettier, Husky + lint-staged

## Healthcheck

```
GET http://localhost:3000/health
→ { "status": "ok", "version": "0.0.0", "uptime": 123 }
```

## Socket.io

4 namespaces actifs : `/player`, `/mobile`, `/console`, `/admin`

Chaque namespace supporte un event de test `ping` → `pong` validé via Zod.

## Documentation

- `PROJECT_REFERENCE.md` — Architecture cible et conventions
- `MIGRATION_PLAN.md` — Plan d'exécution global
- `CURRENT_STATE.md` — Audit du code existant
