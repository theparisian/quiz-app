# PR8 — Observabilité

## Résumé

Mise en place du journal applicatif (`events_log` + `logEvent`), des alertes email sur événements `critical` avec throttle par `eventType`, de Sentry côté API et les quatre apps Next, des routes agrégées `GET /api/dashboard/*`, d’un `/health` minimal et d’un `/health/detailed` protégé par jeton (`X-Health-Token`), d’un tableau de bord admin avec rafraîchissement automatique, et des tests Vitest (event-log, dashboard, health).

---

## Backend

- **`packages/observability`** : sanitization PII pour Sentry (`scrub-pii`).
- **`logEvent`** (fire-and-forget) dans `shared/events/` ; persistance Prisma ; sur `critical`, envoi SMTP via `sendCriticalAlert` (destinataires `ADMIN_ALERT_EMAILS`, throttle 60 s même `eventType`).
- **`index` Prisma** sur `events_log` (`event_type`, `created_at`) pour les agrégats dashboard / erreurs récentes.
- **Instrumentation** : sessions live, joueurs, publish/archive quiz, refus IA, auth NUC échouée, NUC monitor offline, prix email/redemption (+ IP dans le flux concerné).
- **Sentry** : `api/src/shared/sentry/sentry.ts` (`SENTRY_DSN_API`, `SENTRY_ENVIRONMENT`), initialisation avant le reste du serveur, flush au shutdown ; handler Express envoie à Sentry les erreurs hors `AppError` 4xx.
- **`/health`** → `{ status: 'ok' }` ; **`/health/detailed`** → détail seulement si `HEALTH_CHECK_TOKEN` défini et `X-Health-Token` correspondant ; sinon même réponse légère que `/health`.
- **`/api/dashboard`** : `health`, `today`, `recent-errors`, `recent-sessions` ; rôles `super_admin`, `cinema_admin` avec filtrage par périmètre cinéma.
- **Email** : `sendEmail` accepte plusieurs destinataires et corps HTML optionnel (alertes critiques).

---

## Frontend (apps Next)

- **`next.config.ts`** : `@sentry/nextjs` avec `withSentryConfig({ silent: true })` ; transpilation `@quiz-app/observability`.
- Par app : **`instrumentation.ts`** / **`instrumentation-client.ts`**, **`lib/sentry-bootstrap.ts`**, **`app/global-error.tsx`** ; DSN **`NEXT_PUBLIC_SENTRY_DSN_<APP>`** (suffixe `ADMIN` | `CONSOLE` | `PLAYER` | `MOBILE`).
- Pages **`useSearchParams`** enveloppées dans **Suspense** là où nécessaire (build Next 15).

---

## Admin (interface D)

- **`apps/admin/app/(dashboard)/page.tsx`** : polling (~30 s) sur les endpoints dashboard, cartes NUC/sessions/abandons du jour, listes NUC hors ligne et erreurs `events_log`, sessions du jour, pastille globale état dégradé.

---

## Variables d’environnement

| Contexte          | Variables                                                                          |
| ----------------- | ---------------------------------------------------------------------------------- |
| API               | `SENTRY_DSN_API`, `SENTRY_ENVIRONMENT`, `ADMIN_ALERT_EMAILS`, `HEALTH_CHECK_TOKEN` |
| Next (chaque app) | `NEXT_PUBLIC_SENTRY_DSN_*`, `SENTRY_ENVIRONMENT` (voir fichiers `.env.example`)    |

Référence : `api/.env.example`, `apps/*/.env.example`.

---

## Vérification manuelle — Sentry

1. Définir les DSN (API + chaque front) avec le projet créé dans Sentry ; redémarrer API et apps.
2. **Backend** : déclencher une route qui lève une erreur non gérée (ex. erreur 500 interne hors `AppError`) et confirmer l’issue dans le projet backend.
3. **Frontend** : sur chaque app, provoquer une erreur rendue (`throw` dans une page de test ou bouton qui lève), ou erreur boundary ; confirmer l’issue dans le projet front correspondant.
4. Contrôler que les payloads ne contiennent pas de champs sensibles évidents (sanitization `@quiz-app/observability`).

---

## Vérification — alertes critiques

1. Renseigner `ADMIN_ALERT_EMAILS` et SMTP opérationnels.
2. Déclencher un chemin métier qui appelle `logEvent` avec `level: 'critical'` (ex. orchestrateur refuse une action IA configurée ainsi, ou événement NUC monitor suivant les règles du code).
3. Vérifier la réception d’un email d’alerte ; un second événement **même `eventType`** sous 60 s ne doit pas renvoyer d’email (log info « suppressed »).

---

## Tests

- `pnpm --filter @quiz-app/api test` : `tests/event-log.service.test.ts`, `tests/dashboard.service.test.ts`, `tests/health-detailed.test.ts` (et suite existante).

---

## Hors périmètre (référence plan)

Journalisation centralisée long terme (BetterStack, Axiom, …) ; alignement exhaustif des README historiques avec le nouveau contrat `/health` (traité dans ce résumé et `MIGRATION_PLAN.md`).
