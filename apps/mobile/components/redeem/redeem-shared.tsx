'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

const PIN_STORAGE_KEY = 'quiz_staff_pin';

export type PrizeStatus = 'valid' | 'redeemed' | 'expired';

export interface PrizeStatusData {
  label: string;
  type: string;
  cinemaName: string;
  status: PrizeStatus;
  redeemedAt?: string | null;
  expiresAt?: string | null;
  shortCode: string;
  redeemCode?: string;
  sig?: string;
}

export function getStoredStaffPin(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(PIN_STORAGE_KEY) ?? '';
}

export function storeStaffPin(pin: string) {
  sessionStorage.setItem(PIN_STORAGE_KEY, pin);
}

export function clearStoredStaffPin() {
  sessionStorage.removeItem(PIN_STORAGE_KEY);
}

export function formatPrizeDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PrizeStatusCard({ data }: { data: PrizeStatusData }) {
  const statusStyles =
    data.status === 'valid'
      ? 'border-green-500/40 bg-green-950/40'
      : data.status === 'redeemed'
        ? 'border-orange-500/40 bg-orange-950/40'
        : 'border-gray-500/40 bg-gray-900/60';

  return (
    <div className={`rounded-2xl border-2 p-6 ${statusStyles}`}>
      <p className="text-sm text-gray-400">{data.cinemaName}</p>
      <h1 className="mt-2 text-2xl font-bold leading-tight">{data.label}</h1>
      <p className="mt-3 font-mono text-lg tracking-widest text-gray-300">{data.shortCode}</p>
      {data.status === 'valid' && data.expiresAt && (
        <p className="mt-3 text-sm text-green-300/80">
          Valable jusqu&apos;au {formatPrizeDate(data.expiresAt)}
        </p>
      )}
      {data.status === 'redeemed' && data.redeemedAt && (
        <p className="mt-3 text-sm text-orange-300">
          Utilisé le {formatPrizeDate(data.redeemedAt)}
        </p>
      )}
      {data.status === 'expired' && data.expiresAt && (
        <p className="mt-3 text-sm text-gray-400">Expiré le {formatPrizeDate(data.expiresAt)}</p>
      )}
      {data.status === 'valid' && (
        <p className="mt-4 text-center text-sm font-semibold text-green-400">✓ Lot valide</p>
      )}
    </div>
  );
}

export function PinModal({
  open,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [pin, setPin] = useState(getStoredStaffPin());

  useEffect(() => {
    if (open) setPin(getStoredStaffPin());
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-gray-900 p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Code PIN comptoir</h2>
        <p className="mt-1 text-sm text-gray-400">Réservé au staff du cinéma</p>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className="mt-4 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-4 text-center text-2xl tracking-widest"
          style={{ fontSize: '16px' }}
          autoFocus
        />
        {error && <p className="mt-2 text-center text-sm text-red-400">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/20 py-3 text-sm"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={pin.length < 4 || loading}
            onClick={() => onSubmit(pin)}
            className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-semibold disabled:opacity-40"
          >
            {loading ? '…' : 'Valider'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useRedeemFlow(opts: {
  redeemCode?: string | undefined;
  sig?: string | undefined;
  redeemedVia: 'qr' | 'code';
}) {
  const [data, setData] = useState<PrizeStatusData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!opts.redeemCode || !opts.sig) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get<PrizeStatusData>(
        `/api/prizes/redeem/${encodeURIComponent(opts.redeemCode)}?sig=${encodeURIComponent(opts.sig)}`,
      );
      setData(res);
    } catch {
      setLoadError("Ce lot n'est pas reconnu.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [opts.redeemCode, opts.sig]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function confirmRedeem(pin: string) {
    if (!opts.redeemCode || !opts.sig) return;
    setValidating(true);
    setPinError(null);
    try {
      await api.post(`/api/prizes/redeem/${encodeURIComponent(opts.redeemCode)}`, {
        sig: opts.sig,
        staffPin: pin,
        redeemedVia: opts.redeemedVia,
      });
      storeStaffPin(pin);
      setValidated(true);
      setPinOpen(false);
      await loadStatus();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'INVALID_PIN') {
        clearStoredStaffPin();
        setPinError('PIN incorrect.');
      } else if (e.code === 'PIN_NOT_CONFIGURED') {
        setPinError("PIN comptoir non configuré. Contactez l'administration.");
      } else if (e.code === 'RATE_LIMIT_EXCEEDED') {
        setPinError('Trop de tentatives. Réessayez dans une minute.');
      } else {
        setPinError(e.message ?? 'Erreur réseau. Réessayez.');
      }
    } finally {
      setValidating(false);
    }
  }

  return {
    data,
    loadError,
    loading,
    pinOpen,
    setPinOpen,
    pinError,
    validating,
    validated,
    confirmRedeem,
    reload: loadStatus,
  };
}
