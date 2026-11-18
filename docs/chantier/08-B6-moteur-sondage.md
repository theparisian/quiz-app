# B6 — Deuxième moteur : sondage

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
Valider l'architecture avec un moteur simple qui n'utilise QUE le protocole générique : le sondage
(« poll »). Une à dix questions sans bonne réponse ; le public vote, l'écran montre les barres.

À LIRE
api/src/modules/games/* (engine.types.ts, le moteur quiz comme exemple), packages/validation,
les dossiers games/ des trois apps (créés par l'unité B2-B4), docs/ajouter-un-moteur.md, apps/admin/app/(dashboard)/quizzes/page.tsx.

À FAIRE — API
1. packages/validation/src/games/poll.ts :
   pollConfigSchema = { questions: [{ id: string, text: 1..200, options: 2 à 4 × { id, text 1..80 },
     durationSeconds: 5..60 (défaut 20) }] (1 à 10), participationPoints: 0..1000 (défaut 300),
     resultsSeconds: 3..20 (défaut 6) }
   Vues : pollScreenView, pollMobileView, pollConsoleView, toutes avec
   { phase: 'question' | 'results' | 'done', questionIndex, totalQuestions, question: { id, text,
   options }, endsAt (ISO, phase question), totalVotes } ; les vues screen et console ajoutent
   counts par option en phase results ; la vue mobile ajoute myVote (id d'option ou null).
2. api/src/modules/games/engines/poll/poll-engine.ts, enregistré sous la clé 'poll' :
   - start : phase question 0, emitState aux trois audiences, timer durationSeconds.
   - onAction type 'vote', payload { questionId, optionId } : un vote par joueur et par question
     (réservation synchrone avant tout await, comme le quiz) ; refuse hors phase question
     (PHASE_CLOSED) ou option inconnue ; renvoie { accepted: true } ; réémet la vue mobile à ce joueur
     seul et, regroupé toutes les 250 ms, totalVotes aux écrans.
   - fin du timer ou tous les joueurs ont voté : phase results avec counts, puis après resultsSeconds
     question suivante ; après la dernière : ctx.award de participationPoints à chaque joueur ayant
     voté au moins une fois (reason 'poll_participation'), puis ctx.finish().
   - pause / resume : gèle et reprend le timer courant, endsAt recalculé et vue réémise.
   - forceAdvance : passe à la phase suivante.
   - persistState à chaque changement de phase ({ questionIndex, phase, votes }) ; restore : reprend à
     la phase results de la question interrompue.
   - snapshot : renvoie la vue courante pour l'audience (et le joueur).
3. API REST minimale, super_admin : POST /api/games (engineKey 'poll', title, configJson validé par
   pollConfigSchema), PATCH /api/games/:slug, POST /api/games/:slug/publish. Refuse engineKey 'quiz'
   (les jeux quiz sont créés par l'éditeur de quiz).

À FAIRE — Apps
4. games/poll/ dans les trois apps, enregistré dans chaque registre. Tout provient de view.
   - Écran cinéma : question en grand, options avec les formes et couleurs de
     packages/design-tokens (answer-colors), barre de temps calculée depuis endsAt, compteur de votes ;
     en phase results, barres horizontales animées avec pourcentages.
   - Mobile : boutons d'option sur le modèle de components/answer-button.tsx ; après le vote,
     « Vote enregistré » et option choisie surlignée ; en results, les pourcentages.
   - Console : question en cours, votes reçus, résultats.
5. apps/admin : page /games/new-poll, formulaire simple (titre, questions, options, durées) qui appelle
   l'API, et entrée « Sondages » dans lib/nav-items.ts.

NE PAS FAIRE
Le moteur poll n'émet aucun événement session:question_* et n'écrit pas dans player_answers.
Si tu as besoin de modifier engine.types.ts ou la plateforme pour y arriver, arrête-toi et explique
pourquoi : c'est le signe que l'abstraction a un trou, et je veux le savoir.

TESTS
Moteur seul avec faux contexte (vote, double vote, hors phase, fin anticipée, attribution des points) ;
session de 2 manches quiz + poll de bout en bout ; reprise après redémarrage en phase question.
