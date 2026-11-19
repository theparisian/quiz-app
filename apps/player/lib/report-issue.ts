import * as Sentry from '@sentry/nextjs';

/**
 * Signale à Sentry une anomalie silencieuse de l'écran cinéma (vue de jeu invalide, moteur
 * inconnu…). Jamais d'erreur visible : l'écran affiche un rendu de repli (principe 2.1).
 */
export function reportGameIssue(message: string, extra: Record<string, unknown>): void {
  try {
    Sentry.captureMessage(message, { level: 'warning', extra });
  } catch {
    // Sentry absent ou non initialisé : rien à faire.
  }
}
