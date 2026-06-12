'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/lib/stores/player-store';

interface PrizeEmailFormProps {
  onSuccess: () => void;
}

export default function PrizeEmailForm({ onSuccess }: PrizeEmailFormProps) {
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
    <div className="w-full max-w-xs">
      <div className="mb-4 text-center text-sm text-gray-400">
        Saisis ton email pour recevoir ton lot :
      </div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@example.com"
        className="focus:ring-brand-500 mb-3 w-full rounded-xl bg-white/10 px-4 py-4 text-center text-lg text-white placeholder-gray-600 outline-none ring-2 ring-white/20"
        style={{ fontSize: '16px' }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && consent) void handleSubmit();
        }}
      />
      <label className="mb-3 flex items-start gap-2 text-left text-sm text-gray-400">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1"
        />
        <span>J&apos;ai 15 ans ou plus et j&apos;accepte de recevoir mon lot par email.</span>
      </label>
      {error && <div className="mb-3 text-center text-sm text-red-400">{error}</div>}
      <button
        onClick={() => void handleSubmit()}
        disabled={loading || !email || !consent}
        className="bg-brand-600 mb-2 w-full rounded-xl py-3 font-semibold text-white disabled:opacity-40"
      >
        Valider
      </button>
      <p className="mb-2 text-center text-xs text-gray-500">
        Email utilisé uniquement pour l&apos;envoi du lot. Lien de désinscription dans chaque email.
      </p>
      <button onClick={onSuccess} className="w-full py-2 text-sm text-gray-500 underline">
        Plus tard, merci
      </button>
    </div>
  );
}
