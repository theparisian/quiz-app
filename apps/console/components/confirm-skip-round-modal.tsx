'use client';

interface ConfirmSkipRoundModalProps {
  open: boolean;
  /** Entracte : la manche suivante est lancée tout de suite (aucune manche n'est interrompue). */
  duringInterlude: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

/** Confirmation de « Passer à la manche suivante » (`skip-round`). */
export function ConfirmSkipRoundModal({
  open,
  duringInterlude,
  onClose,
  onConfirm,
  loading,
}: ConfirmSkipRoundModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900">Passer à la manche suivante ?</h2>
        <p className="mt-2 text-sm text-gray-600">
          {duringInterlude
            ? 'La manche suivante va démarrer immédiatement.'
            : 'La manche en cours sera interrompue. Les points déjà marqués sont conservés, puis la manche suivante démarre après le classement intermédiaire.'}
        </p>

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
            onClick={onConfirm}
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Passage...' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
