# B2-B4 — Notes de passation entre les 4 commits

Fichier de travail du chantier B2-B4 (prompt `06-B2-B4-moteur-protocole.md`). Il est écrit par
l'agent du commit 1 et doit être tenu à jour par les agents des commits 2, 3 et 4.

## 1. Inventaire des événements socket (état avant B2-B4, inchangé après le commit 1)

Namespaces : `/player` (écran cinéma, NUC), `/mobile` (joueur), `/console` (cinéma), `/admin`.
Room de session : `session:<id>` dans `/player`, `/mobile` et `/console`. « Les 3 » = ces trois
namespaces. Mobile rejoint aussi `session:<id>:players` ; console `session:<id>:projectionist` et
`screen:<screenId>` ; écran `screen:<screenId>` et `nuc:<nucId>`.

### Serveur → clients

| Événement | Émis par | Vers | Écouté par | Effet côté client |
| --- | --- | --- | --- | --- |
| `session:started` | runtime `start` | les 3 | player, mobile, console | écran : `uiState=lobby` (compte à rebours d'avant Q1), `totalQuestions`, fond du quiz, config audio ; mobile : `totalQuestions` ; console : idem. Payload : `sessionId, totalQuestions, quiz (fond), audio`. |
| `session:state_changed` | runtime (start, pause, reprise, fin, abandon) | les 3 | les 3 | mobile : `state` ; console : `state` ; écran : rien d'utile. |
| `session:question_started` | moteur quiz (adaptateur) | les 3 | les 3 | écran : `uiState=question`, question + réponses, `questionStartedAt=Date.now()` (horloge locale), `answersSubmittedCount=0`, `previousScoreboard`, vide les flashs. **Sons** (`use-audio-director.ts`) : `questionStart` à l'ouverture, `answerReveal` décalé par réponse (`answerRevealDelayMs`), `lastSeconds` programmé à `questionStartedAt + timeLimit - TIMER_URGENT_THRESHOLD_SEC`, musique `gameMusic` (phase question). Mobile : `uiState=question_active`, réinitialise la sélection. Console : question courante (depuis le quiz complet du snapshot), timer. Payload : `questionId, questionPosition, questionText, questionImageUrl, answers[{id,position,text}], timeLimitMs, startedAt`. Jamais `isCorrect` (test `session-socket`). |
| `session:timer_update` | moteur quiz, chaque seconde | les 3 | écran, console (le hook mobile l'écoute mais le store l'ignore) | `remainingMs`. L'écran anime sa barre à 60 i/s depuis `questionStartedAt` ; console : `timer-bar.tsx`. |
| `session:answer_submitted_count` | moteur quiz, regroupé ≤ 1 / 250 ms + compte exact à la clôture et à la pause | les 3 | écran, console (mobile : ignoré) | `count / total` (« N / M réponses »). Test A3 : moins de 20 émissions pour 20 réponses, dernière = 20 avant `question_ended`. |
| `session:player_answered` | moteur quiz | `/player` seulement | écran | flash du pseudo + avatar ; **son** `playerAnswered` une fois par flash. Jamais la réponse choisie. |
| `session:question_ended` | moteur quiz | les 3 | les 3 | écran : `uiState=question_results`, bonne réponse, explication, classement (révélation 2,5 s puis classement « split ») ; **son** `questionEnd`. Mobile : `question_results`, résultat perso calculé depuis le classement (`scoreThisQuestion`, rang). Console : résultats. Payload : `correctAnswerId, explanationText, scoreboard[{playerId,pseudo,avatarUrl,scoreTotal,scoreThisQuestion}]` (tous les joueurs, triés). |
| `session:next_question_in` | moteur quiz (après une question non finale, et à la reprise en phase résultats) | les 3 | écran, console | compte à rebours « question suivante dans N s ». |
| `session:paused` / `session:resumed` | runtime | les 3 | les 3 | écran : `isPaused` (**musique** en pause) ; mobile : `uiState=paused` / retour ; console : `state`. |
| `session:audio_muted` | runtime `toggleMute` | les 3 | écran, console | coupe le son de l'écran. |
| `session:lobby_timer_update` | `lobby-timer.service` (chaque seconde en lobby) | les 3 | écran, console | compte à rebours du lobby. |
| `session:ended` | runtime fin de session | les 3 | les 3 | écran : `final_results` (**son** `final`, musique `scoresMusic`) ; mobile : rang final, lots ; console : classement final. Payload : `finalScoreboard, winnerPlayerId, prizeAvailabilityByRank, prizes?`. |
| `session:aborted` | runtime abandon | les 3 | les 3 | écran `aborted` (plus de musique), mobile, console. |
| `session:state_snapshot` | handlers `nuc:resume`, `player:resume`, `console:resume` | le socket demandeur | les 3 | reconstruction complète (`session-resume.service.ts`). |
| `player:joined` / `player:left` | `session-broadcast.ts` (join socket/REST, leave, kick) | les 3 | les 3 | listes de joueurs, compteurs. |
| `screen:session_started` | `sessions.routes` (création) | `/player` rooms `screen:` et `nuc:` | écran (`use-nuc-init.ts`) | l'écran rejoint la session ; porte `joinToken` (A2, convention 4). |
| `nuc:join_screen_success`, `nuc:join_success`, `player:join_success`, `player:rejoin_room_success`, `console:join_success` | handlers | le socket | clients | accusés quand pas de callback. |
| `nuc:status_changed` | nuc-monitor | `/admin` | admin | supervision. |
| `error` | handlers | le socket | clients | erreurs (ex. réponse refusée : `ALREADY_ANSWERED`, `SESSION_PAUSED`…). |

### Clients → serveur

| Événement | Namespace | Effet |
| --- | --- | --- |
| `player:join` (ack) | `/mobile` | `playersService.join` ; en partie : ajout au runtime (retardataire). |
| `player:resume` | `/mobile` | réactive le joueur, le remet dans la partie s'il en était sorti (convention 8), émet le snapshot. Envoyé à chaque `connect` par `use-player-session.ts`. |
| `player:rejoin_room` (ack) | `/mobile` | rejoint les rooms (utilisé par les tests). |
| `player:submit_answer` | `/mobile` | `runtime.submitAnswer` → `round.onAction({type:'answer'})`. Erreur → `error`. Émis par `question-screen.tsx`. |
| `player:leave` | `/mobile` | `playersService.leave` + `player:left`. |
| `console:join`, `console:resume`, `console:start`, `console:pause`, `console:unpause`, `console:force_end_question`, `console:abort`, `console:toggle_mute` | `/console` | contrôles (routes REST équivalentes : `/start`, `/pause`, `/resume`, `/force-end-question`, `/abort`, `/toggle-mute`). |
| `nuc:join_screen`, `nuc:join`, `nuc:resume` | `/player` | écran. |
| `admin:watch_cinema` | `/admin` | supervision. |

Sons écran (`apps/player/hooks/use-audio-director.ts`) : musique par phase (`lobbyMusic`,
`gameMusic` en question/résultats, `scoresMusic` en final, musique continue optionnelle, ambiance du
cinéma en idle, pause en `isPaused`) ; SFX `questionStart`, `answerReveal` (×N décalés),
`lastSeconds`, `questionEnd`, `final`, `playerAnswered`. Tous dérivent de l'état du store
(`uiState`, question courante, `questionStartedAt`) sauf `playerAnswered` qui dépend des flashs
(`session:player_answered`) : c'est le seul vrai « cue ».

## 2. Commit 1 — ce qui est en place

Fichiers :

- `api/src/modules/games/engine.types.ts` : interface (voir § 3).
- `api/src/modules/games/engine-registry.ts` : `registerEngine`, `getEngine` ; le quiz s'y
  enregistre à l'import du module.
- `api/src/modules/games/engines/quiz/quiz.engine.ts` : `quizEngine` + classe `QuizRound`
  (boucle de questions, réservation synchrone des réponses, compteur regroupé, notation,
  reprise). Exporte aussi `getResultsDisplayMs`, `getCountdownMs`.
- `api/src/modules/sessions/session-runtime.service.ts` (ex-`session-orchestrator.service.ts`) :
  plateforme. `getSessionRuntime()` (ex-`getOrchestrator()`), `setIoInstance`,
  `rehydrateRunningSessions`, `resetRunningSessionsForTests`, `advanceOrEnd`.
- Tests ajoutés : `api/tests/quiz-engine.test.ts` (moteur seul, faux contexte, horloge et
  minuteurs simulés), `api/tests/session-runtime.platform.test.ts` (manche créée à la volée,
  participants, joueurs partis/exclus, reprise, redémarrage en question et en pause).
  `session-orchestrator.test.ts` renommé `session-runtime.test.ts` (assertions inchangées).

Plateforme (`RunningSession` en mémoire) : `players` (Map id → `RoundPlayerMeta`), `audioMuted`,
`progress` (miroir de `sessions.current_question_position`), `active` (la manche active :
`roundId`, `position`, `engineKey`, `round`, `participants`, `engineState`, `seq` par
destinataire). Méthodes : `start`, `pauseSession`, `resumeSession`, `forceAdvance`
(ex-`forceEndQuestion`), `abortSession`, `toggleMute`, `handleAction(sessionId, playerId,
action, expectedRoundId?)`, `submitAnswer` (TEMPORAIRE), `addPlayer(sessionId, playerId, meta,
{ rejoin })`, `removePlayer`, `hasPlayer`, `getProgress`, `getActiveRound`, `isRunning`.

`session_rounds.state_json` = `{ platform: { participants: string[] }, engine: <état moteur> }`
(convention 7). Participants : ajoutés quand `round.onAction` réussit, écrits au plus une fois
par seconde et toujours à la fin de manche / à l'abandon. Écritures de `state_json` en série.

## 3. Interface moteur finale (commit 1) et écarts

Proposition du prompt conservée, avec ces écarts :

1. **`RoundContext.setTimer(ms, fn): CancelTimer`** (ajout). Avec `now()` seul, l'horloge
   simulée ne pilote pas les `setTimeout` du moteur. Tous les délais du quiz passent par là ; le
   faux contexte des tests avance le temps et déclenche les minuteurs échus. La plateforme les
   annule aussi à `dispose` (filet).
2. **`RoundContext.reportProgress(step | null)`** (ajout). Le moteur ne doit pas écrire
   `sessions`, mais `sessions.current_question_position` sert à la liste des séances
   (`sessions.routes`) et à `players.joined_question_position` (rapports, calcul « questions
   manquées » du snapshot mobile). Le quiz y passe le numéro de question.
3. **`onPlayerJoined(playerId, { rejoin })`** (paramètre ajouté). Un joueur repris après un
   départ (`player:resume`, convention 8) n'est pas une nouvelle arrivée : avant B2-B4 il pouvait
   répondre à la question en cours (son `joined_question_position` était null). Le quiz ne bloque
   que `rejoin: false`. Le blocage d'un retardataire survit à un départ/reprise dans la même
   question (l'ensemble des bloqués n'est pas vidé au retrait).
4. **`RoundContext.legacy`** (TEMPORAIRE, à supprimer au commit 2) : `broadcast(event, payload)`
   vers les 3 namespaces et `toScreen(event, payload)` vers `/player`. C'est l'adaptateur par
   lequel le quiz émet encore les anciens événements.
5. `players.meta()` renvoie `RoundPlayerMeta` (pseudo, avatarUrl, joinedDuringRound) ;
   `ScoreAward`, `GameAction`, `GameDefinition`, `RoundRestore` sont nommés et exportés.
6. `award` ignore les entrées à 0 point ; `scores()` = `Player.scoreTotal` des joueurs encore
   dans la manche ET actifs en base.
7. `finish()` est idempotent côté plateforme (second appel journalisé et ignoré) ; il dispose la
   manche, écrit `state_json`, passe la manche à `ended` puis appelle `advanceOrEnd`.
8. Contrat de démarrage : `pause()` peut être appelé avant `start()` (réhydratation d'une séance
   en pause) ; la manche démarre alors en pause.
9. `restore.interruptedAt` = l'heure de la réhydratation (le quiz ne s'en sert pas).
10. `GameRound.snapshot()` du quiz renvoie pour l'instant `{ phase, questionIndex,
    totalQuestions }` ; les snapshots passent encore par `QuizRound.legacyMemory()` (TEMPORAIRE)
    lu par `session-resume.service.ts` via `instanceof QuizRound`.

`emitState` / `emitCue` existent déjà côté plateforme mais ne sont appelés par personne :
`game:state` `{ roundId, engineKey, seq, serverNow (ms epoch), view }` vers
`AUDIENCE_NAMESPACE[audience]`, room `session:<id>` ou `player:<playerId>` (mobile ciblé, `seq`
par joueur) ; `game:cue` `{ roundId, cue, data }` vers la room de session. Le commit 2 peut
ajuster (ISO pour `serverNow`, etc.).

## 4. Ce que l'adaptateur temporaire émet (commit 1)

Le moteur quiz émet exactement les anciens événements, mêmes payloads, mêmes moments :
`session:question_started`, `session:timer_update` (chaque seconde), `session:answer_submitted_count`
(≤ 1 / 250 ms, plus le compte exact à la clôture et à la pause), `session:player_answered`
(`/player` seul), `session:question_ended`, `session:next_question_in`. La plateforme émet
`session:started`, `session:state_changed`, `session:paused`, `session:resumed`,
`session:audio_muted`, `session:ended`, `session:aborted`. `round:started` / `round:ended` ne
sont pas encore émis. Seul écart : `answer_submitted_count.total` = joueurs encore dans la manche
(avant : tous les joueurs vus, partis compris).

## 5. Garanties A3 conservées

- Réservation synchrone : `handleAction` n'a aucun `await` avant `round.onAction` ; dans
  `QuizRound.onAction` tous les contrôles et l'écriture en mémoire précèdent le premier `await`
  (l'upsert `player_answers`). Test « double submit » inchangé.
- `SESSION_PAUSED` : refus par le moteur (drapeau de pause ou question en pause), même ordre de
  contrôles qu'avant.
- Compteur regroupé 250 ms : dans le moteur via `ctx.setTimer` ; émis tout de suite à la pause.
- Une seule transaction tableau pour `Player.scoreTotal` + `ScoreEvent` : `ctx.award`.

## 6. Changements de comportement du commit 1 (et pourquoi)

- **Point ouvert A3 fermé** : `playersService.leave` et `kick` retirent le joueur de la manche
  (`removePlayer`) ; `handleAction` refuse alors `PLAYER_NOT_IN_SESSION` (contrôle plateforme,
  valable pour tous les moteurs). `player:resume` le remet via `addPlayer(..., { rejoin: true })`
  → `onPlayerJoined` (convention 8, testé), **sauf un joueur exclu** : `player:resume` renvoie
  `error { code: 'PLAYER_KICKED' }` et ne le réactive plus (avant : il redevenait `active`).
  → commit 3 : le mobile doit afficher un écran « tu as été retiré de la partie » sur ce code.
- **Déconnexion prolongée** : le minuteur de 10 s de `disconnect` ne marque plus « parti » un
  joueur reconnecté entre-temps sur un autre socket (sinon, avec le retrait ci-dessus, un joueur
  qui a eu une coupure ne pourrait plus répondre).
- **Manche 1 créée à la volée** au `start` et à la réhydratation si elle manque (convention 9),
  via `ensureGameForQuiz` sur le quiz de la séance.
- **Réhydratation** : l'état du quiz vient de `state_json.engine`
  (`{ v: 1, phase, questionIndex, questionStartedAt, pausedAt }`), plus des colonnes
  `sessions.current_question_started_at/paused_at` (qui ne sont plus écrites, seulement remises à
  null au lancement, à la fin et à l'abandon). Séance en pause au redémarrage : elle **reste en
  pause** (avant : repassée en `running` si une question était en cours) ; la question
  interrompue est close et notée, la suite attend la reprise. Une séance dont la manche est déjà
  `ended` est terminée.
- La fin de partie décidée par le jeu est permise depuis `paused` (clôture forcée de la dernière
  question en pause, reprise d'une séance en pause) ; avant, `assertTransition` levait.
- **Pause pendant le compte à rebours** d'avant Q1 : le compte à rebours est suspendu puis repris
  (avant : Q1 démarrait quand même, séance en pause).
- `forceAdvance` hors d'une question ouverte (compte à rebours, résultats) : sans effet.

## 7. À faire par les commits suivants

Commit 2 (protocole serveur) :
- Supprimer `RoundContext.legacy`, `QuizRound.legacyMemory()`, `runtime.submitAnswer`, le
  handler `player:submit_answer`, et réécrire `session-resume.service.ts` (quatre fonctions,
  `round.snapshot`). Les tests existants appellent `getSessionRuntime().submitAnswer(...)` :
  les faire passer par `handleAction` / `game:action`.
- Brancher `game:action` sur `runtime.handleAction(sessionId, playerId, action, roundId)` (le
  contrôle de manche `WRONG_ROUND`, `NO_ACTIVE_ROUND`, `PLAYER_NOT_IN_SESSION` y est déjà) ;
  limite 20/s/socket ; rooms `player:<id>` à joindre dans les 3 handlers mobile.
- Émettre `round:started` (au `startActiveRound`) et `round:ended` (dans `finishRound`, avant
  `advanceOrEnd`), schéma `roundInfoSchema` (convention 3). `ActiveRound.position` est déjà là.
- Renommer `console:force_end_question` → `console:force_advance` et la route REST
  `force-end-question` → `force-advance` (la méthode runtime s'appelle déjà `forceAdvance`).
- `joined_question_position` : calculé par `players.service` depuis
  `sessions.current_question_position` puis `runtime.getProgress()` (alimentés par
  `ctx.reportProgress`).
- Garder `joinToken` dans les payloads de plateforme (convention 4).
- Le test « moteur seul » existe (`quiz-engine.test.ts`) : l'étendre à la séquence des vues,
  à la confidentialité (aucune vue `question` avec la bonne réponse) et au « une vue sur trois ».
  Son faux contexte enregistre les appels `legacy` : à remplacer par `emitState`/`emitCue`.
- `api/scripts/sim-session.ts` utilise encore `player:submit_answer` et les anciens événements.

Commit 3 (clients) : voir l'inventaire § 1 pour ne perdre aucun son ni affichage ; gérer
l'erreur `PLAYER_KICKED` au resume mobile.

Commit 4 : supprimer les colonnes devenues inutiles n'est PAS prévu (pas de migration dans
B2-B4) ; documenter `state_json` (plateforme/moteur) et `advanceOrEnd` pour B5.
