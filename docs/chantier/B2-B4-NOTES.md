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

## 9. Commit 3a — mobile

### 9.1 Ce qui est fait

- **Hook partagé** dans `packages/ui/src/countdown.ts`, exporté par `@quiz-app/ui` :
  - `useCountdown(endsAt, pausedRemainingMs, clockOffsetMs, { mode?: 'interval' | 'frame',
    intervalMs?: 250 }) → number | null` : ms restantes (>= 0), `pausedRemainingMs` figé en pause,
    `null` sans échéance. `mode: 'frame'` = requestAnimationFrame (60 i/s, écran cinéma) ;
    défaut `'interval'` toutes les 250 ms (mobile, console). Plus aucun rafraîchissement à 0, en
    pause ou sans échéance.
  - Fonctions pures : `computeRemainingMs(endsAt, pausedRemainingMs, clockOffsetMs, localNow?)`
    (utile pour un minuteur `lastSeconds` côté écran), `pushClockSample(samples, serverNow,
    localNow?, windowSize = 5) → { samples, offsetMs }` (médiane des 5 derniers `serverNow`),
    `clockOffsetSampleMs`, `medianClockOffsetMs`, `CLOCK_OFFSET_WINDOW`.
- **Store** `apps/mobile/lib/stores/player-store.ts` : plus aucun champ quiz. Plateforme :
  identité, `state`, `totalPlayers`, `players`, `scoreTotal`, `currentRank`, `final*`, `prizes`,
  `joinedLate` (ex-`joinedQuestionPosition`, seulement depuis l'accusé de join : le snapshot
  mobile ne le porte plus), `connectionStatus`. Manche : `round`, `gameView`, `gameViewInvalid`,
  `gameSeq`, `clockOffsetMs` (+ `clockSamples`), `roundScoreboard`. `uiState` = `lobby | game |
  paused | round_end | final_results | aborted | kicked`. `game:state` : enveloppe validée
  (`gameStateSchema`), ignorée si autre manche ou `seq <= gameSeq` (le décalage d'horloge est
  quand même échantillonné), `view` validée par le schéma du moteur
  (`games/view-schemas.ts`) ; invalide ou moteur inconnu → `gameViewInvalid` (rendu de repli)
  et `Sentry.captureMessage` (`lib/report-issue.ts`), une fois par manche et par raison.
  `markKicked()` : état terminal, plus aucun événement ni snapshot ne le quitte.
- **Rendu** : `games/types.ts` (`GameRendererProps { round; view; clockOffsetMs; sendAction? }`,
  `SendGameAction`), `games/registry.ts` (`next/dynamic`), `games/view-schemas.ts` (schémas
  de vue par moteur, séparés du registre pour que le store reste testable sans Next),
  `games/game-stage.tsx`, `games/unknown-game.tsx`, `games/quiz/` (anciens composants déplacés
  avec `git mv`, mêmes classes, ne lisent plus que la vue). `components/player-screen.tsx` rend
  les écrans de plateforme (et sert aussi à `/dev/play`), plus `round-end-screen.tsx` et
  `kicked-screen.tsx`.
- **Actions** : `lib/game-actions.ts` `sendGameAction(socket, roundId, type, payload, 5000)`
  (`socket.timeout(5000).emit('game:action', …, ack)`), ne rejette jamais : `TIMEOUT`,
  `NOT_CONNECTED`, `INVALID_ACK`. Le quiz affiche le choix tout de suite (écran « Réponse
  enregistrée ») tant que la vue n'a pas changé ; la vue suivante fait foi ; un refus ramène à
  la question avec un message court (tutoiement) selon le code.
- **Fin de manche** : `round:ended` → `roundScoreboard`, `scoreTotal`, `currentRank`. Écran
  `round_end` seulement si `position < totalRounds` : pour la dernière manche, `session:ended`
  suit aussitôt et l'écran final prend la place directement (pas d'écran affiché quelques ms).
  En attendant, la vue `done` du quiz affiche « Partie terminée ! Les résultats arrivent… ».
