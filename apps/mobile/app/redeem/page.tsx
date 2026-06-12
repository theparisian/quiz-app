'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import {
  PinModal,
  PrizeStatusCard,
  getStoredStaffPin,
  type PrizeStatusData,
  useRedeemFlow,
} from '@/components/redeem/redeem-shared';

function formatShortCodeInput(raw: string): string {
  const c = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
  if (c.length <= 3) return c;
  return `${c.slice(0, 3)}-${c.slice(3)}`;
}

export default function RedeemManualPage() {
  const [shortCode, setShortCode] = useState('');
  const [staffPin, setStaffPin] = useState(getStoredStaffPin());
  const [lookupData, setLookupData] = useState<PrizeStatusData | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const flow = useRedeemFlow({
    redeemCode: lookupData?.redeemCode,
    sig: lookupData?.sig,
    redeemedVia: 'code',
  });

  async function handleLookup() {
    setLooking(true);
    setLookupError(null);
    setLookupData(null);
    try {
      const res = await api.post<PrizeStatusData>('/api/prizes/lookup', {
        shortCode: formatShortCodeInput(shortCode),
        staffPin,
      });
      setLookupData(res);
      sessionStorage.setItem('quiz_staff_pin', staffPin);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      setLookupError(
        e.code === 'INVALID_PIN' ? 'Code ou PIN incorrect.' : (e.message ?? 'Erreur. Réessayez.'),
      );
    } finally {
      setLooking(false);
    }
  }

  if (flow.validated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-green-950 p-6 text-center">
        <p className="text-5xl">✓</p>
        <h1 className="text-2xl font-bold text-green-300">Lot validé</h1>
      </main>
    );
  }

  const displayData = lookupData ?? flow.data;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <h1 className="text-center text-xl font-bold">Validation comptoir</h1>
      <p className="text-center text-sm text-gray-400">Saisie manuelle du code lot</p>

      {!lookupData && (
        <div className="space-y-4">
          <label className="block text-sm text-gray-400">
            Code lot
            <input
              value={shortCode}
              onChange={(e) => setShortCode(formatShortCodeInput(e.target.value))}
              placeholder="ABC-123"
              className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-4 text-center font-mono text-xl uppercase tracking-widest"
              style={{ fontSize: '16px' }}
            />
          </label>
          <label className="block text-sm text-gray-400">
            PIN comptoir
            <input
              type="password"
              inputMode="numeric"
              value={staffPin}
              onChange={(e) => setStaffPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-4 text-center text-2xl tracking-widest"
              style={{ fontSize: '16px' }}
            />
          </label>
          {lookupError && <p className="text-center text-sm text-red-400">{lookupError}</p>}
          <button
            type="button"
            disabled={shortCode.length < 6 || staffPin.length < 4 || looking}
            onClick={() => void handleLookup()}
            className="w-full rounded-xl bg-blue-600 py-4 font-semibold disabled:opacity-40"
          >
            {looking ? 'Recherche…' : 'Rechercher le lot'}
          </button>
        </div>
      )}

      {displayData && (
        <>
          <PrizeStatusCard data={displayData} />
          {displayData.status === 'valid' && (
            <button
              type="button"
              onClick={() => flow.setPinOpen(true)}
              className="rounded-xl bg-green-600 py-4 text-center font-semibold"
            >
              Valider ce lot — réservé au comptoir
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setLookupData(null);
              setShortCode('');
            }}
            className="text-sm text-gray-500 underline"
          >
            Autre code
          </button>
        </>
      )}

      <PinModal
        open={flow.pinOpen}
        onClose={() => flow.setPinOpen(false)}
        onSubmit={(pin) => void flow.confirmRedeem(pin)}
        loading={flow.validating}
        error={flow.pinError}
      />
    </main>
  );
}
