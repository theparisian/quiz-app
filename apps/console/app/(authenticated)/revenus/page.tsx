'use client';

import { useQuery } from '@tanstack/react-query';
import {
  formatEuroCents,
  nonBillableReasonLabel,
  parisMonthOf,
  type Statement,
} from '@quiz-app/validation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

const MONTH_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});
const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/** Revenus (C3) : relevé du mois en cours du cinéma (séances sponsorisées diffusées). */
export default function RevenusPage() {
  const { user } = useAuth();
  const cinemaSlug = user?.cinemaSlug ?? null;
  const canRead = user?.role === 'cinema_admin' || user?.role === 'super_admin';
  const month = parisMonthOf();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['statement', cinemaSlug, month],
    queryFn: () =>
      api.get<Statement>(
        `/api/cinemas/${encodeURIComponent(cinemaSlug!)}/statement?month=${month}`,
      ),
    enabled: !!cinemaSlug && canRead,
  });

  const monthLabel = MONTH_FORMAT.format(new Date(`${month}-15T12:00:00Z`));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Revenus</h1>
        <p className="mt-1 text-sm text-gray-500">
          Séances sponsorisées diffusées en {monthLabel} et votre part.
        </p>
      </div>

      {!canRead && (
        <p className="text-sm text-gray-600">
          Les revenus sont réservés aux administrateurs du cinéma.
        </p>
      )}
      {canRead && isLoading && <p className="text-sm text-gray-400">Chargement…</p>}
      {canRead && isError && (
        <p className="text-sm text-red-600">Le relevé n&apos;est pas disponible pour le moment.</p>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs uppercase text-gray-500">Votre part ce mois-ci</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">
                {formatEuroCents(data.totals.cinemaShareCents)}
              </p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs uppercase text-gray-500">Séances facturables</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {data.totals.billableDeliveries}
                <span className="text-sm font-normal text-gray-500">
                  {' '}
                  / {data.totals.deliveries}
                </span>
              </p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs uppercase text-gray-500">Participants</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{data.totals.participants}</p>
            </div>
          </div>

          {data.lines.length === 0 ? (
            <p className="rounded-lg border bg-white p-6 text-center text-sm text-gray-500">
              Aucune séance sponsorisée diffusée ce mois-ci.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Salle</th>
                    <th className="px-3 py-2">Jeu</th>
                    <th className="px-3 py-2 text-right">Participants</th>
                    <th className="px-3 py-2 text-right">Entrées</th>
                    <th className="px-3 py-2">Statut</th>
                    <th className="px-3 py-2 text-right">Votre part</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.deliveryId} className="border-b last:border-b-0">
                      <td className="px-3 py-2 text-gray-700">
                        {DATE_FORMAT.format(new Date(l.playedAt))}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{l.screenName}</td>
                      <td className="px-3 py-2 text-gray-900">
                        {l.gameTitle}
                        <span className="block text-xs text-gray-500">{l.sponsorName}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{l.participants}</td>
                      <td className="px-3 py-2 text-right font-mono">{l.attendance ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {l.billable ? (
                          <span className="text-emerald-700">Facturable</span>
                        ) : (
                          <span className="text-gray-500">
                            {nonBillableReasonLabel(l.nonBillableReason)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatEuroCents(l.cinemaShareCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
