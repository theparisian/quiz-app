# Shh! — Moteur de jeu et protocole unifié (remplace B2, B3 et B4)

> À exécuter avec un modèle fort (Opus 5.5 ou Sonnet 5.5), en une session dédiée.
> Ordre global : A1 → A4, puis B1 (Composer), puis CE fichier, puis B5, B6, C1 → C5 (Composer).
> Ce fichier remplace entièrement les prompts B2, B3 et B4 du document « Prompts Cursor » : ne les exécute pas.

## Contexte

Monorepo pnpm + Turborepo : `api/` (Express, Socket.io, Prisma, MySQL), `apps/player` (écran cinéma),
`apps/mobile` (joueur), `apps/console` (cinéma), `apps/admin`, `packages/validation` (Zod partagé).

Le produit est un jeu d'avant-séance en salle de cinéma. Aujourd'hui tout est codé pour un seul type de
jeu, le quiz : `api/src/modules/sessions/session-orchestrator.service.ts` mêle le cycle de vie de la
session et la boucle de questions, `session-resume.service.ts` reconstruit des snapshots propres au quiz,
et les trois clients écoutent des événements `session:question_*`.

Le prompt B1, déjà mergé, a ajouté les tables `games`, `session_rounds`, `score_events` et la double
écriture des scores. Les prompts A1 à A4 sont mergés (en particulier A3 : réservation synchrone des
réponses, refus pendant la pause, compteur regroupé toutes les 250 ms).

Le projet n'est PAS en production : il n'y a aucune compatibilité ascendante à préserver, ni pour les
événements socket, ni pour les clients. On vise directement l'état final propre, sans période de
double protocole.

## Objectif

1. Séparer la **plateforme** (session, lobby, joueurs, pause, classement, lots, reprise) du **moteur de
   jeu** (ce qui se passe pendant une manche), reliés par une interface stable.
2. Définir **un seul protocole temps réel** pour tous les moteurs, présents et futurs.
3. **Migrer le quiz sur ce protocole** : serveur et trois clients. Les événements propres au quiz
   disparaissent.

À la fin, ajouter un moteur doit se résumer à : un fichier moteur côté API, un schéma de vues dans
`packages/validation`, un composant de rendu dans chaque app, une ligne dans chaque registre. Aucune
modification de la plateforme, des handlers socket, des stores ni de la reprise.

## À lire avant d'écrire une ligne

- `PROJECT_REFERENCE.md` sections 2 (principes non négociables), 6, 7 et 10.
- `api/src/modules/sessions/` en entier, surtout `session-orchestrator.service.ts`,
  `session-resume.service.ts`, `lobby-timer.service.ts`, `session-state.service.ts`.
- `api/src/modules/games/` (issu de B1), `api/src/modules/players/players.service.ts`,
  `api/src/modules/quizzes/quiz-audio.ts` et `quiz-background.ts`.
- `api/src/shared/sockets/` en entier.
- `packages/validation/src/socket-events.ts`, `audio.ts`.
- `apps/player` : `app/screen/page.tsx`, `lib/stores/nuc-store.ts`, `hooks/use-nuc-events.ts`,
  `hooks/use-audio-director.ts`, `lib/audio/engine.ts`, `components/states/*`, `components/shared/*`.
- `apps/mobile` : `app/play/[sessionId]/page.tsx`, `lib/stores/player-store.ts` et son test,
  `hooks/use-player-session.ts`, `components/*`.
- `apps/console` : `lib/stores/live-session-store.ts`, `hooks/use-live-session.ts`,
  `components/live-console/*`.
- Tous les tests de `api/tests` dont le nom contient `session`, `late-join`, `players`, `prizes`.

Commence par rédiger, pour toi, l'inventaire de chaque événement socket actuel : qui l'émet, qui
l'écoute, ce qu'il déclenche (y compris les sons dans `use-audio-director.ts`). Rien de ce que le public
voit ou entend aujourd'hui ne doit disparaître.

## État final attendu

### 1. Interface moteur (`api/src/modules/games/engine.types.ts`)

Proposition de départ ; tu peux l'ajuster si le code réel l'exige, à condition de justifier chaque écart
dans ton compte rendu et de garder les propriétés listées plus bas.

