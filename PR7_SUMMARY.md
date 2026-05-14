# PR7 — Lots par email, QR signé, redemption API

## CI / déploiement (`deploy.yml`)

Secrets GitHub lus au déploiement SSH et fusionnés dans le `.env` à la racine du projet sur le VPS (`upsert_env`, valeurs passées en base64) :

| Obligatoires                                                                                                                                                                                                                | Optionnel                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`, `JWT_SECRET`, `DATABASE_URL`, SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_FROM_NAME`), lots (`PRIZE_HMAC_SECRET`, `PRIZE_REDEEM_BASE_URL`, `PRIZE_UNSUBSCRIBE_BASE_URL`) | `CORS_ORIGINS` (liste d’origines séparées par des virgules ; si absent, la clé n’est pas mise à jour par le workflow) |

Secrets déjà utilisés ailleurs : `SSH_PRIVATE_KEY`, `VPS_USER`, `VPS_HOST`, `PROJECT_PATH`, `PM2_APP_NAME` (optionnel).

## Suite — PR8 (Observabilité)

Référence : `MIGRATION_PLAN.md` § PR8. Périmètre cible :

- Logs Pino JSON cohérents sur les modules backend ; **peuplement `events_log`** sur événements critiques (sessions, abort, échec email, NUC offline prolongé, etc.).
- **Sentry** backend + les **4 apps** Next.js, sourcemaps prod.
- **Dashboard admin (D)** : santé NUCs, sessions actives, erreurs récentes, stats du jour ; alertes email sur niveau `critical`.

Critères de done PR8 : erreurs test backend/front visibles dans Sentry ; NUC offline visible / notifié dans le dashboard ; dashboard jugé exploitable en prod.

---

## Résumé (historique)

PR7 clôt la boucle « podium → email avec QR → redemption » sur la nouvelle stack (`api/`, `apps/admin/`, `apps/mobile/`), sans toucher au legacy.

## Backend

- **Migration `0008_prize_config_and_signature`** : `Cinema.prizesConfig`, `Sponsor.prizesConfig` (JSON) ; `Prize` enrichi avec `redeemCode` (nanoid 16, unique), `signature` (HMAC SHA-256 hex), `rank`, `label`, contrainte unique `(playerId, sessionId)`.
- **Module `api/src/modules/prizes/`** : `prize-env.ts` (`validatePrizeEnvironment` en prod), `prize-signature.service.ts`, `prize-config.service.ts` (override sponsor → fallback cinéma), `prizes.schemas.ts`, `prizes.service.ts`, `prizes.routes.ts`.
- **Routes** :
  - `POST /api/prizes/redeem/:redeemCode` — body `{ signature }` (hex 64).
  - `POST /api/prizes/unsubscribe/:redeemCode` — anonymise `emailForPrize`.
  - `GET|PATCH /api/cinemas/:slug/prizes-config`, `GET /api/cinemas/:slug/prizes` — auth `super_admin | cinema_admin`.
  - `GET|PATCH /api/sponsors/:slug/prizes-config` — auth `super_admin`.
- **`PATCH /api/players/:id/email`** : délègue à `prizesService.createForPlayer` ; réponse `{ ok, emailSent, prizeId }` ; erreurs `PRIZE_ALREADY_EXISTS`, `PRIZE_NOT_CONFIGURED`, `PRIZE_EMAIL_SEND_FAILED` (500 avec prize créé et `emailSentAt` null).
- **Email** : `shared/email/templates/prize-email.ts`, QR en data URL (`qrcode`), retry SMTP 2 s, français.
- **Page publique** : `GET /unsubscribe?code=&sig=` (`routes/unsubscribe.ts`) — HTML minimal qui POST vers l’API.
- **Env** : `PRIZE_HMAC_SECRET` (≥32 car. obligatoire en prod au boot), `PRIZE_REDEEM_BASE_URL`, `PRIZE_UNSUBSCRIBE_BASE_URL` — documentés dans `api/.env.example`.

## Frontend admin

- `/cinemas/[slug]/prizes` — formulaire 3 rangs.
- `/cinemas/[slug]/prizes/history` — liste, filtres statut / recherche pseudo, drawer détail + copie URL redeem.
- `/sponsors/[slug]/prizes` — idem sponsor.
- Liens depuis les fiches cinéma et sponsor (« Configurer les lots »).

## Mobile

- `lib/api.ts` lit les erreurs au format `{ error: { code, message } }`.
- `prize-email-form.tsx` : messages pour `PRIZE_NOT_CONFIGURED`, `PRIZE_ALREADY_EXISTS`, échec envoi / 500.
- Écran succès : « Email envoyé ! Vérifie ta boîte de réception (et tes spams). »

## Tests

- `tests/prize-signature.service.test.ts` — HMAC + `timingSafeEqual`.
- `tests/prizes.pr7.integration.test.ts` — redeem, unsubscribe, double validation, config manquante, override sponsor, PATCH config cinéma, mocks `sendEmail` (retry / double échec).
- `tests/helpers/integration.ts` — truncate : `prize` avant `player` (FK).
- `tests/players.email.test.ts` — config lots sur le cinéma + assertions prize / `emailSent`.

## Test bout en bout réalisé

À compléter sur l’environnement de déploiement avec SMTP réel et secrets : session terminée en top 3, validation email mobile, vérification réception HTML + QR, ouverture URL `PRIZE_REDEEM_BASE_URL/{redeemCode}?sig=…`, `POST /api/prizes/redeem/:redeemCode`, deuxième appel en 409, lien désinscription sur `/unsubscribe?code=&sig=`.

_(Non exécuté automatiquement dans cette session CI : envoi vers une boîte personnelle et scan téléphone.)_

## Commandes

```bash
pnpm --filter @quiz-app/api db:migrate:deploy
pnpm --filter @quiz-app/api test
pnpm typecheck
```
