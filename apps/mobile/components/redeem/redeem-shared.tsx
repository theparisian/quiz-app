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
  /** C5 : lot à code, à présenter chez le partenaire (pas de validation par PIN). */
  redeemMode?: 'staff_pin' | 'code_pool' | 'static_code';
  partnerCode?: string | null;
  partnerQrDataUrl?: string | null;
  redeemInstructions?: string | null;
  redeemUrl?: string | null;
}

/** Lot validé au comptoir par le PIN du cinéma (tous les lots antérieurs à C5). */
export function isStaffRedeemable(data: PrizeStatusData): boolean {
  return (data.redeemMode ?? 'staff_pin') === 'staff_pin';
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

/** Lot à code (C5) : code du partenaire en gros, son QR, les instructions et le lien. */
function PartnerCodeCard({ data }: { data: PrizeStatusData }) {
  const expired = data.status === 'expired';
  return (
    <div className="rounded-2xl border-2 border-blue-500/40 bg-blue-950/30 p-6 text-center">
      <p className="text-sm text-gray-400">{data.cinemaName}</p>
      <h1 className="mt-2 text-2xl font-bold leading-tight">{data.label}</h1>
      {data.partnerCode && (
        <>
          <p className="mt-5 text-sm text-gray-400">Ton code</p>
          <p className="mt-1 break-all font-mono text-3xl font-black tracking-wider text-white">
            {data.partnerCode}
          </p>
          {data.partnerQrDataUrl && (
            <img
              src={data.partnerQrDataUrl}
              alt="QR code du code"
              className="mx-auto mt-5 w-56 max-w-full rounded-lg bg-white"
            />
          )}
        </>
      )}
      {data.redeemInstructions && (
        <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-gray-300">
          {data.redeemInstructions}
        </p>
      )}
      {data.redeemUrl && !expired && (
        <a
          href={data.redeemUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white"
        >
          Utiliser mon code
        </a>
      )}
      {data.expiresAt && (
        <p className={`mt-4 text-sm ${expired ? 'text-gray-400' : 'text-blue-200/80'}`}>
          {expired ? 'Expiré le' : 'Valable jusqu’au'} {formatPrizeDate(data.expiresAt)}
        </p>
      )}
    </div>
  );
}

export function PrizeStatusCard({ data }: { data: PrizeStatusData }) {
  if (!isStaffRedeemable(data)) return <PartnerCodeCard data={data} />;

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
      } else if (e.code === 'NOT_STAFF_REDEEMABLE') {
        setPinError('Ce lot se présente chez le partenaire, sans validation au comptoir.');
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
