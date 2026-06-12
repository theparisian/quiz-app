'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { PinModal, PrizeStatusCard, useRedeemFlow } from '@/components/redeem/redeem-shared';

export default function RedeemCodePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sig = searchParams.get('sig') ?? '';
  const redeemCode = typeof params.code === 'string' ? params.code : '';

  const flow = useRedeemFlow({ redeemCode, sig, redeemedVia: 'qr' });

  if (flow.loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-gray-400">Chargement…</p>
      </main>
    );
  }

  if (flow.loadError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg text-gray-300">{flow.loadError}</p>
        <button
          type="button"
          onClick={() => void flow.reload()}
          className="rounded-xl border border-white/20 px-6 py-3 text-sm"
        >
          Réessayer
        </button>
      </main>
    );
  }

  if (flow.validated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-green-950 p-6 text-center">
        <p className="text-5xl">✓</p>
        <h1 className="text-2xl font-bold text-green-300">Lot validé</h1>
        {flow.data && <p className="text-gray-300">{flow.data.label}</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <h1 className="text-center text-lg font-semibold text-gray-300">Validation comptoir</h1>
      {flow.data && <PrizeStatusCard data={flow.data} />}
      {flow.data?.status === 'valid' && (
        <button
          type="button"
          onClick={() => flow.setPinOpen(true)}
          className="rounded-xl bg-green-600 py-4 text-center font-semibold text-white"
        >
          Valider ce lot — réservé au comptoir
        </button>
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
