'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { ContactsStatsResponse } from '@quiz-app/validation';
import { api } from '../../../lib/api';
import { getNavItem } from '../../../lib/nav-items';
import { PageHeader } from '../../components/page-header';
import { ContactsExportButton } from '../../components/contacts-export-button';

/**
 * Contacts (C5) : consentements email actifs par périmètre. Un contact désinscrit ne compte
 * plus et ne sort dans aucun export. Les exports d'un cinéma ou d'un sponsor exigent l'accord.
 */
export default function ContactsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['contacts', 'stats'],
    queryFn: () => api.get<ContactsStatsResponse>('/api/contacts/stats'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={getNavItem('/contacts')!.icon}
        title="Contacts"
        subtitle="Emails des joueurs ayant coché une case de consentement, par périmètre."
      />

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {isError && <p className="text-sm text-red-600">Compteurs indisponibles.</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Tile label="Contacts" value={data.contacts} />
            <Tile label="Désinscrits (exclus des exports)" value={data.unsubscribed} />
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">Actus et jeux de Shh!</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{data.platform}</p>
              <div className="mt-2">
                <ContactsExportButton target={{ scope: 'platform' }} />
              </div>
            </div>
          </div>

          <ScopeTable
            title="Cinémas"
            rows={data.cinemas.map((c) => ({
              ...c,
              href: `/cinemas/${c.slug}`,
              target: { scope: 'cinema' as const, cinemaSlug: c.slug },
            }))}
          />
          <ScopeTable
            title="Sponsors"
            rows={data.sponsors.map((s) => ({
              ...s,
              href: `/sponsors/${s.slug}`,
              target: { scope: 'sponsor' as const, sponsorSlug: s.slug },
            }))}
          />
        </>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function ScopeTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    slug: string;
    name: string;
    emailSharingEnabled: boolean;
    count: number;
    href: string;
    target: { scope: 'cinema'; cinemaSlug: string } | { scope: 'sponsor'; sponsorSlug: string };
  }>;
}) {
  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">Aucun.</p>
      ) : (
        <table className="mt-2 w-full text-left text-sm">
          <thead className="border-b text-xs text-gray-500">
            <tr>
              <th className="py-1 pr-3">Nom</th>
              <th className="py-1 pr-3">Accord</th>
              <th className="py-1 pr-3 text-right">Consentements</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} className="border-b last:border-b-0">
                <td className="py-2 pr-3">
                  <Link href={r.href} className="text-blue-700 hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="py-2 pr-3">{r.emailSharingEnabled ? 'Oui' : 'Non'}</td>
                <td className="py-2 pr-3 text-right font-mono">{r.count}</td>
                <td className="py-2 text-right">
                  <ContactsExportButton target={r.target} disabled={!r.emailSharingEnabled} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
