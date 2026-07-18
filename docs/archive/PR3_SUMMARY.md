# PR3 — Création et gestion de quizz (résumé)

## Objectif atteint

Mise en place du périmètre **quizz + sponsors** côté API (CRUD, transitions, duplication, `saveFullEdit`, uploads), stockage abstrait (local + stub S3), interface super-admin (liste / filtres / éditeur / preview / sponsors), tests Vitest et CI avec `prisma migrate deploy`.

## Backend (`api/`)

- **Prisma** : `Sponsor.metadata` (JSON), migration `0003_sponsor_metadata`.
- **Erreurs** : `AppError` supporte `details` ; le handler JSON expose `error.details` si présent.
- **Storage** : `LocalStorageProvider`, `S3StorageProvider` (non implémenté), `getStorage()` / reset tests, `extractKeyFromPublicUrl`.
- **Upload** : middleware Multer mémoire, `sanitizeSvg`, routes upload quizz (cover, image question) et sponsor (logo).
- **Modules** `sponsors` et `quizzes` : schémas Zod, services (dont garde-fous statut publié / archivé), routes montées sous `/api/sponsors` et `/api/quizzes`.
- **`buildApp()`** (`create-app.ts`) : application Express testable sans `listen`; `server.ts` conservé pour le démarrage réel.
- **Dépendances** : multer, dompurify, jsdom, supertest (+ types).

## Tests & CI

- Tests d’intégration Supertest (auth super-admin, quizz, sponsors, storage local, sanitizer SVG).
- `vitest.config` : pool `forks`, `maxWorkers: 1` pour limiter la contention DB.
- **CI** : après `db:generate`, exécution de `pnpm --filter @quiz-app/api db:migrate:deploy`.

## Configuration

- **`api/.env.example`** : variables storage / URL publique documentées.
- **`.gitignore`** : ignoré `api/uploads/*`, conservé `api/uploads/.gitkeep`.

## Admin (`apps/admin/`)

- Navigation : entrées **Quizz** et **Sponsors**.
- **Quizz** : liste avec recherche, filtres statut / type / sponsor actif ; création ; pages `edit` (client existant Zustand + DnKit) ; **preview** (lecture seule).
- **Sponsors** : liste (filtre actifs, recherche), création, fiche (formulaire + logo upload / retrait + activer/désactiver).
- **`lib/media-url.ts`** : résolution URL absolue pour images servies depuis l’API.
- Corrections **`exactOptionalPropertyTypes`** : `api.post`/`put`/`patch`, duplication de question dans le store, formulaire sponsor (`reset` au chargement).

## Limites locales

- Les tests d’intégration exigent **MySQL** joignable (variable `DATABASE_URL`). Sans serveur local, ils échouent avec **P1001** ; les tests sans DB (ex. storage fichier, SVG) peuvent passer.

## Fichiers hors périmètre

- Ancien projet : `server.js`, `public/`, `config/`, `data/` (non modifiés).