```ts
export type Audience = 'screen' | 'mobile' | 'console';

export interface RoundContext {
  sessionId: bigint;
  roundId: bigint;
  players: {
    ids(): string[];
    has(id: string): boolean;
    meta(
      id: string,
    ): { pseudo: string; avatarUrl: string | null; joinedDuringRound: boolean } | undefined;
  };
  /** Vue complète pour une audience. Avec playerId : vers ce seul joueur (audience 'mobile'). */
  emitState(audience: Audience, view: unknown, playerId?: bigint): void;
  /** Signal éphémère sans état (son, animation). Jamais nécessaire à la reprise. */
  emitCue(audience: Audience, cue: string, data?: unknown): void;
  /** Écrit ScoreEvent + incrémente Player.scoreTotal, dans une transaction. */
  award(
    entries: { playerId: bigint; points: number; reason: string; meta?: unknown }[],
  ): Promise<void>;
  scores(): Promise<Map<string, number>>;
  persistState(json: unknown): Promise<void>; // session_rounds.state_json
  finish(): Promise<void>; // fin de manche, appelé une seule fois
  now(): number; // horloge injectable pour les tests
  log: Logger;
}

export interface GameRound {
  start(): Promise<void>;
  onAction(playerId: bigint, action: { type: string; payload: unknown }): Promise<unknown>;
  onPlayerJoined(playerId: bigint): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  forceAdvance(): Promise<void>;
  snapshot(audience: Audience, playerId?: bigint): unknown; // synchrone : la vue courante
  dispose(): void; // annule tous les timers
}

export interface GameEngine {
  key: string;
  createRound(
    ctx: RoundContext,
    game: { id: bigint; configJson: unknown; quizId: bigint | null },
    restore?: { stateJson: unknown; interruptedAt: Date },
  ): Promise<GameRound>;
}
```

Propriétés à garantir :

- Un moteur n'importe ni `socket.io` ni l'instance `io`, et ne lit ni n'écrit `sessions` ou `players`
  directement. Il peut lire son propre contenu (questions du quiz) et écrire ses propres tables de
  détail (`player_answers`).
- Un moteur n'a aucun état global de module : tout vit dans l'instance de manche.
- `engine-registry.ts` : `registerEngine`, `getEngine(key)`.

### 2. Protocole unique (`packages/validation/src/socket-events.ts`)

Événements de **plateforme**, conservés (payloads à nettoyer de tout champ propre au quiz) :
`session:started`, `session:state_changed`, `session:paused`, `session:resumed`, `session:audio_muted`,
`session:lobby_timer_update`, `session:ended`, `session:aborted`, `session:state_snapshot`,
`player:joined`, `player:left`, `screen:session_started`, `nuc:status_changed`, et côté client
`player:join`, `player:resume`, `player:rejoin_room`, `player:leave`, tous les `console:*`, `nuc:*`.

Événements de **manche**, nouveaux :

| Événement       | Sens                          | Payload                                                                                                                             |
| --------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `round:started` | serveur → tous                | `{ roundId, position, totalRounds, engineKey, game: { slug, title, kind, sponsor: { name, logoUrl, brandColorPrimary } \| null } }` |
| `game:state`    | serveur → audience            | `{ roundId, engineKey, seq, serverNow, view }`                                                                                      |
| `game:cue`      | serveur → audience            | `{ roundId, cue, data? }`                                                                                                           |
| `round:ended`   | serveur → tous                | `{ roundId, position, totalRounds, scoreboard: [{ playerId, pseudo, avatarUrl, scoreTotal, scoreThisRound }] }`                     |
| `game:action`   | mobile → serveur, avec accusé | `{ roundId, type, payload }` → `{ ok: true, result }` ou `{ ok: false, code, message }`                                             |

Événements **supprimés** (serveur, schémas, clients, tests) : `session:question_started`,
`session:timer_update`, `session:answer_submitted_count`, `session:player_answered`,
`session:question_ended`, `session:next_question_in`, `player:submit_answer`.

Règles du protocole, à écrire aussi dans `PROJECT_REFERENCE.md` section 7 :

1. **Une vue est complète.** Le client remplace sa vue, il ne fusionne jamais. Un client qui n'a reçu
   que le dernier `game:state` affiche exactement la même chose qu'un client qui les a tous reçus.
2. **`seq` croît strictement par manche et par destinataire.** Le client ignore un `seq` inférieur ou
   égal au dernier appliqué.
3. **Le temps passe par des échéances, pas par des tics.** Une vue porte `endsAt` (ISO) ; l'enveloppe
   porte `serverNow`. Le client calcule son décalage d'horloge et anime localement. En pause, la vue
   porte `pausedRemainingMs` à la place de `endsAt`. Plus aucun événement émis chaque seconde.
4. **Un cue ne porte jamais d'état.** Le perdre ne change rien à ce qui est affiché une seconde plus tard.
5. **La reprise est le protocole.** `session:state_snapshot` = champs de plateforme + `round` (même
   forme que `round:started`, ou null) + `gameView` (résultat de `round.snapshot(audience, playerId)`,
   ou null) + `gameSeq`. Aucun champ propre à un moteur au premier niveau.
