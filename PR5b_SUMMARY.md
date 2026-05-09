# PR5b — Console Projectionniste (`apps/console/`)

## Objectif

Livrer la console projectionniste : interface desktop-first permettant à un projectionniste ou cinema_admin de piloter une session de quiz en temps réel depuis son cinéma.

## Backend (modifications minimales)

### Extensions d'autorisation

- `GET /api/cinemas/:slug` : ouvert à `projectionist`, `cinema_admin` (lecture seule)
- `GET /api/cinemas/:slug/screens` : idem
- `GET /api/quizzes` (liste) : idem — la console en a besoin pour le quiz-picker
- `GET /api/users/me` : enrichi avec `cinemaSlug` et `cinemaName` (join Cinema)

### Nouvelle route

- `GET /api/sessions/:id/full` — retourne la session complète + quiz avec questions, réponses (incl. `isCorrect`), + liste joueurs. Protégée par `requireAuth(ADMIN_ROLES)`.

### Test d'intégration

- `api/tests/auth-roles.test.ts` — 5 cas : magic link projectionniste OK, cinema_admin OK, player KO, `/users/me` avec cinemaSlug, `/sessions/:id/full` accessible par projectionniste.

## Frontend — `apps/console/`

### Infrastructure

| Fichier                            | Rôle                                       |
| ---------------------------------- | ------------------------------------------ |
| `lib/api.ts`                       | Wrapper fetch + credentials                |
| `lib/auth.tsx`                     | AuthProvider + useAuth (GET /users/me)     |
| `lib/query-provider.tsx`           | TanStack Query (staleTime 30s)             |
| `lib/socket.ts`                    | Socket.io `/console` namespace, singleton  |
| `lib/stores/live-session-store.ts` | Zustand store — state machine session live |

### Hooks

| Hook                    | Usage                                      |
| ----------------------- | ------------------------------------------ |
| `use-screens.ts`        | GET /cinemas/:slug/screens                 |
| `use-sessions.ts`       | GET /screens/:id/sessions                  |
| `use-active-session.ts` | Détecte session lobby/running/paused       |
| `use-live-session.ts`   | Socket.io connect + event dispatch → store |

### Pages

| Route                        | Description                                          |
| ---------------------------- | ---------------------------------------------------- |
| `/login`                     | Formulaire magic link                                |
| `/login/check-email`         | Page interstitielle                                  |
| `/auth/verify`               | Callback magic link (set cookie → redirect)          |
| `/access-denied`             | Bloque les rôles `player`                            |
| `/dashboard`                 | Liste des salles du cinéma + bannière session active |
| `/screens/[screenId]`        | Détail salle + historique sessions                   |
| `/sessions/new`              | Quiz picker + création session                       |
| `/sessions/[sessionId]/live` | Console live (5 states)                              |
| `/sessions/[sessionId]`      | Détail session passée + scoreboard                   |
| `/settings`                  | Infos compte + déconnexion                           |

### Composants live-console

- `LobbyView` — code 4 chiffres, liste joueurs, boutons start/abort
- `LiveHeader` — question X/N, compteur joueurs, toggle audio
- `QuestionPreview` — question + réponses avec correcte highlight
- `TimerBar` — barre 60fps via `requestAnimationFrame` interpolation
- `ControlsPanel` — pause/resume/force-end/abort
- `PlayersList` — top 8 + recherche + expand
- `EndedView` — podium + top 10 + liens retour
- `AbortedView` — raison + lien retour
- `ConfirmAbortModal` — modale de confirmation avec raison optionnelle

### Design

- Palette sobre (gray-50 bg, white cards, blue-600 accent, red pour danger)
- Desktop-first, sidebar fixe 224px
- Aucune librairie animation — transitions CSS natives uniquement
- Timer interpolé côté client via rAF (60fps) basé sur baseline serveur

## Dépendances ajoutées à `apps/console/`

- `@tanstack/react-query` ^5.100.9
- `zustand` ^5.0.13
- `socket.io-client` ^4.7.0
- `zod` ^3.23.0

## Vérification

- ✅ `pnpm --filter @quiz-app/console typecheck` — 0 erreurs
- ✅ `pnpm --filter api typecheck` — 0 erreurs
- ✅ `api/tests/auth-roles.test.ts` — 5/5 tests passent

## Hors périmètre (noté pour PR6+)

- Reconnexion socket (session:state_snapshot) → PR6
- Scope cinéma pour sessions (projectionniste ne voit que SES salles côté API) → PR6
- Tests E2E console → PR6
