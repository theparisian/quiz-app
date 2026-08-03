/**
 * Seuils du timer de question, partagés entre l'animation visuelle (timer-bar)
 * et le déclenchement du son des dernières secondes (directeur audio du player).
 * Toute modification ici garde les deux synchronisés.
 */
export const TIMER_URGENT_THRESHOLD_SEC = 5;
export const TIMER_CRITICAL_THRESHOLD_SEC = 2;
