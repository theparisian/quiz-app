# PR5a — Backend Session Core

## Résumé

PR5a pose le **backend complet des sessions live** : modèle de données, machine à états, scoring serveur, timer serveur, events Socket.io sur les 4 namespaces, routes HTTP, et un script de simulation CLI.

## Livré

### Migration Prisma `0005_session_features`

- Ajout de `Cinema.backgroundMusicUrl` (`VARCHAR(500)`, nullable).

### Module `sessions` (`api/src/modules/sessions/`)

| Fichier                           | Rôle                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session-state.service.ts`        | Machine à états pure : `SESSION_TRANSITIONS`, `assertTransition()`, `isActive()`, `isTerminal()`                                                                                      |
| `session-code.service.ts`         | Génération de code 4 chiffres (1000–9999) avec détection de collision sur sessions actives                                                                                            |
| `sessions.schemas.ts`             | Schémas Zod : `createSessionSchema`, `listSessionsQuerySchema`, `abortSessionSchema`                                                                                                  |
| `sessions.service.ts`             | CRUD sessions : create, getById, getBySlugShort, listByScreen, listByCinema, abort, updateState, markStaleSessionsAborted                                                             |
| `sessions.routes.ts`              | Routes HTTP : POST create, GET by id, GET by-code (public), POST start/pause/resume/force-end-question/abort/toggle-mute, GET list by screen/cinema                                   |
| `session-orchestrator.service.ts` | Orchestration en mémoire : start, nextQuestion, endQuestion, pause/resume, abort, submitAnswer, toggleMute. Gère timers, broadcast 1Hz, scoring, persistance batch des `PlayerAnswer` |

### Module `players` (`api/src/modules/players/`)

| Fichier              | Rôle                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `players.schemas.ts` | Schéma Zod `joinSessionSchema` (pseudo regex unicode, slugShort 4 chiffres)                                       |
| `players.service.ts` | Join (validation pseudo, bad-words, unicité case-insensitive, resumeToken nanoid), leave, kick, listBySession     |
| `players.routes.ts`  | POST /join (public), POST /:id/leave (X-Player-Token), POST /:id/kick (admin), GET /sessions/:id/players (public) |

### Services partagés

| Fichier                                     | Rôle                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `api/src/shared/scoring/scoring.service.ts` | `computeScore()` — formule legacy : `max(round(pointsMax × timeLeft / totalTime), pointsFloor)` |
| `api/src/shared/moderation/bad-words.ts`    | Liste FR+EN (~60 mots), `containsBadWord()` avec normalisation NFD                              |

### Socket.io

Handlers distribués sur les 4 namespaces existants (conforme §7 PROJECT_REFERENCE) :

| Namespace  | Fichier handler               | Events client→serveur                                                             |
| ---------- | ----------------------------- | --------------------------------------------------------------------------------- |
| `/player`  | `handlers/player-handler.ts`  | `nuc:join`, `nuc:resume` (stub)                                                   |
| `/mobile`  | `handlers/mobile-handler.ts`  | `player:join`, `player:submit_answer`, `player:leave`, `player:resume` (stub)     |
| `/console` | `handlers/console-handler.ts` | `console:join`, `console:start/pause/resume/force_end_question/abort/toggle_mute` |

Events serveur→clients (broadcast via rooms `session:{id}` sur `/player`, `/mobile`, `/console`) :

- `session:state_changed`, `session:started`, `session:question_started`, `session:timer_update`
- `session:answer_submitted_count`, `session:question_ended`, `session:next_question_in`
- `session:paused`, `session:resumed`, `session:audio_muted`
- `session:ended`, `session:aborted`
- `player:joined`, `player:left`

Auth Socket.io : `socket-auth.ts` — NUC via bcrypt(authKey), Console via JWT cookie, Player via `socket.data.playerId` après join.

### Typings Socket.io

`packages/validation/src/socket-events.ts` — tous les events PR5a avec schémas Zod.

### Intégration serveur

- `create-app.ts` : montage des routers sessions, players.
- `server.ts` : `setIoInstance(io)` pour l'orchestrator, `markStaleSessionsAborted()` au boot.
- `gateway.ts` : appel des handlers session après les namespaces génériques.

## Script de simulation

```bash
pnpm sim:session [--players N] [--quiz <slug>] [--screen <id>] [--speed <n>] [--auto]
```

Simule une session complète : création, connexion de N joueurs, auto-play des questions avec 70% de bonnes réponses, affichage du scoreboard final. Utile pour le debug visuel pendant PR5b/PR5c.

## Tests

| Fichier                         | Type                  | Tests                                                                                        |
| ------------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `scoring.service.test.ts`       | Unitaire              | 10 cas (instant, mi-temps, totalTime, incorrect, pas de réponse, pointsFloor, dépassement)   |
| `session-state.service.test.ts` | Unitaire              | 29 cas (7 transitions valides, 18 invalides, helpers)                                        |
| `session-code.service.test.ts`  | Intégration DB        | 3 cas (format, unicité, réutilisation code ended)                                            |
| `sessions.api.test.ts`          | Intégration API       | 6 cas (create, quiz non publié, screen active session, projectionist, by-code public, abort) |
| `players.api.test.ts`           | Intégration API       | 6 cas (join success, bad-word, doublon, trop court, session pas lobby, list)                 |
| `session-socket.test.ts`        | Intégration Socket.io | 3 cas (cross-session isolation, cheat-resistance, answer count)                              |
| `session-orchestrator.test.ts`  | Intégration Socket.io | 2 cas (cycle complet 3 questions → ended + ranks, abort en cours)                            |

**Total : 101 tests passent** (incluant les tests PR1–PR4 existants).

## Risques connus

### Dérive du timer serveur

Les `setTimeout` JS ne garantissent pas une précision au-dessous de ~10ms, et peuvent dériver sous charge. Pour des questions de 60s max en PR5a, la dérive est négligeable (<100ms). La tolérance de 500ms (`TIMER_TOLERANCE_MS`) compense les latences réseau. Pour une précision accrue sur de longues sessions, envisager un timer à base de `setInterval` + comparaison `Date.now()` au lieu de `setTimeout` cumulatifs (PR6+).

### Résilience au restart serveur

Au boot, toutes les sessions `running|paused` sont marquées `aborted` car l'état mémoire est perdu. La résilience (reprise de session après crash) est prévue en PR6.

## Non livré (PR5b/PR5c/PR6+)

- UI console projectionniste (PR5b)
- UI NUC + mobile joueur (PR5c)
- Logique de resume complète (PR6)
- Envoi email gagnant (PR7)
- QR code rendu (PR5c)
- Late-join (non prévu)
