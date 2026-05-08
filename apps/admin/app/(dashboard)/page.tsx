'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface DashboardStats {
  cinemas: number;
  nucsOnline: number;
  nucsOffline: number;
  invitationsPending: number;
}

interface AiStats {
  month: { generations: number; costEur: number };
}

async function fetchStats(): Promise<DashboardStats & { ai?: AiStats }> {
  const [cinemas, invitations, aiRes] = await Promise.all([
    api.get<{ total: number }>('/api/cinemas?limit=1'),
    api.get<{ total: number }>('/api/invitations?status=pending&limit=1'),
    api
      .get<{ month: { generations: number; costEur: number } }>('/api/ai/usage/stats')
      .catch(() => null),
  ]);

  return {
    cinemas: cinemas.total,
    nucsOnline: 0,
    nucsOffline: 0,
    invitationsPending: invitations.total,
    ...(aiRes
      ? { ai: { month: { generations: aiRes.month.generations, costEur: aiRes.month.costEur } } }
      : {}),
  };
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard-stats'], queryFn: fetchStats });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">Vue d&apos;ensemble de la plateforme</p>

      {isLoading ? (
        <p className="mt-6 text-gray-400">Chargement...</p>
      ) : data ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Cinémas" value={data.cinemas} color="text-gray-900" />
          <StatCard label="NUCs en ligne" value={data.nucsOnline} color="text-green-600" />
          <StatCard label="NUCs hors ligne" value={data.nucsOffline} color="text-red-600" />
          <StatCard
            label="Invitations en attente"
            value={data.invitationsPending}
            color="text-blue-600"
          />
          <div className="rounded-lg border bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-2">
            <p className="text-sm font-medium text-gray-500">IA</p>
            <p className="mt-1 text-3xl font-bold text-violet-700">
              {data.ai?.month.generations ?? 0} générations ce mois
            </p>
            <p className="mt-1 text-lg text-gray-700">
              ≈ {(data.ai?.month.costEur ?? 0).toFixed(2)} €
            </p>
            <Link
              href="/ai/usage"
              className="mt-3 inline-block text-sm font-medium text-violet-600 hover:underline"
            >
              Voir l&apos;historique →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
