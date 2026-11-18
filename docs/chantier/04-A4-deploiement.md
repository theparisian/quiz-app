# A4 — Déploiement

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
Rendre le déploiement sûr : il ne part qu'après une CI verte, refuse de redémarrer pendant une
séance, vérifie la santé après redémarrage et revient en arrière en cas d'échec. La compilation
reste sur le VPS pour l'instant.

À LIRE
.github/workflows/deploy.yml (en entier, ligne à ligne), .github/workflows/ci.yml,
ecosystem.config.js, scripts/load-env.sh, api/src/routes/health.ts, api/tests/health-detailed.test.ts,
ROADMAP.md (backlog 3 et 10).

À FAIRE
1. api/src/routes/health.ts : ajoute GET /health/active-sessions, protégé par l'en-tête
   x-health-token exactement comme /health/detailed (401 si absent ou faux, cette fois).
   Réponse : { running, paused, lobbyWithPlayers, blocking }. lobbyWithPlayers = sessions en lobby
   avec au moins un joueur actif ET créées depuis moins de 60 minutes. blocking = somme des trois.
   Test Vitest associé.
2. Crée scripts/deploy.sh (bash, set -euo pipefail, exécutable), lancé sur le VPS depuis la racine
   du projet, qui reçoit BRANCH et FORCE en variables d'environnement :
   a. PREV_SHA=$(git rev-parse HEAD)
   b. Garde : interroge http://127.0.0.1:4000/health/active-sessions avec HEALTH_CHECK_TOKEN lu dans
      .env. Si blocking > 0 et FORCE != "1" : affiche « Déploiement refusé : N session(s) en cours »
      et sort en code 3. Si l'API ne répond pas (premier déploiement), continue.
   c. git fetch origin "$BRANCH" && git checkout "$BRANCH" && git reset --hard "origin/$BRANCH"
      (plus de git stash, plus de git pull).
   d. corepack, pnpm install --frozen-lockfile, db:generate, source scripts/load-env.sh,
      pnpm turbo build --concurrency=1, db:migrate:deploy, pm2 startOrReload ecosystem.config.js
      --update-env, pm2 save : reprends les commandes exactes du workflow actuel, dans le même ordre.
   e. Contrôle : jusqu'à 30 essais espacés de 2 s sur http://127.0.0.1:4000/health et sur les ports
      4001 à 4004. L'API doit répondre 200 ; les quatre apps, un code inférieur à 500.
   f. Échec du contrôle ou de la compilation : git reset --hard "$PREV_SHA", réinstalle, recompile,
      pm2 startOrReload, puis sort en code 1 avec « ROLLBACK effectué vers <sha> ».
      Les migrations ne sont jamais annulées : écris-le en commentaire en tête du script.
3. deploy.yml :
   - Déclencheurs : workflow_run sur le workflow "CI" (types: completed, branches: master),
     exécuté seulement si conclusion == 'success' ; et workflow_dispatch avec les entrées branch et
     force (booléen, défaut false).
   - Garde TOUTE la logique actuelle d'écriture du .env (fonctions upsert_env, variables B64) à
     l'identique, mais remplace le bloc allant de 'git stash' à la fin par l'appel
     BRANCH=... FORCE=... bash scripts/deploy.sh. Le script n'existe sur le VPS qu'après le fetch :
     fais donc git fetch + git checkout du seul fichier scripts/deploy.sh depuis origin avant l'appel.
   - Remplace -o StrictHostKeyChecking=no par l'écriture de ${{ secrets.VPS_KNOWN_HOSTS }} dans
     ~/.ssh/known_hosts et l'option StrictHostKeyChecking=yes.
   - Supprime la branche 'else' héritée (npm install / pm2 restart quiz-app).
4. Documente dans docs/runbook-cinema.md : comment forcer un déploiement, que faire après un
   rollback, et la règle « une migration doit rester compatible avec la version précédente du code ».
   Coche l'item 3 du backlog dans ROADMAP.md.

NE PAS FAIRE
Ne te connecte à aucun serveur. Ne modifie pas la liste des secrets ni leurs noms (sauf l'ajout de
VPS_KNOWN_HOSTS). Ne change pas ecosystem.config.js.

VÉRIFICATION
bash -n scripts/deploy.sh sans erreur. Relis deploy.yml : chaque secret lu avant ton changement
l'est encore après. Donne dans ton compte rendu le diff résumé du workflow.
