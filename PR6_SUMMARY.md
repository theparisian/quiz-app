# PR6 — Résumé (en cours)

## Commit `6d02cd7` — fichiers hors périmètre strict « persistance orchestrator + réhydratation »

Git a enregistré le commit avec le statut **A** (ajout) pour tout le module sessions / handlers, parce que ces chemins étaient **non suivis** sur la branche locale au moment du commit : ce n’est pas du “bruit” type `node_modules`, c’est du **code PR5 (routes, services, handlers, script sim) déjà prévu ailleurs**, empaqueté dans le même commit que PR6.

Chemins concernés (hors delta minimal PR6) :

- `api/scripts/sim-session.ts`
- `api/src/modules/sessions/sessions.routes.ts`
- `api/src/modules/sessions/sessions.service.ts`
- `api/src/shared/sockets/handlers/console-handler.ts`
- `api/src/shared/sockets/handlers/mobile-handler.ts`

**Nuance —** `api/src/modules/sessions/session-orchestrator.service.ts` est aussi un **ajout complet** dans ce commit : il contient **tout le socle PR5a** + les extensions PR6 (persistance DB, réhydratation, upsert submit, etc.). Une revue « PR6 seule » se fait sur le diff fonctionnel résilience, pas sur l’hypothèse d’un patch minimal.

`api/src/server.ts` est en **M** : modifications alignées boot PR6 (`setIoInstance`, `rehydrateRunningSessions`).

---

## Changements vs PR5a

**Persistance des réponses au moment du `submitAnswer` :** en PR5a, les `PlayerAnswer` n’étaient écrits qu’en fin de question (`createMany` dans `endQuestionInternal`). Pour PR6, un redémarrage serveur pendant une question active perdait les réponses encore uniquement en mémoire. Désormais chaque soumission valide fait un **`upsert` Prisma** sur `(playerId, questionId)` avec `chosenAnswerId`, `timeToAnswerMs`, `answeredAtServer` (scores provisoires à 0 jusqu’à la fin de question). La fin de question recalcule les points et réécrit l’état final de façon cohérente (voir section suivante).

---

## `submitAnswer` (upsert) et `endQuestionInternal` (deleteMany + createMany)

Ce n’est pas redondant pour le plaisir :

1. **Finalisation** : à la fin de question, les lignes doivent refléter **`pointsAwarded` et `isCorrect` définitifs**, les joueurs **sans réponse** (`chosenAnswerId: null`), et aucune incohérence si le serveur a recalculé différemment du placeholder upsert.
2. **`skipDuplicates` ne met pas à jour** : un `createMany` seul laisserait les lignes déjà créées par l’upsert avec d’anciens `pointsAwarded` / `isCorrect` si on ne faisait pas d’update explicite.
3. **Une passe DB unique par question** : `deleteMany` pour `(questionId + joueurs de la partie)` puis `createMany` avec le tableau complet calculé dans la boucle (mémoire **ou** ligne DB pour les joueurs ayant upsert avant reboot) garantit **un snapshot aligné** avec le scoreboard broadcast et les `increment` score joueur.

En bref : l’**upsert** sert à la **résilience avant** la fin de question ; le **deleteMany + createMany** sert à **normaliser l’état final** pour toute la question d’un coup.

---

## Base de données de test (Vitest)

Vitest force `DATABASE_URL` vers `quiz_app_test` (voir `api/tests/setup.ts`). Après une nouvelle migration, appliquer aussi sur cette base :

```bash
cd api
# Adapter l’URL si besoin (même host/user/password que le .env, base quiz_app_test)
set DATABASE_URL=mysql://root:password@localhost:3306/quiz_app_test
pnpm exec prisma migrate deploy
```

(PowerShell : `$env:DATABASE_URL='...'; pnpm exec prisma migrate deploy`.)

---

## `markStaleSessionsAborted`

Retiré de `sessions.service.ts` et du boot `server.ts`. Aucune occurrence dans `api/prisma/seed.ts` ni ailleurs sous `api/` (reste une mention dans `PR5a_SUMMARY.md` et un commentaire dans l’orchestrator).

---

## Moniteur NUC offline (PR6)

- Module `api/src/shared/nuc-monitor/` : `scanStaleOnlineNucsAndMarkOffline` / `startNucOfflineMonitor`.
- Intervalle **30 s**, seuil **90 s** sans `lastHeartbeatAt` frais pour un NUC encore `online` → passage `offline` + event socket **`nuc:status_changed`** (`reason: heartbeat_timeout`).
- **Heartbeats** (`authenticateNuc`, `POST /api/nuc/heartbeat`, `POST /api/nucs/heartbeat`) : si le NUC était `offline` ou `error`, passage `online` + **`nuc:status_changed`** (statut `online`) via `req.app.get('io')`.
- **`broadcastNucStatusChanged`** : rooms `screen:{screenId}` sur les namespaces `/console`, `/player`, `/mobile`, `/admin`, plus `nuc:{nucId}` sur `/player`.
- **Console** : `console:join` et `console:resume` rejoignent aussi `screen:{screenId}` pour recevoir ces events.
- Schéma validation : `nucStatusChangedSchema` dans `packages/validation/src/socket-events.ts`.
- Tests : `api/tests/nuc-monitor.test.ts` (stale → offline + heartbeat offline → online).

---

## Front — reconnexion (PR6)

| App        | Commit                                | Résumé                                                                                                                            |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Mobile     | `feat(pr6): mobile reconnect UX ...`  | `connectionStatus`, `applySnapshot`, `player:resume` à chaque `connect`, bannière `ConnectionBanner`, réponses snapshot avec `id` |
| NUC player | `feat(pr6): NUC reconnect UX ...`     | idem store + `nuc:resume` après `nuc:join_screen`, listeners socket, `NucConnectionBanner`                                        |
| Console    | `feat(pr6): console reconnect UX ...` | `console:resume` à chaque `connect` (remplace seul `console:join`), `applySocketSnapshot`, `LiveConnectionBanner`                 |

---

## Doc déploiement NUC

`docs/nuc-deployment.md` : flags Chromium, heartbeat, systemd watchdog, réseau.

---

## Test résilience réalisé (scénario bout en bout)

**Procédure cible :**

1. `pnpm dev:full-stack` depuis la racine (avec `AI_PROVIDER=mock` dans `api/.env` si pas de clé Anthropic — sinon l’API refuse de démarrer).
2. Créer une session, démarrer le quiz, rejoindre avec **mobile** ; lancer `pnpm exec tsx scripts/sim-session.ts` (ou piloter manuellement) pour enchaîner les questions.
3. Durant la **3e** question active, arrêter le process **API** puis le relancer.
4. Vérifier : les clients **mobile / NUC / console live** se reconnectent (bannière puis état rétabli) ; la session repart sur la logique orchestrateur ; enchaînement vers la **4e** question sans abort lobby.

**Exécution dans cet environnement :** `dev:full-stack` a démarré les apps Next mais l’API a échoué au boot faute de `ANTHROPIC_API_KEY` avec `AI_PROVIDER=anthropic` par défaut. Avec `AI_PROVIDER=mock`, le scénario ci-dessus est **à rejouer localement** pour signature opérateur.

---

_(Suite PR6 éventuelle : pingTimeout/pingInterval gateway, toasts détaillés, tests e2e Playwright.)_
