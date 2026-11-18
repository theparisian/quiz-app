# C3 — Campagnes, preuve de diffusion, relevés

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
Savoir, pour chaque jeu sponsorisé, où et quand il a été réellement diffusé, devant combien de
participants, et ce que cela rapporte au cinéma. On facture des séances diffusées et des
participants, jamais des « vues ».

À LIRE
api/src/modules/sponsors/_, api/src/modules/games/_, la plateforme de session (fin de manche),
api/src/shared/sockets/handlers/player-handler.ts, apps/player/games/_ et hooks/use-nuc-events.ts,
api/src/modules/sessions/session-report.service.ts (fonction CSV), apps/admin sponsors/[slug]/page.tsx,
apps/console/components/live-console/ended-view.tsx, apps/console/components/catalog/_.

À FAIRE — Données (migration 0024)

1. enum CampaignStatus { draft active paused ended } ; enum CampaignPricing { per_session per_participant }
   campaigns : id, sponsorId, gameId, name, status, startsAt, endsAt, pricing, unitPriceCents Int,
   cinemaSharePercent Int (0..100), maxSessions Int?, maxSessionsPerScreenPerDay Int? (défaut 3),
   emailSharingEnabled Boolean défaut false, notes Text?, createdAt, updatedAt.
   deliveries : id, campaignId, sessionId, roundId UNIQUE, screenId, cinemaId, playedAt,
   proofDisplayedAt DateTime?, participants Int, finishers Int, prizesIssued Int défaut 0,
   attendance Int?, billable Boolean, nonBillableReason VarChar(50)?, amountCents Int,
   cinemaShareCents Int, createdAt. Index (campaignId, playedAt) et (cinemaId, playedAt).
   sessions : attendance Int? (entrées de la séance, saisie par le cinéma).
   session_rounds : proofDisplayedAt DateTime?.
2. Une seule campagne active par jeu à un instant donné (contrôle dans le service, 409 sinon).

À FAIRE — Preuve de diffusion 3. apps/player : quand le rendu d'une manche est monté et visible, émets une fois par manche
nuc:round_displayed { roundId }. Serveur (player-handler) : socket de type nuc, manche appartenant à
la session de sa salle ; écrit proofDisplayedAt si vide.

À FAIRE — Journal 4. À la fin d'une manche (state ended, pas skipped) dont le jeu a une campagne active couvrant la
date : crée une Delivery. participants = joueurs ayant fait au moins une action dans la manche ;
finishers = joueurs encore actifs à la fin. billable = false avec raison si : pas de preuve
('no_proof'), moins de 3 participants ('too_few_players'), plafond par salle et par jour atteint
('daily_cap'), plafond total atteint ('campaign_cap').
Montant : per_session → unitPriceCents ; per_participant → unitPriceCents × participants ;
0 si non facturable. cinemaShareCents = arrondi(amount × cinemaSharePercent / 100).
La création ne doit jamais faire échouer la fin de manche : try/catch + logEvent niveau error. 5. prizesIssued est incrémenté quand un lot de cette session est créé et que la session contient la
manche sponsorisée. attendance est recopié depuis la session quand le cinéma le saisit.

À FAIRE — API et écrans 6. Super-admin : CRUD /api/campaigns, POST /:id/activate, /pause, /end ;
GET /api/campaigns/:id/deliveries ; GET /api/cinemas/:slug/statement?month=YYYY-MM (JSON) et
/statement.csv : lignes par séance + total de la part cinéma.
apps/admin : onglet « Campagnes » sur la fiche sponsor (liste, création, état, totaux) et page
« Relevés » par cinéma et par mois. 7. Cinéma : PATCH /api/sessions/:id/attendance { attendance: 0..2000 } (contrôle de cinéma, session
terminée depuis moins de 7 jours). Console, écran de fin de session : champ « Entrées de la
séance » avec le texte « Sert à calculer votre taux de participation ».
/api/catalog : pour un jeu avec campagne active, ajoute revenue { pricing, cinemaAmountCents } ;
game-card et le panneau de détail affichent « Vous rapporte X,XX € par séance » ou
« X,XX € par participant ». Console : page « Revenus » = relevé du mois en cours du cinéma.

TESTS
Création de Delivery (les 4 raisons de non-facturation et le cas nominal, pour les deux tarifs),
unicité par manche, preuve refusée pour un boîtier d'une autre salle, relevé mensuel exact sur un jeu
de données fixe, montant affiché dans le catalogue, cloisonnement entre cinémas.