6. **Le serveur reste la seule source de vérité** : score, temps, validité d'une action.
7. Chaque moteur déclare ses vues et ses actions en Zod dans `packages/validation/src/games/<clé>.ts`.
   Les clients valident `view` avec ce schéma ; une vue invalide déclenche le rendu de repli et un
   message Sentry, jamais une erreur visible.

### 3. Vues du moteur quiz (`packages/validation/src/games/quiz.ts`)

Point de départ, à affiner d'après ce que les écrans affichent réellement :

- Partie commune : `phase: 'countdown' | 'question' | 'reveal' | 'done'`, `questionIndex`,
  `totalQuestions`, `question: { id, position, text, imageUrl, answers: [{ id, position, text }] }`,
  `endsAt` ou `pausedRemainingMs`, `answeredCount`, `totalPlayers`.
- En `reveal` : `correctAnswerId`, `explanation`, `scoreboard` (les N premiers, N selon l'audience),
  `nextAt` (échéance de la question suivante, absente après la dernière).
- Vue mobile, par joueur : la partie commune, plus `me: { answerId | null, locked (arrivé pendant cette
question), result: { isCorrect, points, rank, scoreTotal } | null }`.
- Vue console : la vue écran, avec le classement complet.
- La bonne réponse n'apparaît dans AUCUNE vue avant la phase `reveal`. Écris un test qui le vérifie en
  sérialisant chaque vue émise pendant `question`.
- Action : `{ type: 'answer', payload: { questionId, answerId } }`. Mêmes contrôles et mêmes codes
  d'erreur qu'après A3, réservation synchrone avant tout `await`.
- Cues vers l'écran : au minimum ceux que `use-audio-director.ts` utilise aujourd'hui (ouverture de
  question, apparition des réponses, dernières secondes, clôture, réponse d'un joueur avec pseudo et
  avatar, jamais la réponse choisie). Les sons déclenchables depuis un changement de `phase` doivent
  l'être côté client, sans cue.

Fréquence d'émission : la vue écran et console est réémise à chaque changement de phase, et pour
`answeredCount` au plus toutes les 250 ms. La vue mobile est émise à chaque joueur aux changements de
phase et, pour lui seul, après sa propre réponse. Vérifie qu'une salle de 300 joueurs ne produit pas
d'émission en N² ; donne le nombre de messages par question dans ton compte rendu.

### 4. Plateforme (`api/src/modules/sessions/`)

- `session-orchestrator.service.ts` devient la plateforme (renomme-le `session-runtime.service.ts` et
  mets à jour les imports). Il garde : registre des sessions en mémoire, `start`, pause, reprise,
  abandon, mute, fin de session (classement final, lots, `session:ended`), réhydratation au démarrage,
  construction du `RoundContext`, émission de `round:started` / `round:ended`.
- Dans ce chantier une session n'a qu'une manche (l'enchaînement arrive avec B5), mais écris la
  plateforme autour d'une « manche active » pour que B5 n'ait qu'à ajouter la boucle. Prévois le point
  d'extension : après `finish()`, une fonction `advanceOrEnd(sessionId)` qui aujourd'hui termine toujours.
- Réhydratation : pour une manche `running`, `createRound(..., restore)` avec `state_json`. Le moteur
  quiz reprend la règle actuelle (la question interrompue est close et notée avec les réponses déjà
  enregistrées, puis la suite s'enchaîne).
- `session-resume.service.ts` ne contient plus aucune logique de quiz : quatre fonctions courtes qui
  assemblent les champs de plateforme et appellent `round.snapshot`.
- Handlers socket : `game:action` sur `/mobile` (schéma, joueur authentifié par son socket, manche
  active, 20 actions par seconde et par socket au plus). Chaque socket mobile rejoint la room
  `player:<id>` à `player:join`, `player:resume`, `player:rejoin_room`. `console:force_end_question`
  devient `console:force_advance`.
- `joinedQuestionPosition` reste en base pour les rapports, mais la règle « arrivé pendant cette
  question, il attend la suivante » est appliquée par le moteur quiz via `onPlayerJoined`.

### 5. Clients (les trois apps, même structure)

- Store : la partie quiz disparaît au profit de `round`, `gameView`, `gameSeq`, `clockOffsetMs`,
  `roundScoreboard`. Les états de plateforme restent (connexion, lobby, pause, fin, abandon, audio).
- `games/registry.ts` : `engineKey` → composant chargé par `next/dynamic`.
  `games/types.ts` : `GameRendererProps { round; view; clockOffsetMs; sendAction? }`.
  `games/quiz/` : les composants actuels, réécrits pour ne dépendre que de `view` (plus aucun accès au
  store pour l'état de jeu). Le rendu visuel doit être identique à l'actuel.
  `games/unknown-game.tsx` : repli sobre, jamais d'erreur à l'écran.
- `<GameStage />` choisit le rendu. Idle, lobby, pause, classement de fin de manche, résultats finaux,
  abandon, bannière de connexion et QR des retardataires restent hors de `GameStage`.
- Un hook partagé `useCountdown(endsAt, pausedRemainingMs, clockOffsetMs)` remplace l'écoute de
  `session:timer_update` ; animation à 60 images par seconde sur l'écran cinéma comme aujourd'hui.
- Mobile : `sendAction(type, payload)` avec accusé et délai de 5 s. Mise à jour optimiste du bouton
  choisi, corrigée par la vue suivante.
- Écran de fin de manche (player et mobile) : classement issu de `round:ended`. Avec une seule manche,
  il laisse immédiatement place à l'écran final existant.

## Méthode imposée

Travaille en quatre commits successifs, chacun vert (`pnpm typecheck && pnpm lint && pnpm --filter
@quiz-app/api test && pnpm --filter @quiz-app/mobile test`) :

1. **Interface, registre, plateforme, moteur quiz déplacé** — encore avec les anciens événements, émis
   par le moteur à travers un adaptateur temporaire. Les tests existants passent sans changement
   d'assertion. Ce commit prouve que le découpage est juste avant de toucher au protocole.
2. **Protocole serveur** — vues, cues, `game:action`, snapshots, suppression des anciens événements et
   de l'adaptateur. Réécris les tests socket sur le nouveau protocole.
3. **Clients** — les trois apps, l'une après l'autre : mobile, player, console.
4. **Nettoyage et documentation** — code mort, schémas inutilisés, `PROJECT_REFERENCE.md` (sections 3.4,
   7 et 10), `APP_OVERVIEW.md` (section 8), une page `docs/ajouter-un-moteur.md` qui décrit les étapes
   pour créer un moteur, en prenant le quiz comme exemple.

## Tests

Les assertions de **comportement** des tests existants sont un filet de sécurité : scores, rangs,
contenu de la base, transitions d'état, lots, retardataires, reprise après redémarrage. Tu peux réécrire
la façon dont un test observe le système (les noms d'événements changent), jamais ce qu'il vérifie. Si
une assertion de comportement doit changer, explique pourquoi dans le compte rendu.

À ajouter :

- Moteur quiz seul, avec un faux `RoundContext` et une horloge simulée : séquence complète de vues,
  score identique à l'actuel pour un jeu de réponses donné, `finish()` appelé une fois.
- Propriété « vue complète » : un client simulé qui ne reçoit qu'un `game:state` sur trois arrive au même
  état final qu'un client qui les reçoit tous.
- `seq` : une vue ancienne reçue en retard est ignorée (test de store mobile).
- Reprise : snapshot mobile en phase `question`, en `reveal`, en pause ; redémarrage serveur en pleine
  question.
- Confidentialité : aucune vue de phase `question` ne contient la bonne réponse ni la réponse d'un autre
  joueur.
- Double envoi d'une action, action pendant la pause, action sur une mauvaise manche.
- Charge : adapte `api/scripts/sim-session.ts` au nouveau protocole et lance-le avec 300 joueurs ;
  rapporte la durée de clôture d'une question et le nombre de messages émis.

## Hors périmètre

Sessions à plusieurs manches (B5), nouveau moteur (B6), catalogue et sponsors (C), affichage du sponsor,
refonte visuelle, factorisation des `lib/socket.ts` dupliqués, suppression de la route REST
`POST /api/players/join`. Si tu touches à l'un de ces sujets, c'est une erreur.

## Compte rendu attendu

1. Interface finale du moteur et écarts par rapport à la proposition, avec leur raison.
2. Schéma final des vues quiz et liste des cues.
3. Tableau « ancien événement → ce qui le remplace ».
4. Assertions de test modifiées et pourquoi.
5. Résultat du test de charge à 300 joueurs.
6. Ce que tu n'as pas pu vérifier (rendu visuel, audio sur l'écran) : dis-le explicitement, je le
   testerai à la main.
7. Trous éventuels de l'abstraction : tout ce qui, dans le quiz, a résisté à l'interface.

## Points d'arrêt

Arrête-toi après chaque commit de la « Méthode imposée », donne-moi ton compte rendu d'étape
et attends mon accord avant de passer au commit suivant.
