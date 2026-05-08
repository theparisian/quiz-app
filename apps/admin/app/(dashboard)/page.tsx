'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface DashboardStats {
  cinemas: number;
  nucsOnline: number;
  nucsOffline: number;
  invitationsPending: number;
}

async function fetchStats(): Promise<DashboardStats> {
  const [cinemas, invitations] = await Promise.all([
    api.get<{ total: number }>('/api/cinemas?limit=1'),
    api.get<{ total: number }>('/api/invitations?status=pending&limit=1'),
  ]);

  return {
    cinemas: cinemas.total,
    nucsOnline: 0,
    nucsOffline: 0,
    invitationsPending: invitations.total,
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
        </div>
      ) : null}
    </div>
  );
}
