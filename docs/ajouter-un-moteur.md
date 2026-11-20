# Ajouter un moteur de jeu

Une séance Shh! est une suite de **manches**. Chaque manche est jouée par un **moteur** (`games.engine_key`) :
le quiz aujourd'hui, le sondage ensuite. La **plateforme** (séance, lobby, joueurs, pause, classement final,
lots, reprise) ne connaît aucun moteur ; elle leur parle par une interface stable et un protocole temps réel
commun (`round:*`, `game:*`, voir `PROJECT_REFERENCE.md` section 7).

Ajouter un moteur se résume donc à :

1. un fichier moteur côté API ;
2. un fichier de schémas Zod dans `packages/validation` ;
3. un rendu dans chaque app (écran, mobile, console) ;
4. une ligne dans chaque registre ;
5. les tests.

Aucune modification de la plateforme, des handlers socket, des stores ni de la reprise. Si tu as besoin d'en
toucher une, c'est que l'interface a un trou : note-le plutôt que de le contourner dans le moteur.

Exemple suivi tout au long de cette page : le quiz (`quiz`). Le sondage (`poll`, B6) est un second
exemple, plus court, qui n'utilise que le protocole générique (aucun cue, aucune table propre). Le
mini-jeu burger (`burger`) en est un troisième : une course de vitesse à actions répétées
(`reorder`, l'ordre complet à chaque dépôt), un cue (`player_finished`) et un secret gardé côté
serveur (la recette, qui ne figure jamais dans `@quiz-app/validation` puisque ce paquet part dans le
code des clients). La tour de livres (`tower`) en est un quatrième : un jeu d'équilibre dont la
règle physique (`towerSettle`, centre de gravité au-dessus du support, marge qui grandit avec la
charge) vit dans `@quiz-app/validation` pour que le téléphone prédise et anime chaque lâcher sans
attendre, le serveur tranchant avec exactement la même fonction (action `drop` : `{ index, x }`,
l'index refusant les lâchers rejoués). Les chemins sont donnés avec `<clé>` pour un
nouveau moteur (ex. `poll`).

---

## 0. Avant de commencer

- Choisir la **clé** du moteur (`engine_key`, minuscules, sans espace) : `quiz`, `poll`… Elle est exportée
  comme constante par le fichier de validation (`QUIZ_ENGINE_KEY = 'quiz'`) et utilisée partout ailleurs.
- Écrire, pour toi, les **phases** de la manche et ce que chaque audience voit dans chaque phase :
  écran cinéma (`screen`), téléphone de chaque joueur (`mobile`), console du cinéma (`console`).
  Quiz : `countdown` → (`question` → `reveal`) × N → `done`.
- Lister les **actions** d'un joueur (quiz : `answer`) et les **cues** (signaux éphémères : un son, un flash ;
  quiz : `player_answered`).
- Repérer ce qui est **secret** pour chaque audience (quiz : la bonne réponse avant `reveal`, la réponse d'un
  autre joueur). Une vue ne doit jamais le contenir.

## 1. Les schémas : `packages/validation/src/games/<clé>.ts`

Exemple : `packages/validation/src/games/quiz.ts`. Le fichier déclare :

- la clé : `export const QUIZ_ENGINE_KEY = 'quiz';`
- les **vues**, une par audience, en `z.discriminatedUnion('phase', [...])`. Chaque vue est **complète** :
  le client la remplace, il ne fusionne jamais. Elle porte tout ce qu'il faut pour afficher l'écran, y compris
  le temps sous forme d'échéance :
  - `endsAt` (ISO) tant que le temps court,
  - `pausedRemainingMs` à la place pendant une pause,
  - les deux à `null` quand la phase n'a pas d'échéance.
    Quiz : `quizScreenViewSchema`, `quizConsoleViewSchema` (même forme, classement complet),
    `quizMobileViewSchema` (partie commune + `me: { answerId, locked, result }`).
- les **actions** : `quizAnswerActionSchema` (`{ questionId, answerId }`) et le résultat renvoyé dans
  l'accusé (`quizAnswerResultSchema`).
- les **cues** et leur `data` : `QUIZ_CUES` et `quizPlayerAnsweredCueSchema`. Un cue ne porte jamais d'état :
  le perdre ne change rien à ce qui est affiché une seconde plus tard.

Second exemple, plus simple : `packages/validation/src/games/poll.ts` (sondage, B6), qui déclare aussi
le schéma du contenu du jeu (`pollConfigSchema`, stocké dans `games.config_json`).

Puis l'exporter depuis `packages/validation/src/index.ts` :

```ts
export * from './games/quiz';
export * from './games/<clé>';
```

## 2. Le moteur côté API : `api/src/modules/games/engines/<clé>/<clé>.engine.ts`

Exemple : `api/src/modules/games/engines/quiz/quiz.engine.ts`. Interface : `api/src/modules/games/engine.types.ts`.

```ts
export const pollEngine: GameEngine = {
  key: POLL_ENGINE_KEY,
  async createRound(ctx, game, restore) {
    // Lire son contenu (game.configJson, ou game.quizId pour le quiz), puis :
    return new PollRound(ctx, content, restore);
  },
};
```

La classe de manche implémente `GameRound` :

| Méthode                                | Ce qu'elle fait (quiz)                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start()`                              | lance la manche ou la reprend après `restore` (quiz : compte à rebours puis Q1 ; reprise : clôt et note la question interrompue)                                          |
| `onAction(playerId, action)`           | valide l'action **et la réserve avant tout `await`**, puis persiste ; lève une `AppError` avec un code métier si elle est refusée (`ALREADY_ANSWERED`, `SESSION_PAUSED`…) |
| `onPlayerJoined(playerId, { rejoin })` | arrivée d'un joueur en cours de manche (quiz : un nouveau venu est bloqué sur la question en cours, pas un `rejoin`)                                                      |
| `pause()` / `resume()`                 | gèle et relance les échéances ; peut être appelé avant `start()` (séance en pause au redémarrage)                                                                         |
| `forceAdvance()`                       | bouton « Forcer la fin » de la console (quiz : clôt la question ouverte, sans effet ailleurs)                                                                             |
| `snapshot(audience, playerId?)`        | **synchrone** : la vue courante, exactement celle que le moteur émettrait maintenant                                                                                      |
| `dispose()`                            | annule tous les minuteurs ; la manche ne fait plus rien                                                                                                                   |

Ce que fournit le `RoundContext` (`ctx`), et seulement lui :

- `ctx.players.ids() / has(id) / meta(id)` : joueurs actifs de la manche (pseudo, avatar, arrivé en cours) ;
- `ctx.emitState(audience, view, playerId?)` : envoie une vue (`game:state`) ; la plateforme ajoute `seq`
  et `serverNow`. Avec `playerId`, vers ce seul joueur (room `player:<id>`). Le quiz émet à chaque
  changement de phase une vue écran, une vue console et une vue par joueur, puis, après une réponse, la vue
  du seul joueur et le compteur écran + console regroupé (au plus toutes les 250 ms) : jamais N² ;
- `ctx.emitCue(audience, cue, data?)` : signal éphémère (`game:cue`) ;
- `ctx.award([{ playerId, points, reason, meta? }])` : points (ScoreEvent + `Player.scoreTotal`, une
  transaction) ; `ctx.scores()` : scores totaux ;
- `ctx.persistState(json)` : état du moteur pour la reprise après redémarrage
  (`session_rounds.state_json.engine`, relu dans `restore.stateJson`) ;
- `ctx.reportProgress(step | null)` : étape courante (quiz : numéro de question), sert aux listes de séances
  et aux rapports des retardataires ;
- `ctx.finish()` : fin de manche, **une seule fois** ; la plateforme émet `round:ended` puis enchaîne ;
- `ctx.now()` et `ctx.setTimer(ms, fn)` : horloge et minuteurs. **Tous** les délais du moteur passent par
  là (les tests les simulent, la plateforme les annule en filet) ;
- `ctx.log` : logger déjà contextualisé (séance, manche, moteur).

Règles non négociables :

- le moteur n'importe ni `socket.io` ni l'instance `io` ;
- il ne lit ni n'écrit `sessions` ou `players` (tout passe par `ctx`) ; il peut lire son contenu et écrire
  ses propres tables de détail (quiz : `player_answers`) ;
- aucun état global de module : tout vit dans l'instance de manche ;
- après chaque `emitState`, `snapshot()` doit renvoyer la même vue (c'est ce qui rend la reprise gratuite) ;
- aucun secret dans une vue (relis la liste de l'étape 0).

Enregistrement : une ligne dans `api/src/modules/games/engine-registry.ts`.

```ts
registerEngine(quizEngine);
registerEngine(pollEngine);
```

La manche est jouée dès qu'une ligne `session_rounds` pointe vers un `games` dont `engine_key` vaut la clé.
La création de ces jeux (formulaire d'admin, route `/api/games`) n'appartient pas au moteur : pour le quiz,
le jeu est synchronisé depuis le quiz (`games.service.ts`) ; le sondage est créé par `POST /api/games`
(`engineKey`, `title`, `configJson` validé par le schéma du moteur dans `games.service.ts`) et modifié par
l'unique `PATCH /api/games/:slug`. Un nouveau moteur à contenu `configJson` ajoute son cas dans
`assertEditableEngine` / la validation du contenu de `games.service.ts`, et son formulaire dans
`apps/admin` (modèle : `app/components/poll-form.tsx`, pages `/games/new-poll` et
`/games/[slug]/edit-poll`). Un jeu doit être `published` pour être programmé dans une séance.

## 3. Les rendus côté clients : `apps/<app>/games/<clé>/`

Les trois apps ont la même structure (`apps/<app>/games/`) :

| Fichier           | Rôle                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| `types.ts`        | `GameRendererProps { round; view; clockOffsetMs; sendAction? }` (console : `+ content`) |
| `registry.ts`     | `engineKey` → composant chargé par `next/dynamic`                                       |
| `view-schemas.ts` | `engineKey` → schéma de vue de l'audience (lu par le store, testable hors navigateur)   |
| `game-stage.tsx`  | choisit le rendu de la manche, ou `unknown-game.tsx` (repli sobre)                      |
| `<clé>/index.tsx` | le rendu du moteur (export par défaut)                                                  |

Le composant ne lit **que** ses props : aucune lecture du store pour l'état de jeu. Le store a déjà validé la
vue avec le schéma du moteur ; une vue invalide ou un moteur inconnu affiche le repli et part dans Sentry.
Lobby, pause, fin de manche, résultats finaux, abandon, bannière de connexion et QR des retardataires restent
hors de `GameStage` : le moteur n'a pas à les dessiner.

Temps : `useCountdown(view.endsAt, view.pausedRemainingMs, clockOffsetMs)` de `@quiz-app/ui` renvoie les
ms restantes (figées en pause, `null` sans échéance). Sur l'écran cinéma, `{ mode: 'frame' }` anime à
60 images par seconde (barre de temps du quiz).

### Écran cinéma (`apps/player`)

- `games/<clé>/index.tsx` : rendu plein écran (quiz : `games/quiz/index.tsx`, `answer-card.tsx`,
  `timer-bar.tsx`, `answered-flashes.tsx`). Les cues s'écoutent avec `subscribeGameCues`
  (`lib/game-cues.ts`) ; quiz : les flashs des pseudos sur le cue `player_answered`.
- `games/<clé>/screen-rules.ts` : règles sans JSX (type `ScreenGameRules` de `games/types.ts`), lues par le
  store, la page et le directeur audio :
  - `showsLobby(view)` : la vue laisse le lobby à l'écran (quiz : `phase === 'countdown'`) ;
  - `stageKey(view)` et `sfxOnEnter(view)` : sons joués à l'entrée d'une étape (quiz : `questionStart` et
    `answerReveal` à l'ouverture, `questionEnd` à la révélation) ;
  - `timedSfx(view, clockOffsetMs, localNow)` : son calé sur une échéance (quiz : `lastSeconds`) ;
  - `sfxForCue(cue, data)` : son d'un cue (quiz : `playerAnswered`).
    Un son qui se déduit d'un changement de vue se joue depuis la vue, jamais depuis un cue (sinon il serait
    rejoué ou perdu). Les sons sont des slots de `AUDIO_SLOTS` (`packages/validation/src/audio.ts`).

### Mobile (`apps/mobile`)

- `games/<clé>/index.tsx` : rendu du joueur (quiz : `question-screen.tsx`, `waiting-others.tsx`,
  `result-screen.tsx`, `late-wait-screen.tsx`).
- Les actions passent par `sendAction(type, payload)` (prop), qui émet `game:action` avec accusé et un délai de
  5 s, et ne rejette jamais : `{ ok: true, result }` ou `{ ok: false, code }` (y compris `TIMEOUT`,
  `NOT_CONNECTED`). Mise à jour optimiste possible, la vue suivante fait foi (quiz : le bouton choisi
  s'affiche tout de suite, un refus ramène à la question avec un message en tutoiement).
- `lib/dev-play-fixtures.ts` : ajouter des vues de démonstration pour la page `/dev/play`.

### Console (`apps/console`)

- `games/<clé>/index.tsx` : aperçu de la manche pour le projectionniste (quiz : `question-preview.tsx`,
  `timer-bar.tsx`). La prop `content` contient le contenu authentifié de la séance (`GET /api/sessions/:id/full`) :
  c'est là, et non dans une vue, que la console trouve ce que le public ne doit pas encore voir (quiz : les
  bonnes réponses surlignées pendant la question).
- `games/<clé>/console-rules.ts` (type `ConsoleGameRules`) : `progressLabel(view)` (en-tête, quiz :
  « Question 2 / 10 »), `canForceAdvance(view)` (bouton « Forcer la fin »), `scoreboard(view)` (scores de la
  liste des joueurs, ou `null`). Textes en vouvoiement.

## 4. Une ligne dans chaque registre

| Fichier                                    | Ligne à ajouter                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/validation/src/index.ts`         | `export * from './games/<clé>';`                                                 |
| `api/src/modules/games/engine-registry.ts` | `registerEngine(<clé>Engine);`                                                   |
| `apps/player/games/registry.ts`            | `[<CLÉ>_ENGINE_KEY]: dynamic(() => import('./<clé>'), { loading: () => null }),` |
| `apps/player/games/view-schemas.ts`        | `[<CLÉ>_ENGINE_KEY]: <clé>ScreenViewSchema,`                                     |
| `apps/player/games/screen-rules.ts`        | `[<CLÉ>_ENGINE_KEY]: <clé>ScreenRules,`                                          |
| `apps/mobile/games/registry.ts`            | `[<CLÉ>_ENGINE_KEY]: dynamic(() => import('./<clé>'), { loading: () => null }),` |
| `apps/mobile/games/view-schemas.ts`        | `[<CLÉ>_ENGINE_KEY]: <clé>MobileViewSchema,`                                     |
| `apps/console/games/registry.ts`           | `[<CLÉ>_ENGINE_KEY]: dynamic(() => import('./<clé>'), { loading: () => null }),` |
| `apps/console/games/view-schemas.ts`       | `[<CLÉ>_ENGINE_KEY]: <clé>ConsoleViewSchema,`                                    |
| `apps/console/games/console-rules.ts`      | `[<CLÉ>_ENGINE_KEY]: <clé>ConsoleRules,`                                         |

## 5. Les tests à écrire

API (`api/tests/`, Vitest + MySQL local) :

- **Moteur seul**, avec un faux `RoundContext` (horloge et minuteurs simulés, `emitState` / `emitCue`
  enregistrés) : modèle dans `api/tests/quiz-engine.test.ts` (`createFakeContext`). À couvrir :
  - la séquence complète des vues, chacune validée par son schéma Zod ;
  - les points attribués pour un jeu d'actions donné, et `finish()` appelé une seule fois ;
  - pause / reprise : `pausedRemainingMs`, puis échéance décalée ;
  - **confidentialité** : chaque vue émise avant la révélation, sérialisée, ne contient aucun secret ;
  - **vue complète** : un client qui ne reçoit qu'un `game:state` sur trois finit dans le même état qu'un
    client qui les reçoit tous, et `seq` croît strictement par destinataire ;
  - `snapshot(audience, playerId)` === dernière vue émise vers ce destinataire ;
  - nombre d'émissions linéaire en nombre de joueurs ;
  - reprise : `createRound(..., restore)` depuis l'état persisté.
- **Socket** (`api/tests/game-action.socket.test.ts`, helpers `api/tests/helpers/game-protocol.ts`) :
  action en double, action pendant la pause, action sur une mauvaise manche, payload invalide, vue d'un joueur
  non reçue par un autre.
- **Reprise** (`api/tests/session-resume.test.ts`) : snapshot mobile dans chaque phase et en pause ;
  redémarrage serveur au milieu d'une manche.

Clients (Vitest, environnement `node`, sans JSX : on teste les fonctions pures et les stores) :

- `apps/player/games/<clé>/screen-rules.test.ts` : sons dérivés des vues et des cues (modèle :
  `games/quiz/screen-rules.test.ts`) ;
- `apps/console/games/<clé>/console-rules.test.ts` : libellé, « Forcer la fin », classement ;
- les stores n'ont pas à changer : leurs tests (`player-store.test.ts`, `nuc-store.test.ts`,
  `live-session-store.test.ts`) couvrent déjà `seq`, manche, vue invalide et moteur inconnu.

Vérification avant commit (comme la CI) :

```bash
pnpm typecheck && pnpm lint && pnpm --filter @quiz-app/api test \
  && pnpm --filter @quiz-app/mobile test && pnpm --filter @quiz-app/player test \
  && pnpm --filter @quiz-app/console test && pnpm build
```

Le rendu visuel et le son ne sont vérifiables qu'à la main : `/dev/play` sur le mobile, et une séance réelle
sur l'écran (`/screen`) et la console.

## 6. Pièges connus

Relevés en écrivant le sondage (B6) :

- **Rebâtir `@quiz-app/validation`** : l'API et les apps lisent le paquet compilé (`dist/`). Après
  avoir ajouté ou modifié un schéma : `pnpm --filter @quiz-app/validation build` (sinon l'export est
  « introuvable » ou l'ancien schéma s'applique).
- **`validate()` et les schémas du paquet** : `validate()` (`api/src/shared/validation`) reconnaît
  les erreurs par `instanceof ZodError`, ce qui échoue pour un schéma importé de
  `@quiz-app/validation` (autre copie du module zod) : l'erreur finit en 500. Utiliser `safeParse`
  et lever une `AppError` 400 (voir `parse()` dans `games.routes.ts`). Le moteur valide lui aussi
  ses payloads par `safeParse`.
- **Pause** : la plateforme ne refuse pas `game:action` pendant une pause ; le moteur le fait
  (`SESSION_PAUSED`).
- **Persistance** : `persistState` à chaque phase ne suffit pas à retrouver les actions faites
  pendant une phase ; le sondage persiste aussi ses votes au regroupement du compteur (250 ms).
- **Sons** : un moteur peut réutiliser les slots existants (`questionStart`, `questionEnd`,
  `lastSeconds`) ; `sfxForCue` renvoie `null` s'il n'émet aucun cue. `showsLobby` renvoie `false`
  si le moteur n'a pas de compte à rebours.
- **`/dev/play`** : les fixtures de vue d'un autre moteur passent un `round` dont `engineKey` est
  le sien (voir les écrans « Sondage » de `lib/dev-play-fixtures.ts`).
- **Tests des stores** : ajouter un cas « vue du moteur validée par son schéma / vue d'un autre
  moteur refusée » à chacun des trois tests de store (modèle : blocs « moteur sondage (B6) »).
- **Console** : tant que le catalogue (C1) n'existe pas, le lanceur de séance ne liste que les
  quiz ; un jeu d'un autre moteur se programme par l'API (`gameSlugs`).

- **Réservation synchrone** : dans `onAction`, tous les contrôles et l'écriture en mémoire précèdent le premier
  `await`. Deux actions simultanées d'un même joueur ne doivent pas passer toutes les deux.
- **Pas de tic** : ne jamais émettre une vue chaque seconde pour faire avancer un timer ; publier une échéance.
- **Cues** : un son ou une animation qui se déduit d'un changement de vue se déclenche côté client depuis la
  vue. Le quiz émet `question_opened`, `last_seconds` et `question_closed` mais l'écran ne s'en sert pas pour
  ses sons ; seul `player_answered` porte une information absente des vues.
- **Retardataires** : `onPlayerJoined` est appelé pour toute arrivée en cours de manche ; `rejoin: true`
  signale un joueur qui revient (reprise après un départ), pas une nouvelle arrivée.
- **Fin de manche** : `ctx.finish()` une seule fois, après la dernière vue (`done` pour le quiz). La plateforme
  émet `round:ended` puis termine la séance (ou lancera la manche suivante, B5).
- **Habillage** : les fonds et sons de la séance sont encore ceux du quiz de la séance (`session:started.quiz`,
  `audio`) ; un moteur sans quiz s'affiche sur l'habillage de la séance.
