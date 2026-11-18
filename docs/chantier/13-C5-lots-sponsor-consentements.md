# C5 — Lots sponsor et consentements email

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

1. Permettre des lots retirés hors du cinéma (codes fournis par la marque). 2) Séparer les
   consentements email : la plateforme collecte et conserve ; rien n'est transmis à un cinéma ou à un
   sponsor sans accord enregistré ET case cochée par le joueur.

À LIRE
api/src/modules/prizes/_ (tous les fichiers), api/src/shared/email/prize-email-queue.service.ts et
templates/prize-email.ts, api/src/routes/unsubscribe.ts, api/src/modules/players/players.routes.ts et
players.schemas.ts, apps/mobile/components/prize-email-form.tsx et final-screen.tsx,
apps/mobile/app/redeem/_, apps/admin/app/(dashboard)/sponsors/[slug]/prize-templates/page.tsx,
PROJECT_REFERENCE.md section 9.

À FAIRE — Lots à codes (migration 0026)

1. enum PrizeRedeemMode { staff_pin code_pool static_code } ; prize_templates.redeem_mode défaut
   staff_pin, static_code VarChar(100)?, redeem_instructions Text? (ex. « Présentez ce code en
   caisse »), redeem_url VarChar(500)?.
   prize_codes : id, templateId, code VarChar(100), prizeId BigInt? UNIQUE, assignedAt?,
   @@unique([templateId, code]).
2. Super-admin : POST /api/prize-templates/:id/codes/import (CSV ou texte, un code par ligne,
   doublons ignorés, 10 000 par import au plus), GET .../codes/stats { total, assigned, remaining }.
   En mode code_pool, le stock du gabarit EST le nombre de codes restants.
3. prizesService.createForPlayer, mode code_pool : dans la transaction existante, réserve un code
   libre (UPDATE ... WHERE prize_id IS NULL LIMIT 1, puis vérifie qu'une ligne a été prise ; sinon
   STOCK_EXHAUSTED, même repli que le stock actuel). Enregistre le code dans payloadJson.partnerCode.
   Mode static_code : partnerCode = static_code.
4. Email et page /redeem : pour code_pool et static_code, affiche le code du partenaire en gros, son
   QR, les instructions et le lien, à la place du QR de validation par PIN. La validation par PIN est
   refusée pour ces lots (409 NOT_STAFF_REDEEMABLE). Le rapport de session et le portail sponsor
   renvoient prizesRedeemed = null pour ces lots.

À FAIRE — Consentements (même migration) 5. enum ConsentScope { platform cinema sponsor }
contacts : id, email VarChar(255) UNIQUE (minuscules), createdAt, unsubscribedAllAt?.
contact_consents : id, contactId, scope, cinemaId?, sponsorId?, sessionId, grantedAt, revokedAt?,
wordingVersion VarChar(20), @@unique([contactId, scope, cinemaId, sponsorId]).
cinemas.email_sharing_enabled Boolean défaut false (accord avec ce cinéma) ;
campaigns.emailSharingEnabled existe déjà (accord avec ce sponsor). 6. updateEmailSchema : { email, consent: true (lot, obligatoire), optInPlatform?, optInCinema?,
optInSponsor? } — les trois derniers valent false par défaut. Le serveur ignore optInCinema si
l'accord cinéma est désactivé, et optInSponsor s'il n'y a pas de campagne active avec
emailSharingEnabled dans la session. Pour chaque case acceptée : crée ou réutilise le contact et
crée le consentement (réactive-le s'il était révoqué). L'envoi du lot fonctionne exactement comme
avant, sans aucune case facultative. 7. Nouvelle route publique GET /api/players/:id/consent-options (en-tête X-Player-Token) →
{ cinema: { name } | null, sponsor: { name } | null } : dit au mobile quelles cases montrer. 8. prize-email-form.tsx : sous la case obligatoire existante (inchangée), affiche des cases
DÉCOCHÉES par défaut, seulement si applicables :

- « Je veux recevoir les actus et jeux de Shh! »
- « J'accepte que <nom du cinéma> m'envoie ses offres »
- « J'accepte que <nom du sponsor> m'envoie ses offres »
  Remplace la mention « Email utilisé uniquement pour l'envoi du lot » par « Sans case cochée, ton
  email sert uniquement à l'envoi du lot ». Stocke wordingVersion = '2026-11'.

9. Désinscription : la page existante révoque désormais aussi tous les consentements du contact
   (revokedAt + unsubscribedAllAt) ; un contact désinscrit ne sort plus dans aucun export.
10. Exports, super_admin uniquement : GET /api/contacts/export.csv?scope=cinema&cinemaSlug= ou
    ?scope=sponsor&sponsorSlug= ou ?scope=platform → email, date du consentement, version du libellé.
    Refusé (409 SHARING_NOT_AGREED) si l'accord correspondant est désactivé. Chaque export écrit un
    logEvent 'contacts.exported' avec le périmètre et le nombre de lignes. Aucun rôle cinéma ou
    sponsor n'a de route donnant un email. apps/admin : interrupteur d'accord sur la fiche cinéma et
    sur la campagne, bouton d'export sur chacune, et page « Contacts » avec les compteurs par périmètre.
11. Mets à jour PROJECT_REFERENCE.md section 9 : les contacts consentis sont conservés jusqu'au
    retrait du consentement ; l'email de lot sans case cochée garde la règle actuelle des 90 jours.

NE PAS FAIRE
N'envoie aucun email marketing : ce prompt ne fait que recueillir et exporter. Ne pré-coche aucune
case. Ne change pas le texte de la case obligatoire.

TESTS
Attribution de codes sans doublon sous 20 demandes concurrentes ; épuisement du lot ; PIN refusé sur
un lot à code ; les 3 cases, chacune ignorée quand son accord est désactivé ; désinscription qui
révoque tout ; export refusé sans accord ; export interdit aux rôles cinéma et sponsor.