- **`PLAYER_KICKED`** : `error` sur le socket → écran « Tu as été retiré de la partie ». Un
  `player:left` portant son propre `playerId` (exclusion pendant qu'il est connecté) relance
  `player:resume`, qui confirme l'exclusion ou le remet dans la partie.
- Hook socket : écoute `round:started`, `game:state`, `round:ended` + plateforme ; plus
  aucun ancien événement de question. `game:cue` n'est pas écouté (aucun cue mobile).
- Tests : `player-store.test.ts` réécrit (vue de question depuis `game:state`, depuis le
  snapshot, `seq` ancien ou égal ignoré, `seq` du snapshot respecté, autre manche ignorée, vue
  complète « dernier message seul = tous les messages », vue invalide → repli + un seul message
  Sentry, moteur inconnu, décalage d'horloge, pause/reprise, `round:ended` dernière manche ou
  non, exclusion, join retardataire) ; `game-actions.test.ts` (accusé, refus, délai, socket
  fermé, accusé illisible ; `computeRemainingMs` et `pushClockSample`).

### 9.2 Écarts visuels assumés (mobile)

- Compte à rebours d'avant Q1 : avant, le mobile restait sur l'écran du lobby ; il affiche
  maintenant « C'est parti ! La première question arrive… Première question dans ~Ns » (même
  gabarit que l'écran retardataire), comme prévu en 8.7.
- Retardataire en `reveal` (pas noté, `me.result = null`) : écran d'attente avec le compte à
  rebours jusqu'à la question suivante (avant : « TROP TARD +0 »).
- Refus d'une réponse : petit message rouge sous les réponses (avant : rien).

### 9.3 Pour les agents player et console

- Réutiliser `useCountdown` / `pushClockSample` / `computeRemainingMs` de `@quiz-app/ui` ;
  barre de l'écran : `useCountdown(view.endsAt, view.pausedRemainingMs, clockOffsetMs,
  { mode: 'frame' })` puis `remaining / view.question.timeLimitMs`.
- Même découpage conseillé : `games/view-schemas.ts` (schéma `quizScreenViewSchema` /
  `quizConsoleViewSchema`) lu par le store, `games/registry.ts` pour les composants. Garder la
  même logique de store (`round`, `gameView`, `gameViewInvalid`, `gameSeq`, `clockSamples`,
  `clockOffsetMs`, `roundScoreboard`) ; s'inspirer de `apps/mobile/lib/stores/player-store.ts`.
- `vitest` du mobile tourne en environnement `node` sans transformation JSX : tester le store
  et les fonctions pures, pas les composants.
- Non vérifié à l'œil (pas d'écran) : rendu mobile de chaque phase ; contrôlé par
  `next build` et un rendu serveur jetable de chaque phase du quiz (sans erreur). La page
  `/dev/play` couvre toutes les phases (nouveaux onglets : Départ, Fin manche, Exclu, Repli).

## 10. Commit 3b — player (écran cinéma)

### 10.1 Ce qui est fait

- **Store** `apps/player/lib/stores/nuc-store.ts` : plus aucun champ quiz (`currentQuestion`,
  `questionStartedAt`, `remainingMs`, `answersSubmittedCount`, `lastResults`,
  `previousScoreboard`, `nextQuestionInMs`, `totalQuestions`, `answeredFlashes`… supprimés).
  Plateforme : contexte NUC/cinéma, `uiState` (`idle | lobby | game | round_end |
  final_results | aborted`), `isPaused` (calque), `audioMuted`, `sessionId`, `slugShort`,
  `joinToken` (A2), `players`, `totalPlayers`, `lobbyRemainingMs`, `scoreboard` (snapshot),
  `audio`, habillage (`quiz*`/`lobby*`, `lateJoinQrEnabled`…), `final*`, `prizes`,
  `abortReason`, `connectionStatus`. Manche : `round`, `gameView`, `gameViewInvalid`, `gameSeq`,
  `clockSamples`, `clockOffsetMs`, `roundScoreboard`. Même logique que le mobile (§ 9) :
  enveloppe `gameStateSchema`, autre manche ou `seq <= gameSeq` ignorés (l'horloge est quand
  même échantillonnée), vue validée par `quizScreenViewSchema` (`games/view-schemas.ts`),
  invalide / moteur inconnu → `gameViewInvalid` + `Sentry.captureMessage('screen: invalid game
  view')` une fois par manche et par raison, jamais d'exception.
- `selectScreenDisplay(state)` : ce que l'écran affiche. `uiState = game` mais la règle du
  moteur `showsLobby(view)` (quiz : `phase = countdown`) → `lobby` : le lobby reste à l'écran
  pendant le compte à rebours d'avant Q1, avec la musique du lobby, comme avant. Lu par la page
  ET le directeur audio.
- **Cues** : `game:cue` est validé (`gameCueSchema`) et filtré (manche active, pas d'état
  terminal) par le store, mais jamais stocké : il est publié sur `lib/game-cues.ts`
  (`subscribeGameCues` / `publishGameCue`). Abonnés : le rendu quiz (flashs des pseudos) et le
  directeur audio.
- **Rendu** : `games/types.ts` (`GameRendererProps`, `ScreenGameRules`, `SfxPlan`),
  `games/registry.ts` (`next/dynamic`), `games/view-schemas.ts`, `games/screen-rules.ts`
  (règles d'écran par moteur, sans JSX, testables), `games/game-stage.tsx`,
  `games/unknown-game.tsx` (logo + « La partie continue… »), `games/quiz/` :
  `index.tsx` (ex-`components/states/question-state.tsx`, `git mv`, même balisage et mêmes
  classes), `answer-card.tsx`, `timer-bar.tsx` (prend `remainingMs` au lieu de `startedAt`),
  `answered-flashes.tsx` (état local alimenté par le cue `player_answered`, vidé à chaque
  changement d'étape), `screen-rules.ts`. `components/states/question-results-state.tsx`
  (déjà non utilisé) supprimé. Hors `GameStage` : idle, lobby, pause, `round-end-state.tsx`
  (nouveau), résultats finaux, abandon, bannière de connexion, QR des retardataires.
- **Temps** : barre de la question = `useCountdown(endsAt, pausedRemainingMs, clockOffsetMs,
  { mode: 'frame' })` (60 i/s) ; « Question suivante dans N… » = `useCountdown` en mode
  intervalle sur l'`endsAt` de la vue `reveal`. Plus d'écoute de `session:timer_update` ni de
  `next_question_in`.
- **Révélation** : séquence « bonne réponse 2,5 s → fondu 0,5 s → classement split » calée sur
  `view.revealedAt` + `clockOffsetMs` (un rechargement au milieu saute à la bonne étape) ;
  `scoreDiff = scoreThisQuestion`. La vue `done` (quelques ms avant `session:ended`) garde à
  l'écran la dernière révélation reçue par le composant (sinon écran vide un instant).
- **Fin de manche** : `round:ended` → `roundScoreboard` ; `uiState = round_end` seulement si
  `position < totalRounds` (sinon `session:ended` suit et l'écran final prend la place
  directement).
- **Tests** (nouveau : `vitest` dans `apps/player`, `pnpm --filter @quiz-app/player test`,
  ajouté à la CI) : `lib/stores/nuc-store.test.ts` (lobby pendant le compte à rebours, `seq`
  ancien / égal ignoré, autre manche ignorée, propriété « vue complète » un message sur trois,
  snapshot puis `seq <= gameSeq`, snapshot `running` sans vue, vue invalide → repli + un seul
  Sentry, moteur inconnu, décalage d'horloge, relais des cues de la seule manche active,
  `round:ended` dernière manche ou non, pause) ; `games/quiz/screen-rules.test.ts`
  (correspondance des sons et plan de musique, fonctions pures).

### 10.2 Sons : ancien déclencheur → nouveau

| Son | Avant | Maintenant |
| --- | --- | --- |
| `lobbyMusic` | `uiState = lobby` (y compris compte à rebours d'avant Q1) | affichage `lobby` (`selectScreenDisplay`), donc aussi la vue quiz `countdown` |
| `gameMusic` | `uiState = question \| question_results` | affichage `game` ou `round_end` |
| `scoresMusic` | `uiState = final_results` | idem (`session:ended`, plateforme) |
| musique continue | premier slot disponible hors idle/abandon | inchangé |
| ambiance du cinéma | `idle` + `backgroundMusicUrl` | inchangé |
| pause musique | `isPaused` | inchangé (`session:paused` / `resumed`) |
| `questionStart` | `session:question_started` (`uiState = question`, nouvel id de question) | entrée dans l'étape `question:<questionIndex>` de la vue (`stageKey` change), sans le cue `question_opened` |
| `answerReveal` ×N | timers `answerRevealDelayMs(position, i)` à l'ouverture | identique, planifiés par `sfxOnEnter` de la vue `question` ; annulés au changement d'étape |
| `lastSeconds` | timer local `questionStartedAt + timeLimit - TIMER_URGENT_THRESHOLD_SEC` | timer local sur `Date.parse(endsAt) - TIMER_URGENT_THRESHOLD_SEC*1000 - (now + clockOffsetMs)`, pas en pause (`pausedRemainingMs`), reprogrammé à la reprise, joué une seule fois par question ; sans le cue `last_seconds` |
| `questionEnd` | `session:question_ended` (`uiState = question_results`) | entrée dans l'étape `reveal:<questionIndex>`, sans le cue `question_closed` |
| `final` | `uiState = final_results` | idem (plateforme) |
| `playerAnswered` | `session:player_answered` → un flash → un son par flash | cue `player_answered` (seul son issu d'un cue) : un son par cue valide avec pseudo, comme le flash |

Écarts : `lastSeconds` ne part plus pendant une pause (avant : le timer local ignorait la
pause) ; un `nuc:resume` qui renvoie la même étape ne rejoue rien (inchangé) ; un rechargement
de page en pleine question ou révélation rejoue `questionStart` / `questionEnd` (comme avant).

### 10.3 Écarts visuels assumés (écran)

- Barre de temps figée pendant la pause (avant : elle continuait derrière le calque).
- Classement split : « +N » = points de la question (avant : différence avec le classement
  précédent, faux après une reconnexion) ; en-tête « Question N / M » de la question révélée
  pendant le fondu vers la suivante.
- Nouvel écran `round_end` (jamais affiché avec une seule manche) et repli `unknown-game`.

### 10.4 Pour l'agent console

- Reprendre `lib/stores/nuc-store.ts` (ou le mobile) : validation de l'enveloppe, filtre
  `roundId` / `seq`, `validateView` avec `quizConsoleViewSchema`, `reportedInvalidRounds`.
- `useCountdown` en mode intervalle suffit ; `revealedAt` n'est utile que pour une animation.
- La console ne reçoit pas de cue (`game:cue` part vers l'audience `screen` seulement).
- Le linter des apps ne couvre que `app/` (`eslint app/`) : lancer aussi `npx eslint games
  hooks lib` à la main ; `react-hooks/exhaustive-deps` n'est pas configuré (un
  `eslint-disable` sur cette règle casse le lint).

### 10.5 Non vérifié

Rendu à l'œil et audio réel sur le NUC (pas d'écran ni de son ici). Contrôlé par `next build`,
les tests et un rendu serveur jetable du composant quiz pour chaque phase (`countdown` → rien,
`question`, `reveal` juste révélé → réponses colorées, `reveal` après 3 s → split, sans
erreur). Les enchaînements animés (fondus, compte à rebours, flashs) et le calage des sons
restent à tester à la main.

## 11. Commit 3c — console (cinéma)

### 11.1 Ce qui est fait

- **Store** `apps/console/lib/stores/live-session-store.ts` : le bloc TEMPORAIRE des anciens
  types (commit 2) et toute la partie quiz (`currentQuestion*`, `questionStartedAt`,
  `questionTimeLimitMs`, `remainingMs`, `answersSubmittedCount`, `showingResults`,
  `lastQuestionResults`, `nextQuestionInMs`, `totalQuestions`) sont supprimés. Plateforme
  inchangée (`sessionId`, `slugShort`, `state`, `totalPlayers`, `lobbyRemainingMs`, `audioMuted`,
  `players`, `final*`, `abortReason`, salle, `prizes`, `consolationPrizesClaimed`,
  `connectionStatus`). Manche : `round`, `gameView`, `gameViewInvalid`, `gameSeq`, `clockSamples`,
  `clockOffsetMs`, `roundScoreboard`, même logique que player/mobile (enveloppe
  `gameStateSchema`, autre manche ou `seq <= gameSeq` ignorés en échantillonnant quand même
  l'horloge, vue validée par `quizConsoleViewSchema` via `games/view-schemas.ts`, invalide ou
  moteur inconnu → `gameViewInvalid` + `Sentry.captureMessage('console: invalid game view')` une
  fois par manche et par raison, jamais d'exception).
- `quiz` (quiz complet de `GET /api/sessions/:id/full`, authentifié) reste dans le store : ce
  n'est pas l'état de jeu mais le contenu de la séance (titre et couverture de l'en-tête, bonnes
  réponses). Il est passé au rendu du moteur par `GameStage` en prop `content`.
- **Bug corrigé au passage** : depuis le commit 2, `applySocketSnapshot` sortait tout de suite
  (le snapshot console n'a plus `quiz`), donc la reprise `console:resume` n'appliquait plus rien.
  Il applique maintenant les champs de plateforme et `round` / `gameView` / `gameSeq` (règle 5).
- **Scores de la liste des joueurs** : avant, `question_ended` remplaçait `players` par le
  classement. Maintenant, la règle console du moteur (`scoreboard(view)`, quiz : classement
  complet de la vue `reveal`) et `round:ended` mettent à jour les scores (fusion par `playerId`).
- **Rendu** : `games/types.ts` (`GameRendererProps { round; view; clockOffsetMs; sendAction?:
  never; content }`, `ConsoleGameRules`), `games/registry.ts` (`next/dynamic`),
  `games/view-schemas.ts`, `games/console-rules.ts` (règles sans JSX : `progressLabel`,
  `canForceAdvance`, `scoreboard`), `games/game-stage.tsx`, `games/unknown-game.tsx` (encadré
  sobre « Manche en cours… », vouvoiement), `games/quiz/` : `index.tsx`, `question-preview.tsx`
  et `timer-bar.tsx` (`git mv` depuis `components/live-console/`, même balisage et mêmes
  classes, props issues de la vue), `console-rules.ts`. `LiveHeader`, `PlayersList`,
  `ControlsPanel`, lobby, pause, fin, abandon et bannière restent hors de `GameStage`.
- **Bonne réponse pendant la question** : `quizHighlightedAnswerIds(view, content)` ; en
  `reveal`, `view.correctAnswerId` ; sinon (question en cours, ou révélation sans bonne réponse)
  les `isCorrect` de la question de même `id` dans le quiz de `GET /:id/full`. Quiz pas encore
  chargé → rien n'est surligné (jamais d'invention).
- **Temps** : barre = `useCountdown(endsAt, pausedRemainingMs, clockOffsetMs, { mode: 'frame' })`
  (fluide comme l'ancienne boucle rAF), figée en pause, vide (0 s) en `reveal` comme avant.
- **Contrôles** : `onForceEnd` → `onForceAdvance` → `POST /api/sessions/:id/force-advance` (seul
  appelant ; la console n'émet pas `console:force_advance` par socket). Libellé « ⏭ Forcer la
  fin » conservé. Actif seulement si la règle du moteur le dit (quiz : `phase = question`, le
  moteur ignore `forceAdvance` ailleurs) ; en repli (vue invalide, moteur inconnu) il reste
  actif, le serveur décide.
- En-tête « Question N / M » : `progressLabel` de la vue (`questionIndex + 1`, « – » pendant le
  compte à rebours) ; « – » sans vue.
- Hook : écoute `round:started`, `game:state`, `round:ended` + plateforme ; plus aucun ancien
  événement. Pas de `game:cue` (audience `screen` seulement).
- **Tests** (nouveau : `vitest` dans `apps/console`, `pnpm --filter @quiz-app/console test`,
  ajouté à la CI ; `lint` couvre aussi `games/`) : `lib/stores/live-session-store.test.ts`
  (vue de question, `seq` ancien / égal ignoré, autre manche ignorée, `seq` du snapshot
  respecté, propriété « vue complète » un message sur trois, scores depuis la révélation, vue
  invalide → repli + un seul Sentry puis reprise, moteur inconnu, décalage d'horloge,
  `round:ended`, snapshot sans quiz appliqué) ; `games/quiz/console-rules.test.ts` (surlignage
  depuis le contenu authentifié pendant la question, depuis la vue en révélation, libellé,
  disponibilité de « Forcer la fin »).

### 11.2 Écarts visuels assumés (console)

- « Forcer la fin » est grisé pendant le compte à rebours d'avant Q1 (avant : actif, sans effet).
- Barre de temps figée pendant la pause (la console affiche de toute façon l'écran de pause).
- En-tête : numéro = `questionIndex + 1` (avant : `position` en base, identique en pratique).
- Vue `done` (quelques ms avant `session:ended`) : zone de jeu vide.

### 11.3 Non vérifié / points ouverts

- Rendu à l'œil (pas de navigateur ici) : contrôlé par `next build`, les tests et le typage.
- B5 : `GET /:id/full` ne renvoie que le quiz de la séance (`session.quiz`). Avec plusieurs
  manches, le contenu passé au rendu devra être celui du jeu de la manche (par `round.game`) ;
  `quizHighlightedAnswerIds` cherche la question par `id`, donc un contenu d'un autre quiz ne
  surligne simplement rien.
- `LiveHeader` lit `totalPlayers` par `getState()` (non réactif) : bug antérieur, non touché.

## 12. Commit 4 — nettoyage et documentation

### 12.1 Ce qui est fait

- **Code mort** : la recherche des anciens noms (`question_started`, `timer_update`,
  `answer_submitted_count`, `player_answered` comme événement, `question_ended`,
  `next_question_in`, `submit_answer`, `force_end_question`, `force-end-question`) ne trouve plus
  rien dans `api/`, `packages/` et `apps/` (seuls restent le cue `player_answered`, voulu, et la
  colonne `current_question_started_at`, gardée faute de migration). Les commits 2 et 3 avaient
  déjà tout retiré, sauf un schéma : `playerJoinStateSnapshotSchema` / `PlayerJoinStateSnapshot`
  (`packages/validation/src/rest-api.ts`, ancienne forme quiz du snapshot de join :
  `currentQuestionPosition`, `canAnswerCurrentQuestion`, `timerRemainingMs`…), utilisé par
  personne, supprimé. Champs de store, composants, hooks et exports : vérifiés un par un (et
  `tsc --noUnusedLocals --noUnusedParameters` sur api, player, mobile, console) ; rien d'autre
  n'est devenu inutile du fait du protocole. Ce qui était déjà mort avant B2-B4 n'est pas touché
  (ex. `apps/console/hooks/use-active-session.ts`, exports de `packages/types`).
- **Lint** : `apps/player` et `apps/mobile` lintent `app/ components/ games/ hooks/ lib/` (avant :
  `app/` seul) ; la console couvrait déjà ces dossiers. Aucune erreur ni avertissement à corriger.
  Plus aucun `eslint-disable` sur `react-hooks/exhaustive-deps` dans le dépôt, et aucune app ne
  configure ce plugin : rien à faire (`apps/admin` lint toujours `app/` seul, hors périmètre).
- **`joinedLate` (§ 9.1)** : le snapshot mobile (`player:resume`) porte
  `player.joinedLate = players.joined_question_position != null` (champ de plateforme) ; le store
  mobile le prend dans `applySnapshot` (valeur connue gardée si le champ manque). Un retardataire
  qui recharge sa page garde « Arrivé en cours de partie » sur l'écran final. Tests :
  `late-join.test.ts` (« player:resume after the end keeps the late-join flag » : retardataire
  `true`, joueur du lobby `false`, séance terminée) et `player-store.test.ts` (rechargement :
  store vierge + snapshot `ended`).
- **Documentation** : `PROJECT_REFERENCE.md` § 3.4 (reprise par le protocole), § 4.8 (le flash
  des pseudos vient du cue, sons déclarés dans les règles d'écran), § 7 (namespaces, rooms,
  événements réels de plateforme et de manche, exemple de vue, les 7 règles du protocole), § 10
  (cycle de vie avec manches, `advanceOrEnd`, `state_json`, réhydratation) ; `APP_OVERVIEW.md` § 8
  (et la mention d'un événement `player_late_joined` qui n'a jamais existé, § 9) ;
  `docs/ajouter-un-moteur.md` (nouveau).

### 12.2 Points ouverts laissés par B2-B4

- Colonnes `sessions.current_question_started_at` / `current_question_paused_at` : plus écrites
  (remises à null seulement), à supprimer par une migration ultérieure.
- `session:started.quiz` / `.audio` et `quiz` / `audio` du snapshot écran : habillage de séance
  pris sur le quiz de la séance, à renommer (`theme`) quand B5 fera varier l'habillage par manche.
- `GET /api/sessions/:id/full` (contenu de la console) ne renvoie que le quiz de la séance (§ 11.3).
- `LiveHeader` (console) lit `totalPlayers` sans abonnement (bug antérieur).

## 13. Synthèse B2-B4 pour la relecture humaine

Commits : 83bd658 (1/4), ad7846b (2/4), 0a9edc5 / 6b7fec5 / 1c63a8d (3/4 mobile, player,
console), puis le commit 4/4.

### (a) Interface moteur finale et écarts

`api/src/modules/games/engine.types.ts`, registre `engine-registry.ts`, quiz dans
`engines/quiz/quiz.engine.ts`, plateforme `sessions/session-runtime.service.ts`. Proposition du
prompt conservée, avec ces écarts (détail § 3) :

| Écart | Raison |
| --- | --- |
| `RoundContext.setTimer(ms, fn)` | avec `now()` seul, une horloge simulée ne pilote pas les `setTimeout` du moteur ; la plateforme les annule aussi en filet |
| `RoundContext.reportProgress(step)` | le moteur n'écrit pas `sessions`, mais `current_question_position` sert aux listes de séances et à `joined_question_position` (rapports) |
| `onPlayerJoined(playerId, { rejoin })` | un joueur repris après un départ (convention 8) n'est pas un retardataire |
| `players.meta()` → `RoundPlayerMeta` ; types `ScoreAward`, `GameAction`, `GameDefinition`, `RoundRestore` nommés | lisibilité |
| `award` ignore les entrées à 0 ; `scores()` = joueurs de la manche actifs en base | sémantique précisée |
| `finish()` idempotent côté plateforme | un second appel est journalisé et ignoré |
| `pause()` permis avant `start()` | réhydratation d'une séance en pause |
| `restore.interruptedAt` = heure de réhydratation | le quiz ne s'en sert pas |
| `game:state.serverNow` en ISO | cohérent avec `endsAt` |

Propriétés tenues : le moteur n'importe ni `socket.io` ni `io`, ne touche ni `sessions` ni
`players`, n'a aucun état de module ; `session_rounds.state_json = { platform: { participants },
engine }` (convention 7) ; `advanceOrEnd(sessionId)` termine toujours (point d'extension de B5).

### (b) Vues et cues du quiz

Schémas : `packages/validation/src/games/quiz.ts` (détail § 8.2). Partie commune : `phase`
(`countdown | question | reveal | done`), `questionIndex` (-1 au compte à rebours),
`totalQuestions`, `question` (sans `isCorrect`, avec `timeLimitMs`), `endsAt` /
`pausedRemainingMs`, `answeredCount`, `totalPlayers`. En `reveal` : `correctAnswerId`,
`explanation`, `revealedAt`, `scoreboard` (écran : 5 premiers ; console : complet ; avec `rank` et
`scoreThisQuestion`). Mobile : partie commune + `me { answerId, locked, result }`, sans
classement. `nextAt` du prompt fusionné dans `endsAt`. Action `answer { questionId, answerId }`,
accusé `{ timeToAnswerMs }`.

Cues (écran seulement) : `question_opened`, `last_seconds`, `question_closed`,
`player_answered { playerId, pseudo, avatarUrl }`. Seul `player_answered` est utilisé (flash +
son) ; les autres sons se déduisent de la vue (§ 10.2).

### (c) Ancien événement → remplacement

Voir le tableau § 8.4 (complet). En bref : `question_started` → vue `question` ;
`timer_update` → `endsAt` + `serverNow` ; `answer_submitted_count` → `answeredCount` ;
`player_answered` → cue `player_answered` ; `question_ended` → vue `reveal` ;
`next_question_in` → `endsAt` de la vue `reveal` ; `player:submit_answer` → `game:action` avec
accusé ; `console:force_end_question` / `POST /force-end-question` → `console:force_advance` /
`POST /force-advance` ; champs quiz des snapshots → `round` + `gameView` + `gameSeq`.

### (d) Assertions de test modifiées

Les cinq du commit 2 (§ 8.6) : console:resume ne porte plus le quiz avec `isCorrect` (règle 5,
vérifié sur `GET /:id/full`) ; le compteur « 1 / 2 » est observé sur la console et non sur le
mobile d'un autre joueur (le mobile ne reçoit plus le compteur des autres) ; classement avec `rank`
et échéances au lieu de `next_question_in` ; `canAnswerCurrentQuestion: false` → `me.locked: true` ;
compteur regroupé observé sur la console (mêmes seuils). Commit 1 : aucune assertion modifiée.
Commits 3 et 4 : tests de stores réécrits (les stores ont changé de forme), aucune assertion
de comportement API modifiée ; commit 4 n'ajoute que deux tests (`joinedLate`).

### (e) Charge à 300 joueurs

Mesure du commit 2 (§ 8.6, `pnpm sim:session -- --players 300`, 3 questions de 10 s, MySQL
local) : par question ≈ 1 265 émissions serveur (900 vues mobiles, 31 écran, 31 console, 303
cues), 1 567 pour la dernière (300 vues `done` en plus) ; clôture (échéance + 500 ms → révélation
reçue par la console) 258 à 280 ms ; révélation reçue par les 300 mobiles en 5 à 6 ms. Linéaire
(≈ 3 N + 2 × durée / 250 ms + N cues). Les commits 3 et 4 ne touchent pas l'émission serveur.

### (f) À vérifier à la main

Rien de visuel ni de sonore n'a pu être regardé ou écouté ici (pas d'écran ni de son) ; seuls
`next build`, les tests et des rendus serveur jetables ont été faits. Parcours conseillé : une
séance réelle avec un quiz de 3 questions, l'écran cinéma (`apps/player`, `/screen`, son activé),
la console (`/screens/<screenId>`, avec un compte rattaché au cinéma) et 2 ou 3 téléphones (`apps/mobile`), dont un qui rejoint en
cours de partie.

1. **Écran, lobby → Q1** : après « Lancer », le lobby reste affiché pendant le compte à rebours
   (3 s) avec la musique du lobby ; puis la question apparaît, son `questionStart`, puis une note
   `answerReveal` par carte au rythme de leur apparition ; musique de jeu.
2. **Écran, barre de temps** : fluide (60 i/s), passe en urgence aux 5 dernières secondes avec le
   son `lastSeconds` (une seule fois) ; en pause (console), la barre se fige, la musique se met en
   pause, `lastSeconds` ne part pas ; à la reprise, elle repart du temps gelé.
3. **Écran, réponses** : chaque réponse d'un téléphone fait monter le pseudo + avatar (flash) avec
   le son `playerAnswered` ; le compteur « N / M réponses » avance (≤ 4 fois par seconde).
4. **Écran, révélation** : son `questionEnd`, bonne réponse en surbrillance 2,5 s, fondu, puis
   classement « split » (5 premiers, « +N » = points de la question) et « Question suivante
   dans N… » ; recharger la page (F5) en pleine révélation doit reprendre à la bonne étape.
5. **Écran, fin** : podium, son `final`, musique des scores ; pas d'écran « fin de manche »
   intermédiaire (une seule manche).
6. **Mobile** : compte à rebours « C'est parti ! » ; boutons A/B/C/D, le choix s'affiche tout de
   suite (« Réponse enregistrée ») ; résultat juste/faux + points + rang ; pause = écran de pause ;
   couper le réseau 3 s pendant une question puis revenir : on peut encore répondre si la question
   est ouverte. Un message rouge apparaît si une réponse est refusée.
7. **Mobile, retardataire** : rejoindre pendant Q2 → écran d'attente jusqu'à Q3 ; en fin de partie
   « Arrivé en cours de partie » ; **recharger la page sur l'écran final** : la mention reste
   (correctif du commit 4).
8. **Mobile, exclusion** : exclure un joueur depuis la console → « Tu as été retiré de la partie »,
   y compris après rechargement.
9. **Console** : « Question N / M », bonne réponse surlignée pendant la question, compteur,
   classement complet après chaque révélation, « Forcer la fin » grisé pendant le compte à rebours
   et actif pendant une question (il clôt la question) ; recharger la page en pleine question.
10. **Page `/dev/play` (mobile)** : onglets de toutes les phases (dont Départ, Fin manche, Exclu,
    Repli), en développement ou avec `NEXT_PUBLIC_DEV_PLAY_PASSWORD`.

### (g) Trous de l'abstraction

Ce qui, dans le quiz, a résisté à l'interface ou reste propre au quiz dans la plateforme :

1. **Manche créée depuis le quiz** : `ensureFirstRound` (plateforme) crée la manche 1 via
   `ensureGameForQuiz` sur `sessions.quiz_id` (convention 9). Une séance reste adossée à un quiz.
2. **Progression nommée « question »** : `reportProgress` alimente
   `sessions.current_question_position` et `players.joined_question_position` (rapports,
   `joinedLate`). Un moteur sans questions doit donner un sens à « étape ».
3. **Habillage et audio de séance pris sur le quiz** (`session:started.quiz/.audio`, snapshot
   écran) ; slots sonores (`AUDIO_SLOTS`) nommés pour le quiz (`questionStart`…). Un nouveau moteur
   ajoute ses slots au registre partagé.
4. **Lobby pendant le compte à rebours** : il a fallu une règle d'écran (`showsLobby`) pour que la
   plateforme garde son écran pendant une phase du moteur ; plus largement, « un composant de rendu
   par app » est devenu composant + règles sans JSX (`screen-rules.ts` : sons ; `console-rules.ts` :
   en-tête, « Forcer la fin », scores) et une ligne de plus par registre (`view-schemas.ts`).
5. **Contenu secret de la console** : la bonne réponse pendant la question ne peut pas passer par une
   vue ; la console la lit dans `GET /:id/full` (quiz de la séance), passé en prop `content`.
6. **Minuteurs et horloge** : `setTimer` ajouté à l'interface pour tester le moteur sans attendre.
7. **Retardataire repris** : `onPlayerJoined` a dû distinguer `rejoin`.
8. **Classement de fin de manche** : `round:ended` est calculé par la plateforme depuis
   `score_events` ; le quiz garde son propre classement de révélation (`scoreThisQuestion`) dans
   ses vues.

## 14. B5 — Séances à plusieurs manches (état pour les unités suivantes)

- **Données** : migration `0021_session_quiz_nullable` (`sessions.quiz_id` nullable, FK
  inchangée `ON DELETE RESTRICT`). `quiz_id` = quiz de la première manche de moteur quiz, null
  sinon. `sessionsService.create` : `gameSlugs` 1 à 5 jeux publiés, moteur enregistré
  (`hasEngine`, sinon 400 `GAME_NOT_SUPPORTED_YET`), doublons 400 `DUPLICATE_GAME` ; manches
  `pending`, positions 1..n. Un seul jeu = `quizSlug` (parcours historique, la console l'utilise).
- **Lecture du contenu** : `sessions/session-content.service.ts`. Lobby (fonds/sons de lobby,
  timer, avatars, lots) = jeu de la **première** manche (`resolveLobbyQuiz`) ; habillage pendant
  une manche = quiz de la manche active s'il en a un, sinon première manche
  (`resolveRoundThemeQuiz`) ; titres de listes = jeu de la manche 1 (`sessionTitle`). Lots :
  `prizesConfig` du quiz de la première manche, sponsor de la première manche ayant un sponsor.
  Séance sans manche (convention 9) : `sessions.quiz_id`.
- **Enchaînement** (`session-runtime.service.ts`) : `finish()` → `closeRound` (`ended`,
  `round:ended`) → `advanceOrEnd` : manche `pending` restante → entracte `ROUND_INTERLUDE_MS`
  (défaut 8000, gelé par la pause : temps restant repris au resume) → `launchNextRound` :
  `session:theme_changed { quiz, audio }` puis `round:started` puis `start()`. Sinon
  `endSessionInternal` (un seul `session:ended`). Jeu impossible à créer → manche `skipped`, la
  suivante est tentée. Au lancement d'une manche : `joinedDuringRound` remis à false,
  `current_question_position` remis à null.
- **Passer la manche** : `console:skip_round` (socket) et `POST /api/sessions/:id/skip-round`
  (la console utilise le REST comme pour les autres actions). Séance `running` exigée (409
  `SESSION_NOT_RUNNING`). En manche : `skipped` + `round:ended` + enchaînement normal ; pendant
  l'entracte : la manche suivante part tout de suite.
- **Abandon** : manche en cours et suivantes `skipped` (inchangé), entracte annulé.
- **Réhydratation** : manche `running` → reprise avec son `state_json` ; sinon manche `pending`
  → lancée tout de suite (séance en pause : entracte gelé, lancée au resume) ; sinon fin de séance.
- **Snapshots** : `roundEnded` (payload `round:ended` de la manche terminée) pendant l'entracte,
  null sinon (`snapshotRoundFieldsSchema.roundEnded`, optionnel). Les trois clients l'utilisent
  pour réafficher le classement de fin de manche après un rechargement.
- **Quiz** : la révélation de la dernière question a son échéance (`RESULTS_DISPLAY_MS`) comme
  les autres ; la fin de manche suit. Écran : « Résultats dans N… » pour la dernière question.
- **Écran** : à partir de la manche 2, le compte à rebours du quiz garde le classement de fin de
  manche au lieu du lobby (`selectScreenDisplay`) ; `round:started` conserve `roundScoreboard`
  (écran et mobile) jusqu'à la première vue.
- **Console** : `GET /:id/full` renvoie `rounds[] { roundId, position, state, game, content }`
  (contenu quiz, bonnes réponses comprises) et `quiz` = quiz de la première manche (nullable) ;
  `GameStage` reçoit le contenu de la manche active (`selectRoundContent`). En-tête
  « Manche N/M — titre », vue d'entracte, bouton « Passer à la manche suivante » (confirmation)
  affiché s'il reste une manche. Lanceur : sélection multiple ordonnée (5 max), durée totale
  estimée (`durationEstimateSeconds` du quiz, ajouté à `GET /api/quizzes`, sinon 30 s par
  question).
- **Rapport** : `rounds[]` (position, titre, moteur, état, dates, participants) ; questions de
  toutes les manches quiz avec `roundPosition` ; un retardataire de la manche R est éligible à
  toutes les questions des manches suivantes (manche d'arrivée déduite de `joinedAt`).

## 15. B6 — Moteur sondage (validation de l'interface)

Moteur `poll` : `api/src/modules/games/engines/poll/poll.engine.ts` (nom de fichier selon le guide,
`<clé>.engine.ts`, et non `poll-engine.ts` du prompt), schémas
`packages/validation/src/games/poll.ts`, rendus `apps/{player,mobile,console}/games/poll/`.

**Aucune modification de `engine.types.ts` ni de la plateforme** (runtime, handlers, reprise,
parties plateforme des stores). Le sondage n'utilise que `ctx.emitState`, `ctx.award`,
`ctx.persistState`, `ctx.reportProgress`, `ctx.finish`, `ctx.setTimer`, `ctx.now` et
`ctx.players` ; aucun cue, aucune table propre, aucun `session:question_*`, rien dans
`player_answers`. Participants (convention 7) tenus par la plateforme sans rien demander au moteur
(vérifié dans `session-poll.test.ts`).

Points d'attention relevés (pas des trous, mais à savoir) :

1. **`reportProgress(step)`** : le sondage y met son numéro de question (1..N). La colonne reste
   `sessions.current_question_position` ; `players.joined_question_position` d'un retardataire
   arrivé pendant un sondage porte donc un numéro de question du sondage (les rapports quiz ne
   l'utilisent pas pour cette manche, B5 déduit la manche d'arrivée de `joinedAt`).
2. **Pause** : `handleAction` ne refuse pas une action pendant la pause ; chaque moteur le fait
   (`SESSION_PAUSED`). Le sondage le fait comme le quiz.
3. **« Tous les joueurs ont voté »** : `ctx.players.ids()` contient les joueurs actifs, y compris
   déconnectés ; un téléphone éteint empêche la fin anticipée (l'échéance clôt le vote). Même
   sémantique que le compteur `totalPlayers` du quiz.
4. **Reprise** : seuls les votes persistés sont retrouvés. Le moteur persiste à chaque phase et,
   en plus, ses votes au regroupement du compteur (250 ms) : un arrêt perd au plus 250 ms de votes.
   La question interrompue reprend à sa phase `results` (règle du prompt).
5. **Vue mobile et compteur** : comme le quiz, `totalVotes` d'une vue mobile n'est pas réémis à
   chaque vote d'un autre joueur (jamais N²) ; `snapshot(mobile)` peut donc être plus récent que la
   dernière vue reçue par un joueur qui n'a pas voté (sans effet visible : le mobile n'affiche pas
   ce compteur pendant le vote).
6. **Habillage** : une séance qui commence par un sondage a l'habillage neutre (pas de quiz sur la
   première manche, `shapeThemePayload(null)`).
7. **Validation REST** : `validate()` (api) teste `instanceof ZodError` ; un schéma importé de
   `@quiz-app/validation` (build du paquet) lève un `ZodError` d'une autre copie du module et
   finissait en 500. `games.routes.ts` passe par `safeParse` ; `validate()` n'a pas été modifié
   (hors périmètre, point ouvert).
8. **Console** : le lanceur de séance ne liste que `/api/quizzes` ; un sondage ne se programme
   pour l'instant que par l'API (`gameSlugs`). Le catalogue (C1) le rendra choisissable.

API B6 (super_admin) : `GET /api/games?engineKey=&page=&limit=`, `GET /api/games/:slug`,
`POST /api/games` (`engineKey` `poll` seulement : `quiz` → 400 `GAME_MANAGED_BY_QUIZ`, autre →
400 `GAME_NOT_SUPPORTED_YET` ; `slug` optionnel, pris par un quiz ou un jeu → 409 `SLUG_TAKEN`,
`new-poll` réservé ; sans slug, tiré du titre avec suffixe), `PATCH /api/games/:slug` (titre,
description, `configJson` ; contenu refusé 409 `GAME_IN_USE` si une manche `pending`/`running`
l'utilise ; route unique étendue par C1), `POST /api/games/:slug/publish` (brouillon → publié,
403 `GAME_INVALID_TRANSITION` sinon). `durationEstimateSeconds` = Σ (durée + résultats).
Admin : `/polls` (liste, entrée « Sondages »), `/games/new-poll`, `/games/[slug]/edit-poll`
(même formulaire, publication) — cible du lien « Modifier le contenu » de C1.
