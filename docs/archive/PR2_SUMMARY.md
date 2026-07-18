# PR2 — Auth et entités de base

## Ce qui a été fait

### Prisma Schema

- Ajout du modèle `Invitation` (email, role, cinema, token, expiry, status)
- Ajout des enums `InvitationStatus` et `InvitationRole`
- Ajout d'un index sur `User.magicLinkToken`
- Migration `0002_add_invitations_and_pr2_changes`

### Backend — Modules

**Module auth** (`api/src/modules/auth/`)

- Magic link : `POST /api/auth/magic-link/request` et `POST /api/auth/magic-link/verify`
- Pas de leak d'info (200 OK même si email inexistant)
- JWT 30 jours en httpOnly cookie, HS256 via `jose`
- `POST /api/auth/logout`
- Scaffolding OAuth Google/Apple (retourne 501)

**Module users** (`api/src/modules/users/`)

- `GET /api/users/me`, `PATCH /api/users/me`, `DELETE /api/users/me`
- Soft delete RGPD avec anonymisation email

**Module invitations** (`api/src/modules/invitations/`)

- `POST /api/invitations` (super-admin) — crée + envoie email
- `GET /api/invitations` (super-admin) — liste paginée avec filtres
- `POST /api/invitations/:id/revoke` (super-admin)
- `GET /api/invitations/by-token/:token` (public) — infos minimales
- `POST /api/invitations/accept` (public) — crée user, retourne JWT

**Module cinemas** (`api/src/modules/cinemas/`)

- CRUD complet : `GET /api/cinemas`, `GET /api/cinemas/:slug`, `POST /api/cinemas`, `PATCH /api/cinemas/:slug`, `DELETE /api/cinemas/:slug`
- Soft delete via archivage (deletedAt)
- Slug auto-généré depuis le nom

**Module screens** (`api/src/modules/screens/`)

- `GET /api/cinemas/:slug/screens`, `POST /api/cinemas/:slug/screens`
- `PATCH /api/screens/:id`, `DELETE /api/screens/:id`
- Garde-fou : impossible de supprimer une salle avec des NUCs actifs

**Module nucs** (`api/src/modules/nucs/`)

- `GET /api/screens/:screenId/nucs`, `POST /api/screens/:screenId/nucs`
- `PATCH /api/nucs/:id`, `DELETE /api/nucs/:id`
- Génération `nuc_uid` (nanoid 16) et `auth_key` (nanoid 64, hashé bcrypt)
- La `auth_key` en clair n'est retournée qu'une seule fois à la création
- `POST /api/nuc/heartbeat` — authentification par auth_key, met à jour status/lastSeen

### Backend — Shared

**Email** (`api/src/shared/email/`)

- Service Nodemailer avec fallback JSON console si SMTP non configuré
- Templates HTML inline CSS : `magic-link.html` et `invitation.html`
- Interpolation simple `{{ variable }}`

**Auth** (`api/src/shared/auth/`)

- JWT sign/verify avec `jose` (HS256, 30 jours)
- Middleware `requireAuth(roles?)` — extrait JWT du cookie, charge user, vérifie rôle

### Frontend — Admin (`apps/admin/`)

- **Login** : formulaire email → magic link → page "check email"
- **Auth verify** : `/auth/verify?token=X` → échange token → redirect dashboard
- **Dashboard** : stats (cinémas, NUCs, invitations pending)
- **Cinémas** : liste paginée, recherche, création, page détail avec salles et NUCs
- **NUC modal** : affiche `nuc_uid` et `auth_key` en clair avec warning
- **Invitations** : liste, création (email + rôle + cinéma), révocation
- Auth guard : redirect `/login` si non connecté
- TanStack Query pour les appels API

### Frontend — Console (`apps/console/`)

- **Page acceptation invitation** : `/invitations/accept?token=X`
- Affiche email, cinéma, rôle (lecture seule)
- Formulaire `displayName` → accepte → JWT → redirect `/`

### Seed

- `api/prisma/seed.ts` : crée super-admin + cinéma démo avec 1 salle
- Commande : `pnpm db:seed`

### Tests

- 12 tests unitaires/intégration Vitest :
  - JWT sign/verify/reject
  - Validation Zod (cinemas, auth, invitations)
  - Templates email (rendu, variables)

### CI

- GitHub Actions avec MySQL 8 service
- Prisma generate, typecheck, lint, tests

### Variables d'environnement

- `.env.example` complet dans `api/`

## Commandes utiles

```bash
# Lancer la DB MySQL (Docker)
docker run -d --name quiz-mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=quiz_app_dev mysql:8

# Appliquer les migrations
pnpm --filter @quiz-app/api db:migrate:dev

# Seed
pnpm db:seed

# Lancer le backend
pnpm --filter @quiz-app/api dev

# Lancer l'admin frontend
pnpm --filter @quiz-app/admin dev

# Lancer la console
pnpm --filter @quiz-app/console dev

# Tests
pnpm --filter @quiz-app/api test

# Typecheck
pnpm typecheck
```

## Dépendances ajoutées

### Backend (`api/`)

- `jose` — JWT HS256
- `nanoid` — génération tokens/UIDs
- `bcrypt` — hash auth_key NUC
- `nodemailer` — envoi emails SMTP
- `cookie-parser` — parsing cookies httpOnly
- `vitest` — tests (dev)

### Frontend (`apps/admin/`)

- `@tanstack/react-query` — gestion état serveur

## Ce qui reste hors périmètre PR2

- OAuth Google/Apple (scaffolding en place, activation PR5)
- Console projectionniste complète (PR5)
- Quiz, sessions, joueurs (PR3+)
