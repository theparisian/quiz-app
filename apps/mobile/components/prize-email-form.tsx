'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/lib/stores/player-store';

interface PrizeEmailFormProps {
  onSuccess: () => void;
  prizeLabel?: string;
}

function EnvelopeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-brand-400 h-5 w-5 shrink-0"
      aria-hidden
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 7 10-7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function prizeButtonLabel(prizeLabel?: string): string {
  if (!prizeLabel) return 'Valider';
  const short = prizeLabel.trim().split(/\s+/)[0];
  return short ? `Recevoir mon ${short}` : 'Valider';
}

export default function PrizeEmailForm({ onSuccess, prizeLabel }: PrizeEmailFormProps) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const playerId = usePlayerStore((s) => s.playerId);
  const resumeToken = usePlayerStore((s) => s.resumeToken);

  async function handleSubmit() {
    if (!email || !playerId || !resumeToken || !consent) return;
    setLoading(true);
    setError(null);
    try {
      await api.patch(
        `/api/players/${playerId}/email`,
        { email, consent: true },
        {
          'X-Player-Token': resumeToken,
        },
      );
      setLoading(false);
      onSuccess();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string; status?: number };
      if (e.code === 'CONSENT_REQUIRED') {
        setError('Tu dois accepter de recevoir ton lot par email.');
      } else if (e.code === 'PRIZE_NOT_CONFIGURED') {
        setError("Le lot n'est plus disponible.");
      } else if (e.code === 'PRIZE_ALREADY_EXISTS') {
        setError('Tu as déjà reçu ton lot par email. Vérifie ta boîte (et tes spams).');
      } else if (e.status === 500 || e.code === 'PRIZE_EMAIL_SEND_FAILED') {
        setError('Email non envoyé. Le cinéma sera prévenu et te recontactera.');
      } else {
        setError(e.message ?? "Erreur lors de l'envoi.");
      }
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-300">
        <EnvelopeIcon />
        <span>Saisis ton email pour recevoir ton lot :</span>
      </div>

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@example.com"
        className="focus:ring-brand-500 mb-4 w-full rounded-xl bg-white/10 px-4 py-4 text-lg text-white placeholder-gray-600 outline-none ring-2 ring-white/20"
        style={{ fontSize: '16px' }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && consent) void handleSubmit();
        }}
      />

      <label className="mb-5 flex items-start gap-3 text-left text-sm text-gray-400">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20"
        />
        <span>J&apos;ai 15 ans ou plus et j&apos;accepte de recevoir mon lot par email.</span>
      </label>

      {error && <div className="mb-4 text-sm text-red-400">{error}</div>}

      <button
        onClick={() => void handleSubmit()}
        disabled={loading || !email || !consent}
        className="bg-brand-600 mb-4 w-full rounded-xl py-4 text-lg font-semibold text-white transition-colors disabled:opacity-40"
      >
        {loading ? 'Envoi…' : prizeButtonLabel(prizeLabel)}
      </button>

      <p className="flex items-start justify-center gap-1.5 text-center text-xs leading-relaxed text-gray-500">
        <LockIcon />
        <span>
          Email utilisé uniquement pour l&apos;envoi du lot. Lien de désinscription dans chaque
          email.
        </span>
      </p>

      <button onClick={onSuccess} className="mt-4 w-full py-2 text-sm text-gray-500 underline">
        Plus tard, merci
      </button>
    </div>
  );
}
