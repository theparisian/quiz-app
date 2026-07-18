# PR5c — Interfaces publiques : NUC (apps/player) et Mobile (apps/mobile)

## Résumé

Cette PR livre les deux interfaces publiques du produit live :

- **apps/player/** — Écran cinéma (NUC) : affichage grand écran 1920×1080+, fullscreen, pilotage complet par Socket.io.
- **apps/mobile/** — Interface joueur mobile : entrée par code session, pseudo, gameplay 4 boutons, résultats, email top 3.

## Backend

### Migration

- `0006_cinema_logo` : ajout `Cinema.logoUrl` (VARCHAR 500, nullable).

### NUC Auth Cookie

- `POST /api/nucs/auth` — authentifie un NUC (nucUid + authKey), retourne un cookie httpOnly `nuc_session` (JWT 30j).
- `POST /api/nucs/heartbeat` (cookie) — heartbeat NUC authentifié par cookie.
- `requireNucAuth` middleware — vérifie le JWT NUC dans le cookie `nuc_session`.
- JWT NUC dédié (`nuc-jwt.ts`) avec payload `{ nucId, screenId, type: 'nuc' }`.

### Discovery NUC (Socket.io)

- `nuc:join_screen` — le NUC rejoint la room `screen:{screenId}`, reçoit la session active si existante.
- `screen:session_started` — broadcast au NUC quand une session est créée sur son écran.
- `nuc:join` enrichi — accepte `{ sessionId }` seul si le NUC est déjà sur la room screen.

### Routes enrichies/nouvelles

- `GET /api/sessions/by-code/:slugShort` — retourne branding enrichi (cinema name/logoUrl, quiz title/type/brandingJson/sponsor, totalPlayers).
- `PATCH /api/players/:id/email` — collection email pour les gagnants top 3 (authentifié par X-Player-Token, session ended).
- `GET /api/screens/:id/cinema` — endpoint public pour récupérer les infos cinéma d'un écran.
- `player:rejoin_room` (Socket.io /mobile) — permet au mobile de rejoindre la room socket.

### Validation partagée

- `packages/validation/src/socket-events.ts` — nouveaux types/schemas : `NucJoinScreenPayload`, `ScreenSessionStartedPayload`, `PlayerRejoinRoomPayload`, etc.

## apps/player/ (NUC)

### Infrastructure

- Zustand store (`nuc-store.ts`) avec `applyEvent()` pour mapper les events Socket.io.
- Socket client singleton `/player` avec cookie forwarding.
- Heartbeat HTTP (30s) avec auto-retry et fallback erreur.
- Audio manager (background music loop, system sounds, mute toggle).

### Provisionnement

- URL `?nuc_uid=X&auth_key=Y` → POST `/api/nucs/auth` → localStorage + cookie → redirect `/screen`.
- Boots ultérieurs : localStorage → `/screen` directement.

### États visuels (7 states)

| État               | Description                                                                   |
| ------------------ | ----------------------------------------------------------------------------- |
| `idle`             | Logo cinéma, horloge, musique d'ambiance, « En attente »                      |
| `lobby`            | QR code, code 4 chiffres, liste joueurs animée (cascade)                      |
| `question`         | Texte question, image optionnelle, 4 cartes réponse colorées, timer bar 60fps |
| `question_results` | Bonne réponse mise en évidence (glow pulse), top 5 scoreboard, countdown      |
| `final_results`    | Podium animé top 3 (scale-up, slide), top 10 complet, retour idle après 60s   |
| `paused` (overlay) | Fond semi-transparent, « En pause »                                           |
| `aborted`          | Message fin de session, retour idle après 5s                                  |

### Animations

- CSS-only : `cascade-in`, `scale-up`, `slide-in-left`, `slide-in-right`, `glow-pulse`.
- Timer bar via `requestAnimationFrame`.

### Dépendances ajoutées

- `zustand`, `socket.io-client`, `qrcode.react`.

## apps/mobile/ (Joueur)

### Infrastructure

- Zustand store (`player-store.ts`) avec `applyEvent()` et `answerMap` (position → answerId).
- Socket client singleton `/mobile`.
- `resumeToken` stocké en localStorage.

### Pages

| Page                | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `/`                 | Code input 4 chiffres (auto-join via `?s=CODE`)       |
| `/join/[slugShort]` | Pseudo input (min 2, max 30, bad-word check côté API) |
| `/play/[sessionId]` | Gameplay (7 sous-états)                               |

### États gameplay

| État               | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| `lobby`            | Pseudo affiché, compteur joueurs, « On attend les autres »       |
| `question_active`  | 4 boutons colorés A/B/C/D (sans texte), mini timer, touch-action |
| `waiting_others`   | Feedback visuel réponse choisie, « En attente des autres »       |
| `question_results` | Correct/Incorrect/Trop tard + points + rang                      |
| `paused`           | Overlay pause                                                    |
| `final_results`    | Top 3 → formulaire email ; sinon → rang + score + merci          |
| `aborted`          | Message + bouton retour                                          |

### PWA

- `manifest.json` (standalone, theme-color `#1a1a2e`).
- Meta viewport `viewport-fit: cover`, `user-scalable: no`.

## Design tokens partagés

- `packages/design-tokens/src/answer-colors.ts` — `ANSWER_COLORS` : rouge `#E74C3C`, bleu `#3498DB`, vert `#27AE60`, jaune `#F1C40F`.

## Scripts

- `pnpm dev:full-stack` — lance les 5 apps (api, admin, console, player, mobile) via turbo en parallèle.

## Tests

### Nouveaux

- `nucs.auth.test.ts` — 4 tests (auth OK, bad key 401, unknown NUC 401, heartbeat cookie).
- `sessions.by-code-public.test.ts` — 2 tests (branding enrichi, 404).
- `players.email.test.ts` — 4 tests (top 3 OK, not top 3 403, wrong token, session not ended 409).

### Corrigés

- `sessions.api.test.ts` — adapté au nouveau format `by-code` (quiz.title, cinema.name).
- `helpers/integration.ts` — `truncateQuizRelatedTables` nettoie aussi les NUC (FK constraint).

**Total : 116 tests, 0 échec.**

## Scénario de test end-to-end manuel

1. `pnpm dev:full-stack`
2. Console (`:3003`) : créer un quiz publié avec 3 questions, 4 réponses chacune.
3. Console : lancer une session sur un écran.
4. NUC (`:3001`) : vérifier transition idle → lobby (QR + code).
5. Mobile (`:3002`) : scanner QR ou taper code → pseudo → lobby → constater le pseudo sur le NUC.
6. Console : démarrer la session.
7. NUC : question affichée (texte + couleurs + timer).
8. Mobile : taper une réponse (A/B/C/D) → feedback immédiat → « En attente ».
9. NUC : résultats question (bonne réponse en glow, scoreboard).
10. Mobile : correct/incorrect + points + rang.
11. Répéter pour les 3 questions.
12. NUC : podium animé (top 3) + classement complet.
13. Mobile top 3 : formulaire email → valider → « Email enregistré ».
14. Mobile hors top 3 : rang final + « Merci ».
15. NUC : retour idle après 60s.
16. Tester pause/resume depuis la console pendant une question.
17. Tester abort → NUC affiche « Session terminée » → retour idle après 5s.

## Hors périmètre (PRs suivantes)

- Reconnexion Socket resilient (PR6)
- Envoi réel des emails de lot (PR7)
- PWA avancé (offline, push notifications) (PR8)
- Late-join en cours de session
- Framer Motion / Lottie
