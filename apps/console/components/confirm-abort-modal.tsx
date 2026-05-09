'use client';

import { useState } from 'react';

interface ConfirmAbortModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  loading?: boolean;
}

export function ConfirmAbortModal({ open, onClose, onConfirm, loading }: ConfirmAbortModalProps) {
  const [reason, setReason] = useState('');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900">Abandonner la session ?</h2>
        <p className="mt-2 text-sm text-gray-600">
          Cette action est irréversible. Tous les joueurs seront déconnectés.
        </p>

        <div className="mt-4">
          <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
            Raison (optionnel)
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Problème technique, fausse manipulation..."
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason || undefined)}
            disabled={loading}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Abandon...' : "Confirmer l'abandon"}
          </button>
        </div>
      </div>
    </div>
  );
}
