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

Commit 2 (protocole serveur) — FAIT, voir § 8 :
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

Commit 3 (clients) : voir § 8.7 (liste précise) et l'inventaire § 1 pour ne perdre aucun son
ni affichage ; gérer l'erreur `PLAYER_KICKED` au resume mobile.

Commit 4 : supprimer les colonnes devenues inutiles n'est PAS prévu (pas de migration dans
B2-B4) ; documenter `state_json` (plateforme/moteur) et `advanceOrEnd` pour B5.

## 8. Commit 2 — protocole serveur

### 8.1 Ce qui a changé

- `packages/validation/src/games/quiz.ts` (nouveau, exporté par l'index) : vues, action, cues
  du quiz. `socket-events.ts` : `roundInfoSchema` (convention 3), `roundStartedSchema`,
  `roundEndedSchema`, `gameStateSchema`, `gameCueSchema`, `gameActionPayloadSchema`,
  `gameActionAckSchema`, `snapshotRoundFieldsSchema` ; suppression des schémas et types
  `session:question_started`, `timer_update`, `answer_submitted_count`, `player_answered`,
  `question_ended`, `next_question_in`, `player:submit_answer` ; `totalQuestions` retiré de
  `sessionStartedSchema`.
- Moteur (`quiz.engine.ts`) : n'émet plus que `ctx.emitState` / `ctx.emitCue`.
  `legacyMemory()` supprimé ; `snapshot(audience, playerId)` renvoie exactement la vue que le
  moteur émettrait à cet instant (testé : après chaque émission de phase, snapshot === dernière
  vue émise, pour chaque destinataire). Plus aucun minuteur d'une seconde.
- Plateforme (`session-runtime.service.ts`) : `RoundContext.legacy` et `runtime.submitAnswer`
  supprimés ; `game:state` = `{ roundId, engineKey, seq, serverNow (ISO), view }`, `seq` par
  destinataire (`screen`, `console`, `mobile:<playerId>`), compté même sans `io` ; `game:cue`
  = `{ roundId, cue, data? }` vers la room de séance de l'audience ; `round:started` émis juste
  avant `round.start()` (lancement et réhydratation) ; `round:ended` émis dans `finishRound`
  après le passage de la manche à `ended`, avant `advanceOrEnd` (donc avant `session:ended`) ;
  `runtime.roundSnapshot(sessionId, audience, playerId?)` → `{ round, gameView, gameSeq }`.
- `session-resume.service.ts` : quatre fonctions courtes, aucune logique de quiz (voir 8.5).
- Handlers : `game:action` sur `/mobile` (schéma, joueur du socket, manche attendue, 20
  actions/s/socket par fenêtre glissante propre au socket, accusé). Rooms `player:<id>` jointes
  à `player:join`, `player:resume`, `player:rejoin_room`. `player:submit_answer` supprimé.
  `console:force_end_question` → `console:force_advance` ; REST `POST /:id/force-end-question`
  → `POST /:id/force-advance` (appelant : `apps/console/.../live-console.tsx`, test tenant-scope).
- `joinToken` conservé dans `screen:session_started`, `nuc:join_screen` et les snapshots écran et
  console (convention 4).

### 8.2 Vues quiz (schémas Zod dans `games/quiz.ts`)

Partie commune à toutes les vues :

| Champ | Type | Sens |
| --- | --- | --- |
| `phase` | `'countdown' \| 'question' \| 'reveal' \| 'done'` | discriminant |
| `questionIndex` | int | index 0-based ; -1 pendant le compte à rebours |
| `totalQuestions` | int | |
| `question` | `null` (countdown, done) ou `{ id, position, text, imageUrl, timeLimitMs, answers: [{ id, position, text }] }` | jamais `isCorrect` |
| `endsAt` | ISO ou null | échéance de la phase : fin du compte à rebours, fin affichée de la question (sans la tolérance serveur de 500 ms), début de la question suivante en `reveal` |
| `pausedRemainingMs` | int ou null | remplace `endsAt` pendant une pause ; les deux null quand la phase n'a pas d'échéance (révélation de la dernière question, `done`) |
| `answeredCount`, `totalPlayers` | int | compteur « N / M réponses » (en `reveal` : réponses notées) |

En `reveal` en plus : `correctAnswerId`, `explanation`, `revealedAt` (ISO, début de la
révélation : les clients y calent la séquence « bonne réponse 2,5 s puis classement »).

- **Écran** (`quizScreenViewSchema`) : en `reveal`, `scoreboard` = les 5 premiers
  (`QUIZ_SCREEN_SCOREBOARD_SIZE`) `[{ playerId, pseudo, avatarUrl, scoreTotal,
  scoreThisQuestion, rank }]`. L'écart affiché (`scoreDiff`) = `scoreThisQuestion` : plus besoin
  de `previousScoreboard`.
- **Console** (`quizConsoleViewSchema`, même schéma) : `scoreboard` complet.
- **Mobile** (`quizMobileViewSchema`, une vue par joueur) : partie commune + `me: { answerId
  (sa réponse, jamais celle d'un autre), locked (arrivé pendant cette question), result:
  { isCorrect, points, rank, scoreTotal } | null }` ; `result` seulement en `reveal` (null pour
  un joueur bloqué). Pas de `scoreboard` mobile (le mobile n'affiche que son résultat).
- Écarts au prompt : `nextAt` fusionné dans `endsAt` (un seul champ d'échéance par phase, un
  seul `useCountdown`) ; ajout de `question.timeLimitMs` (proportion de la barre de temps) et de
  `revealedAt` ; ajout de `rank` dans le classement.
- Action : `{ type: 'answer', payload: { questionId, answerId } }` (chaînes d'entiers) ; accusé
  `{ ok: true, result: { timeToAnswerMs } }`. Codes d'erreur inchangés depuis A3
  (`QUESTION_ALREADY_ENDED`, `SESSION_PAUSED`, `WRONG_QUESTION`, `PLAYER_NOT_IN_SESSION`,
  `LATE_JOIN_LOCKED`, `INVALID_ANSWER`, `ALREADY_ANSWERED`, `VALIDATION_ERROR`,
  `UNKNOWN_ACTION`), plus ceux de la plateforme et du handler : `NO_ACTIVE_ROUND`,
  `WRONG_ROUND`, `SESSION_NOT_IN_MEMORY`, `NOT_JOINED`, `RATE_LIMITED`.

Émissions : à chaque changement de phase ou d'échéance (lancement, ouverture, révélation, fin,
pause, reprise) : 1 vue écran + 1 vue console + 1 vue par joueur. Après une réponse : la vue du
seul joueur (émise de façon synchrone juste après la réservation, donc toujours avant la
révélation), un cue écran, et le compteur écran + console regroupé à ≤ 1 / 250 ms. Arrivée d'un
retardataire : sa vue + le compteur regroupé. Pendant la notation (entre l'échéance et la
révélation), la vue reste `question`.

### 8.3 Cues (`game:cue`, audience `screen` seulement)

| Cue | `data` | Quand |
| --- | --- | --- |
| `question_opened` | `{ questionIndex, answerCount }` | après la vue d'ouverture d'une question |
| `last_seconds` | `{ questionIndex }` | `QUIZ_LAST_SECONDS_MS` (5 s) avant `endsAt` ; annulé par la pause, reposé à la reprise |
| `question_closed` | `{ questionIndex }` | après la vue `reveal` |
| `player_answered` | `{ playerId, pseudo, avatarUrl }` | à chaque réponse acceptée ; jamais la réponse choisie |

`question_opened`, `last_seconds` et `question_closed` existent parce que le prompt les demande
au minimum ; les sons correspondants se déduisent de la phase (voir 8.7) et l'écran NE doit PAS
les jouer deux fois. Seul `player_answered` porte une information absente des vues.

### 8.4 Ancien événement → remplacement

| Ancien | Remplacé par |
| --- | --- |
| `session:question_started` | `game:state` avec `view.phase = 'question'` (nouvelle `questionIndex`) ; cue `question_opened` (écran) |
| `session:timer_update` (chaque seconde) | `view.endsAt` / `view.pausedRemainingMs` + `serverNow` de l'enveloppe ; animation locale |
| `session:answer_submitted_count` | `view.answeredCount` / `view.totalPlayers` (écran, console, ≤ 1 / 250 ms ; mobile aux changements de phase et après sa réponse) |
| `session:player_answered` (`/player`) | `game:cue` `player_answered` (écran) |
| `session:question_ended` | `game:state` avec `view.phase = 'reveal'` (`correctAnswerId`, `explanation`, `scoreboard` / `me.result`) ; cue `question_closed` |
| `session:next_question_in` | `view.endsAt` en `reveal` (null après la dernière question) |
| `player:submit_answer` + `error` | `game:action` `{ roundId, type: 'answer', payload }` avec accusé `{ ok, result \| code, message }` |
| `console:force_end_question` / `POST /:id/force-end-question` | `console:force_advance` / `POST /:id/force-advance` |
| `session:started.totalQuestions` | `view.totalQuestions` ; `round:started` annonce la manche |
| champs quiz des snapshots (`currentQuestion`, `lastResults`, `showingResults`, `lateJoinWait`, `missedQuestions`, `timerRemainingMs`, `canAnswerCurrentQuestion`, `totalQuestions`, `quiz` complet de la console, `joinedQuestionPosition`) | `round` + `gameView` + `gameSeq` du snapshot |
| — (nouveau) | `round:started` (`roundInfoSchema`), `round:ended` (`roundEndedSchema`) |

Conservés dans les payloads de plateforme : `session:started.quiz` (habillage : fonds du lobby
et du jeu) et `.audio`, `quiz` et `audio` du snapshot écran. Ce sont des réglages de séance
utilisés hors manche (lobby, fin) ; à renommer (`theme`) quand B5 fera varier l'habillage par
manche — point ouvert.

### 8.5 Snapshots (`session:state_snapshot`, règle 5)

Toujours `round` (= payload de `round:started`, ou null), `gameView` (= `round.snapshot`), `gameSeq`
(seq de la dernière vue émise vers CE destinataire, 0 si aucune). Le client prend `gameView` et
ignore ensuite tout `game:state` de `seq <= gameSeq`.

- Mobile (`player:resume`) : `player { playerId, pseudo, avatarUrl, scoreTotal, currentRank }`,
  `session { sessionId, slugShort, state, totalPlayers, audioMuted }`, `finalResults` et
  `prizeAvailabilityByRank` (séance terminée), `prizes` (lobby, terminée).
- Join pendant la partie (réponse de `player:join` / `POST /api/players/join`,
  `stateSnapshot`) : `{ sessionState, round, gameView, gameSeq }`.
- Écran (`nuc:resume`) : `nuc`, `session { …, joinToken, … }`, `audioMuted`, `quiz` (habillage),
  `audio`, `players` (ordre d'arrivée), `scoreboard` (5 premiers, 3 en fin), `lobbyTimerRemainingMs`,
  `finalScoreboard`, `prizes`.
- Console (`console:resume`) : `session { …, joinToken, … }`, `players` (classés),
  `scoreboard` (5 premiers), `lobbyTimerRemainingMs`, `finalScoreboard`, `prizes`. Le quiz
  complet avec les bonnes réponses n'y est plus : la console l'a par `GET /api/sessions/:id/full`
  (authentifié), qu'elle charge déjà.

### 8.6 Tests

Ajoutés : `quiz-engine.test.ts` (validation Zod de chaque vue émise, séquence des phases,
pause → `pausedRemainingMs` puis échéance décalée, retardataire bloqué, résultat mobile,
cues ; confidentialité : chaque vue `question` sérialisée, sans `isCorrect` ni
`correctAnswerId`, et hors de la liste des réponses proposées aucune bonne réponse ni réponse
d'un autre joueur ; propriété « vue complète » : client recevant 1 `game:state` sur 3 =
client complet, à chaque message reçu et à la fin, pour chaque destinataire, `seq` strictement
croissant ; snapshot === dernière vue émise ; émissions linéaires),
`game-action.socket.test.ts` (double action, action en pause, mauvaise manche, payload
invalide, type inconnu, socket non joint, limite 20/s, vue d'un joueur non reçue par un autre,
`round:started` / `round:ended` validés par leurs schémas, `console:force_advance`),
`session-resume.test.ts` (snapshot mobile en `question`, en pause, en `reveal`, `gameSeq` = dernier
`seq` reçu ; redémarrage serveur en pleine question → snapshot `reveal` noté). Helper commun :
`tests/helpers/game-protocol.ts`.

Réécrits (observation seulement) : `session-runtime.test.ts`, `session-runtime.platform.test.ts`,
`late-join.test.ts`, `session-socket.test.ts`, `tenant-scope.test.ts` (URL force-advance),
`quiz-engine.test.ts` (faux contexte : `emitState`/`emitCue` au lieu de `legacy`).

Assertions de comportement modifiées, et pourquoi :

1. `session-resume` « console:resume returns quiz with isCorrect » : la règle 5 interdit le
   contenu de moteur au premier niveau du snapshot, et la bonne réponse ne doit apparaître dans
   aucune vue avant `reveal`. Le comportement « la console connaît les bonnes réponses » est
   vérifié sur sa source d'hydratation (`GET /:id/full`) ; le test vérifie aussi que le snapshot
   n'a plus `quiz` et porte `round/gameView/gameSeq`.
2. `session-socket` « submit_answer increments answer_submitted_count » : le compteur était
   observé sur le socket mobile d'un AUTRE joueur. Le mobile ne reçoit plus le compteur des
   autres (vue mobile émise aux changements de phase et après sa propre réponse, exigence du
   prompt ; le store mobile l'ignorait de toute façon). Le compteur 1 / 2 est vérifié sur la
   console.
3. `quiz-engine` : le classement de révélation porte en plus `rank` ; `answer_submitted_count
   {2,2}` → `answeredCount/totalPlayers` de la vue ; `next_question_in { ms }` →
   `endsAt - now = RESULTS_DISPLAY_MS` ; « pas de next_question_in après la dernière » →
   `endsAt: null` sur la dernière révélation.
4. `late-join` `canAnswerCurrentQuestion: false` → `gameView.phase = 'question'` et
   `me.locked = true` (même règle, plus précise : l'ancien drapeau était toujours false).
5. `session-runtime` « batches answer_submitted_count » : observé sur la console (vues `question`
   après l'ouverture) au lieu du mobile ; mêmes seuils (< 20 émissions, dernière = 20 avant la
   révélation).

Changements de comportement (hors tests) : la révélation en pause annonce
`pausedRemainingMs = RESULTS_DISPLAY_MS` (la reprise relance l'affichage complet, comme avant) ;
une reprise serveur d'une séance en pause entre deux questions recalcule la révélation depuis
`player_answers` (lecture seule) pour pouvoir l'afficher ; le mobile ne reçoit plus le compteur
des autres ni le chrono chaque seconde.

Charge (`pnpm sim:session -- --players 300`, 3 questions de 10 s, MySQL local, serveur et 301
clients dans le même process) :

| Mesure par question | Q1 | Q2 | Q3 (dernière) |
| --- | --- | --- | --- |
| Émissions serveur (`nsp.to(room).emit`) | 1 265 | 1 265 | 1 567 |
| dont vues mobiles / écran / console / cues écran | 900 / 31 / 31 / 303 | 900 / 31 / 31 / 303 | 1 200 / 32 / 32 / 303 |
| Livraisons reçues (300 mobiles + console) | 931 | 931 | 1 232 |
| Clôture : échéance + 500 ms → révélation reçue par la console | 258 ms | 280 ms | 276 ms |
| Étalement de la révélation sur les 300 mobiles | 5 ms | 6 ms | 6 ms |

Soit ≈ 3 N + 2 × (durée / 250 ms) + N cues + 3 : linéaire. Q3 compte en plus les 300 vues
`done`. Le compte à rebours initial : 302 émissions. Pour comparaison, l'ancien protocole
livrait à chaque mobile `timer_update` chaque seconde et chaque compteur (≈ 10 + 30 messages ×
300 mobiles par question) et `question_ended` avec le classement complet à chacun (300 × 300
lignes : N²) — estimation, non mesurée.

### 8.7 À faire au commit 3 (clients)

Communs aux trois apps :
- Écouter `round:started` (`roundInfoSchema`) → `round` ; `game:state`
  (`gameStateSchema`) → ignorer si `env.roundId !== round.roundId` ou `env.seq <= gameSeq`,
  sinon `gameView = view`, `gameSeq = seq`, `clockOffsetMs = Date.parse(env.serverNow) -
  Date.now()` (lissage possible : garder la médiane des 5 derniers) ; `game:cue`
  (`gameCueSchema`) → éphémère ; `round:ended` (`roundEndedSchema`) → `roundScoreboard`.
- `session:state_snapshot` : `round`, `gameView`, `gameSeq` remplacent tout l'état de jeu ; à
  appliquer AVANT les `game:state` suivants (même ordre sur le socket).
- Valider `view` avec le schéma du moteur (`quizScreenViewSchema`, `quizConsoleViewSchema`,
  `quizMobileViewSchema`) ; invalide → `games/unknown-game.tsx` + Sentry.
- `useCountdown(endsAt, pausedRemainingMs, clockOffsetMs)` : `remaining = pausedRemainingMs ??
  max(0, Date.parse(endsAt) - (Date.now() + clockOffsetMs))`. Barre : `remaining /
  question.timeLimitMs`. Ne plus écouter `session:timer_update` ni `session:next_question_in`.
- Retirer les écoutes `session:question_started`, `timer_update`, `answer_submitted_count`,
  `player_answered`, `question_ended`, `next_question_in` ; `session:started` n'a plus
  `totalQuestions` (prendre `view.totalQuestions`).
- Supprimer le bloc TEMPORAIRE de types de `apps/console/lib/stores/live-session-store.ts`.

Mobile :
- Rooms : rien à faire (le serveur ajoute `player:<id>`), mais `player:resume` à chaque connexion
  reste nécessaire.
- `sendAction('answer', { questionId, answerId })` = `socket.emit('game:action', { roundId,
  type, payload }, ack)` avec délai de 5 s ; mise à jour optimiste du bouton, corrigée par
  `view.me.answerId` de la vue suivante ; `ack.ok === false` → message selon `code`.
- États : `phase = question` et `me.locked` → écran d'attente retardataire ; `question` et
  `me.answerId` → « en attente des autres » ; `reveal` → `me.result` (null si bloqué) ;
  `countdown` → compte à rebours ; `done` puis `session:ended` → final. Pause : plateforme
  (`session:paused`), la vue porte `pausedRemainingMs`.
- `player:resume` peut renvoyer `error { code: 'PLAYER_KICKED' }` → écran « retiré ».
- Join pendant la partie : `stateSnapshot = { sessionState, round, gameView, gameSeq }`.

Écran cinéma (sons dans `use-audio-director.ts`, à dériver ainsi) :
- Musique : inchangée (phase de plateforme + `gameView` présent = jeu).
- `questionStart` + `answerReveal` ×N décalés : passage à `phase = 'question'` avec une nouvelle
  `questionIndex` (pas le cue `question_opened`).
- `lastSeconds` : minuteur local sur `endsAt - TIMER_URGENT_THRESHOLD_SEC` corrigé de
  `clockOffsetMs`, annulé si `pausedRemainingMs` (pas le cue `last_seconds`).
- `questionEnd` : passage à `phase = 'reveal'` (pas le cue `question_closed`).
- `final` : `session:ended` (plateforme, inchangé).
- `playerAnswered` : cue `player_answered` (seul son déclenché par un cue) ; flash pseudo +
  avatar comme aujourd'hui.
- Révélation : séquence « bonne réponse 2,5 s puis classement » calée sur `view.revealedAt`
  (une reprise au milieu saute à la bonne étape) ; classement = `view.scoreboard` (5),
  `scoreDiff = scoreThisQuestion`.
- Snapshot écran : `nuc:resume` (inchangé côté émission).

Console :
- `console:force_advance` (socket) ou `POST /api/sessions/:id/force-advance` (déjà migré dans
  `live-console.tsx`).
- Question courante : `gameView.question` ; surlignage de la bonne réponse pendant la question :
  depuis le quiz de `GET /:id/full` (la vue ne la contient qu'en `reveal`), comme aujourd'hui.
- Compteur : `answeredCount / totalPlayers` ; classement complet en `reveal` dans
  `view.scoreboard`.
