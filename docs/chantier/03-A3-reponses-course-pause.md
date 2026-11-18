# A3 — Réponses : course, pause, compteur

## Règles générales

Tu travailles dans le monorepo Shh! (pnpm + Turborepo) : api/ (Express, Socket.io, Prisma, MySQL),
apps/player (écran cinéma), apps/mobile (joueur), apps/console (cinéma), apps/admin (super-admin),
packages/validation (schémas Zod partagés), packages/types.

Règles obligatoires :

1. Lis d'abord PROJECT_REFERENCE.md sections 2, 6 et 7, puis tous les fichiers cités dans "À lire".
   Ne modifie rien avant d'avoir lu.
2. Fais uniquement ce qui est demandé. Aucun refactor, renommage ou reformatage hors périmètre.
   Si quelque chose te semble nécessaire hors périmètre, arrête-toi et écris-le dans ton compte rendu.
3. Respecte les conventions existantes : modules api en <nom>.routes.ts / .service.ts / .schemas.ts,
   erreurs via AppError(message, status, CODE), validation via validate(schema, body),
   ids BigInt en base et string dans le JSON, journalisation via logger et logEvent.
4. Tout payload REST ou socket nouveau a son schéma Zod dans packages/validation, exporté par index.ts.
5. Toute modification du schéma Prisma passe par une migration SQL nommée dans api/prisma/migrations
   (numéro suivant le dernier existant). Jamais de "db push". Les migrations sont additives :
   on n'efface ni colonne ni table existante.
6. Chaque comportement nouveau a un test Vitest dans api/tests, sur le modèle des tests existants
   (helpers dans api/tests/helpers/integration.ts). Les tests existants doivent rester verts
   sans être affaiblis ni supprimés.
7. Textes d'interface en français, tutoiement côté joueur, vouvoiement côté cinéma et sponsor.
8. Termine par : pnpm typecheck && pnpm lint && pnpm --filter @quiz-app/api test.
   Corrige jusqu'à ce que tout passe.
9. Compte rendu final : fichiers créés et modifiés, migrations, tests ajoutés, points laissés ouverts.

## Ta mission

OBJECTIF
Dans api/src/modules/sessions/session-orchestrator.service.ts : empêcher qu'un joueur change sa
réponse par double envoi, refuser les réponses pendant une pause, réduire les requêtes par réponse
et regrouper la diffusion du compteur. Aucun changement de payload ni de nom d'événement.

À LIRE
Le fichier ci-dessus en entier, api/src/shared/scoring/scoring.service.ts,
api/src/modules/players/players.service.ts, api/src/shared/sockets/handlers/mobile-handler.ts,
api/tests/session-orchestrator.test.ts, api/tests/late-join.test.ts, api/tests/session-resume.test.ts.

À FAIRE

1. Ajoute à RunningSessionState :
   playerMeta: Map<string, { pseudo: string; avatarUrl: string | null; joinedQuestionPosition: number | null }>
   answerCountFlushHandle: ReturnType<typeof setTimeout> | null
   Remplis playerMeta partout où playerIds est construit (start, les deux fonctions rehydrate) avec
   une seule requête par session. Change addPlayerToSession(sessionId, playerId, meta) et son appel
   dans players.service.ts pour fournir pseudo, avatarUrl, joinedQuestionPosition.
2. Réécris submitAnswer pour que TOUS les contrôles et la réservation soient synchrones, sans aucun
   await entre le test et l'écriture en mémoire, dans cet ordre :
   a. questionEnded → 409 QUESTION_ALREADY_ENDED
   b. currentQuestionPausedAt non nul → 409 SESSION_PAUSED (nouveau code)
   c. mauvaise question → 400 WRONG_QUESTION
   d. joueur absent de playerMeta → 403 PLAYER_NOT_IN_SESSION
   e. joinedQuestionPosition === position courante → 403 LATE_JOIN_LOCKED
   f. réponse étrangère à la question → 400 INVALID_ANSWER
   g. inMemoryAnswers.has(pid) → 409 ALREADY_ANSWERED
   h. timeToAnswerMs = Math.max(1, Date.now() - currentQuestionStartedAt) ; inMemoryAnswers.set(...)
   Ensuite seulement : un unique prisma.playerAnswer.upsert (comme aujourd'hui). Supprime les deux
   lectures prisma.player.findUnique et prisma.playerAnswer.findUnique de cette fonction.
   Si l'upsert échoue : logger.error, mais la réponse en mémoire est conservée.
3. Compteur : remplace l'émission immédiate de session:answer_submitted_count par une émission
   regroupée. Si answerCountFlushHandle est nul, programme un setTimeout de 250 ms qui émet le
   compte courant puis remet le handle à null. clearTimers annule ce handle. endQuestionInternal
   émet un dernier compte exact avant session:question_ended.
   session:player_answered (écran seul) reste émis à chaque réponse, depuis playerMeta.
4. endQuestionInternal : remplace la boucle d'updates un par un par une seule
   prisma.$transaction([...]) contenant tous les increments. endSessionInternal : idem pour rankFinal.
5. resumeSession : extrais la création de broadcastInterval, dupliquée avec nextQuestionInternal,
   dans une fonction startTimerBroadcast(state, sessionId). Comportement identique.

NE PAS FAIRE
Ne touche pas à computeScore. Ne change pas la tolérance TIMER_TOLERANCE_MS ni les durées.

TESTS (dans session-orchestrator.test.ts)

- Deux submitAnswer simultanés du même joueur avec deux réponses différentes (Promise.allSettled) :
  un seul réussit, l'autre lève ALREADY_ANSWERED, et la réponse enregistrée en base est la première.
- Réponse pendant une pause : SESSION_PAUSED ; après resume, la réponse est acceptée.
- 20 réponses en rafale : moins de 20 événements session:answer_submitted_count reçus, et le
  dernier reçu avant question_ended porte count = 20.
- Les tests existants (cycle complet, late-join, resume) passent sans modification de leurs assertions.
