'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { formatEuroCents, type SponsorPortalCampaignList } from '@quiz-app/validation';
import { api } from '@/lib/api';

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeZone: 'Europe/Paris',
});

const STATUS_LABEL: Record<string, string> = {
  active: 'En cours',
  paused: 'En pause',
  ended: 'Terminée',
  draft: 'Brouillon',
};

/** Portail sponsor (C4) : liste des campagnes avec leurs totaux. */
export default function SponsorCampaignsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sponsor-portal', 'campaigns'],
    queryFn: () => api.get<SponsorPortalCampaignList>('/api/sponsor-portal/campaigns'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vos campagnes</h1>
        <p className="mt-1 text-sm text-gray-500">
          Résultats agrégés de vos jeux diffusés en salle. Aucune donnée individuelle de joueur
          n&apos;est communiquée.
        </p>
      </div>

      {isLoading && <p className="text-sm text-gray-400">Chargement…</p>}
      {isError && (
        <p className="text-sm text-red-600">
          Les campagnes ne sont pas disponibles pour le moment.
        </p>
      )}
      {data && data.items.length === 0 && (
        <p className="rounded-lg border bg-white p-6 text-center text-sm text-gray-500">
          Aucune campagne pour le moment.
        </p>
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Campagne</th>
                <th className="px-4 py-2">Période</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2 text-right">Séances</th>
                <th className="px-4 py-2 text-right">Participants</th>
                <th className="px-4 py-2 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/sponsor/campaigns/${c.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {c.name}
                    </Link>
                    <span className="block text-xs text-gray-500">{c.game.title}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {DATE_FORMAT.format(new Date(c.startsAt))} –{' '}
                    {DATE_FORMAT.format(new Date(c.endsAt))}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{STATUS_LABEL[c.status] ?? c.status}</td>
                  <td className="px-4 py-3 text-right font-mono">{c.totals.sessionsPlayed}</td>
                  <td className="px-4 py-3 text-right font-mono">{c.totals.participants}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatEuroCents(c.totals.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
