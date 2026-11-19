import * as Sentry from '@sentry/nextjs';

/**
 * Signale à Sentry une anomalie silencieuse côté joueur (vue de jeu invalide, moteur inconnu…).
 * Jamais d'erreur visible : l'écran affiche un rendu de repli.
 */
export function reportGameIssue(message: string, extra: Record<string, unknown>): void {
  try {
    Sentry.captureMessage(message, { level: 'warning', extra });
  } catch {
    // Sentry absent ou non initialisé : rien à faire.
  }
}
