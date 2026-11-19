'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  formatEuroCents,
  nonBillableReasonLabel,
  parisMonthOf,
  type Statement,
} from '@quiz-app/validation';
import { api } from '../../../lib/api';
import { PRICING_LABEL, downloadApiFile } from '../../../lib/campaigns-api';
import { getNavItem } from '../../../lib/nav-items';
import { PageHeader } from '../../components/page-header';

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

interface CinemaOption {
  id: string;
  slug: string;
  name: string;
}

/** Relevés (C3) : séances sponsorisées diffusées par cinéma et par mois, part du cinéma. */
export default function StatementsPage() {
  const [cinemaSlug, setCinemaSlug] = useState('');
  const [month, setMonth] = useState(() => parisMonthOf());
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { data: cinemas } = useQuery({
    queryKey: ['cinemas', 'options'],
    queryFn: () => api.get<{ items: CinemaOption[] }>('/api/cinemas?limit=100'),
  });

  useEffect(() => {
    if (!cinemaSlug && cinemas?.items[0]) setCinemaSlug(cinemas.items[0].slug);
  }, [cinemas, cinemaSlug]);

  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['statement', cinemaSlug, month],
    queryFn: () =>
      api.get<Statement>(`/api/cinemas/${encodeURIComponent(cinemaSlug)}/statement?month=${month}`),
    enabled: !!cinemaSlug && validMonth,
  });

  const download = async () => {
    setDownloadError(null);
    try {
      await downloadApiFile(
        `/api/cinemas/${encodeURIComponent(cinemaSlug)}/statement.csv?month=${month}`,
        `releve-${cinemaSlug}-${month}.csv`,
      );
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Téléchargement impossible.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={getNavItem('/statements')!.icon}
        title="Relevés"
        subtitle="Séances sponsorisées diffusées et part reversée au cinéma, par mois (heure de Paris)."
      />
      <div className="flex flex-wrap items-end justify-end gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            Cinéma
            <select
              className="mt-1 block rounded border px-3 py-2 text-sm"
              value={cinemaSlug}
              onChange={(e) => setCinemaSlug(e.target.value)}
            >
              {cinemas?.items.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Mois
            <input
              type="month"
              className="mt-1 block rounded border px-3 py-2 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!data}
            onClick={() => void download()}
            className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Télécharger le CSV
          </button>
        </div>
      </div>

      {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}
      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {isError && <p className="text-sm text-red-600">Relevé indisponible.</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Tile label="Part du cinéma" value={formatEuroCents(data.totals.cinemaShareCents)} />
            <Tile label="Facturé au sponsor" value={formatEuroCents(data.totals.amountCents)} />
            <Tile
              label="Séances facturables"
              value={`${data.totals.billableDeliveries} / ${data.totals.deliveries}`}
            />
            <Tile label="Participants" value={String(data.totals.participants)} />
          </div>

          {data.lines.length === 0 ? (
            <p className="rounded-lg border bg-white p-6 text-center text-sm text-gray-500">
              Aucune diffusion sponsorisée ce mois-ci.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Salle</th>
                    <th className="px-3 py-2">Séance</th>
                    <th className="px-3 py-2">Jeu / campagne</th>
                    <th className="px-3 py-2">Tarif</th>
                    <th className="px-3 py-2 text-right">Participants</th>
                    <th className="px-3 py-2 text-right">Entrées</th>
                    <th className="px-3 py-2">Statut</th>
                    <th className="px-3 py-2 text-right">Montant</th>
                    <th className="px-3 py-2 text-right">Part cinéma</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.deliveryId} className="border-b last:border-b-0">
                      <td className="px-3 py-2">{DATE_FORMAT.format(new Date(l.playedAt))}</td>
                      <td className="px-3 py-2">{l.screenName}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.sessionCode}</td>
                      <td className="px-3 py-2">
                        {l.gameTitle}
                        <span className="block text-xs text-gray-500">
                          {l.sponsorName} · {l.campaignName}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">{PRICING_LABEL[l.pricing]}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {l.participants}
                        <span className="block text-xs text-gray-500">
                          {l.finishers} jusqu’au bout
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{l.attendance ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {l.billable ? (
                          <span className="text-green-700">Facturable</span>
                        ) : (
                          <span className="text-gray-500">
                            {nonBillableReasonLabel(l.nonBillableReason)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatEuroCents(l.amountCents)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatEuroCents(l.cinemaShareCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={8}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatEuroCents(data.totals.amountCents)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatEuroCents(data.totals.cinemaShareCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
