'use client';

interface LateWaitScreenProps {
  /** Temps restant avant l'échéance de la phase en cours (`useCountdown`), ou null. */
  remainingMs: number | null;
  title?: string;
  subtitle?: string;
  /** Libellé du compte à rebours, suivi de « ~Ns ». Null : pas de compte à rebours. */
  countdownLabel?: string | null;
}

/**
 * Écran d'attente sans action possible : retardataire (arrivé pendant la question), compte à
 * rebours d'avant la première question, fin de la dernière question.
 */
export default function LateWaitScreen({
  remainingMs,
  title = 'Tu es dans la partie !',
  subtitle = 'La prochaine question arrive…',
  countdownLabel = 'Prochaine question dans',
}: LateWaitScreenProps) {
  const remainingSec = remainingMs != null ? Math.ceil(remainingMs / 1000) : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="animate-pulse text-4xl">🎬</div>
      <div className="text-2xl font-bold">{title}</div>
      <p className="text-lg text-gray-400">{subtitle}</p>
      {countdownLabel && remainingSec != null && remainingSec > 0 && (
        <p className="text-brand-400 text-sm">
          {countdownLabel} ~{remainingSec}s
        </p>
      )}
    </div>
  );
}
