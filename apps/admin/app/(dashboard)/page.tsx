'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  type Icon,
  ArrowRight,
  CalendarBlank,
  Desktop,
  EnvelopeSimple,
  FilmSlate,
  PlayCircle,
  Sparkle,
  WarningCircle,
} from '@phosphor-icons/react';
import { api } from '../../lib/api';

interface DashboardStats {
  cinemas: number;
  invitationsPending: number;
}

interface AiStats {
  month: { generations: number; costEur: number };
}

interface DashboardHealth {
  nucs: { online: number; offline: number; error: number; total: number };
  sessions: { running: number; paused: number; lobby: number };
  abortedToday: number;
  offlineNucs: Array<{
    nucId: string;
    cinemaName: string;
    screenName: string;
    offlineSince: string;
  }>;
}

interface DashboardToday {
  sessionsCount: number;
  playersCount: number;
  prizesSentCount: number;
}

interface DashboardErrorRow {
  id: string;
  level: string;
  eventType: string;
  payload: unknown;
  createdAt: string;
  cinemaId?: string | null;
  sessionId?: string | null;
  nucId?: string | null;
}

interface DashboardRecentErrors {
  errors: DashboardErrorRow[];
}

interface TodaySessionRow {
  id: string;
  cinemaName: string;
  screenName: string;
  quizTitle: string;
  totalPlayers: number;
  state: string;
  createdAt: string;
  winnerPseudo?: string | null;
}

interface DashboardRecentSessions {
  sessions: TodaySessionRow[];
}

function StatCard({
  label,
  value,
  sub,
  color,
  icon: CardIcon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: Icon;
}) {
  const vColor = color ?? 'text-gray-900';
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500">
        {CardIcon ? <CardIcon size={18} className="shrink-0" /> : null}
        <p className="text-sm font-medium">{label}</p>
      </div>
      <p className={`mt-1 text-3xl font-bold ${vColor}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
}

function formatOfflineSince(iso: string): string {
  try {
    const ms = Math.max(0, Date.now() - new Date(iso).getTime());
    const m = Math.floor(ms / 60_000);
    if (m < 1) return "À l'instant";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h} h`;
    const d = Math.floor(h / 24);
    return `${d} j`;
  } catch {
    return '?';
  }
}

function formatShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function sessionStateLabel(s: string): string {
  const map: Record<string, string> = {
    lobby: 'Lobby',
    running: 'En cours',
    paused: 'Pause',
    ended: 'Terminée',
    aborted: 'Abandon',
  };
  return map[s] ?? s;
}

function payloadSnippet(payload: unknown): string {
  if (payload === null || payload === undefined) return '';
  try {
    const s = JSON.stringify(payload);
    return s.length > 240 ? `${s.slice(0, 240)}…` : s;
  } catch {
    return '';
  }
}

async function fetchLegacyStats(): Promise<DashboardStats & { ai?: AiStats }> {
  const [cinemas, invitations, aiRes] = await Promise.all([
    api.get<{ total: number }>('/api/cinemas?limit=1'),
    api.get<{ total: number }>('/api/invitations?status=pending&limit=1'),
    api
      .get<{ month: { generations: number; costEur: number } }>('/api/ai/usage/stats')
      .catch(() => null),
  ]);

  return {
    cinemas: cinemas.total,
    invitationsPending: invitations.total,
    ...(aiRes
      ? { ai: { month: { generations: aiRes.month.generations, costEur: aiRes.month.costEur } } }
      : {}),
  };
}

async function fetchObservability(): Promise<{
  health: DashboardHealth;
  today: DashboardToday;
  recentErrors: DashboardRecentErrors;
  recentSessions: DashboardRecentSessions;
}> {
  const [health, today, recentErrors, recentSessions] = await Promise.all([
    api.get<DashboardHealth>('/api/dashboard/health'),
    api.get<DashboardToday>('/api/dashboard/today'),
    api.get<DashboardRecentErrors>('/api/dashboard/recent-errors'),
    api.get<DashboardRecentSessions>('/api/dashboard/recent-sessions'),
  ]);
  return { health, today, recentErrors, recentSessions };
}

export default function DashboardPage() {
  const { data: legacy, isLoading: loadingLegacy } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchLegacyStats,
    refetchInterval: 30_000,
  });

  const {
    data: obs,
    isLoading: loadingObs,
    isError,
  } = useQuery({
    queryKey: ['dashboard-observability'],
    queryFn: fetchObservability,
    refetchInterval: 30_000,
    retry: 1,
  });

  const hasCritical = obs?.recentErrors.errors?.some((e) => e.level === 'critical') ?? false;
  const hasErrorLevel = obs?.recentErrors.errors?.some((e) => e.level === 'error') ?? false;
  const nucConcern = (obs?.health.nucs.offline ?? 0) > 0 || (obs?.health.nucs.error ?? 0) > 0;

  let badge: { label: string; className: string };
  if (isError || !obs) {
    badge = { label: 'Données indisponibles', className: 'bg-gray-100 text-gray-700' };
  } else if (hasCritical) {
    badge = { label: 'Alerte critique', className: 'bg-red-100 text-red-800' };
  } else if (hasErrorLevel || nucConcern) {
    badge = {
      label: 'Attention exploitation',
      className: 'bg-amber-100 text-amber-900',
    };
  } else {
    badge = { label: 'OK', className: 'bg-emerald-100 text-emerald-800' };
  }

  const loading = loadingLegacy || loadingObs;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Vue d&apos;ensemble de la plateforme</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}
          title="Basé sur NUC hors ligne et journaux erreur / critique (7 derniers jours)"
        >
          {badge.label}
        </span>
      </div>

      {loading && !legacy && !obs ? (
        <p className="mt-6 text-gray-400">Chargement...</p>
      ) : (
        <>
          {obs ? (
            <div className="mt-8 space-y-8">
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
                  Exploitation live
                </h2>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <StatCard
                    label="Santé NUCs — en ligne"
                    value={obs.health.nucs.online}
                    sub={`${obs.health.nucs.offline} hors ligne • ${obs.health.nucs.error} erreur`}
                    icon={Desktop}
                    color={
                      obs.health.nucs.offline === 0 && obs.health.nucs.error === 0
                        ? 'text-green-600'
                        : 'text-amber-600'
                    }
                  />
                  <StatCard
                    label="Sessions actives — en cours"
                    value={obs.health.sessions.running}
                    sub={`${obs.health.sessions.paused} en pause • ${obs.health.sessions.lobby} lobby • abandons jour : ${obs.health.abortedToday}`}
                    icon={PlayCircle}
                    color={
                      obs.health.sessions.running + obs.health.sessions.paused === 0
                        ? 'text-gray-900'
                        : 'text-green-700'
                    }
                  />
                  <StatCard
                    label="Aujourd’hui — sessions"
                    value={obs.today.sessionsCount}
                    sub={`${obs.today.playersCount} joueurs • ${obs.today.prizesSentCount} lots envoyés`}
                    icon={CalendarBlank}
                  />
                </div>
              </section>

              <section className="rounded-lg border bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <Desktop size={16} className="text-gray-400" />
                  NUCs hors ligne
                </h2>
                {obs.health.offlineNucs.length === 0 ? (
                  <p className="mt-3 text-sm text-green-700">Tous les NUCs sont en ligne.</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {obs.health.offlineNucs.map((n) => (
                      <li
                        key={n.nucId}
                        className="flex flex-wrap justify-between gap-2 border-b border-gray-100 py-2 last:border-0"
                      >
                        <span>
                          {n.cinemaName} / {n.screenName}
                        </span>
                        <span className="text-amber-800">
                          Offline depuis ~{formatOfflineSince(n.offlineSince)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <WarningCircle size={16} className="text-gray-400" />
                  Erreurs récentes (7 derniers jours)
                </h2>
                {obs.recentErrors.errors.length === 0 ? (
                  <p className="mt-3 text-sm text-green-700">Aucune erreur récente.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-gray-100">
                    {obs.recentErrors.errors.slice(0, 12).map((e) => (
                      <li key={e.id} className="py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={
                              e.level === 'critical'
                                ? 'rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white'
                                : 'rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-900'
                            }
                          >
                            {e.level}
                          </span>
                          <span className="text-gray-600">{formatShortDate(e.createdAt)}</span>
                          <span className="font-mono font-medium">{e.eventType}</span>
                        </div>
                        {payloadSnippet(e.payload) ? (
                          <pre className="mt-2 max-h-28 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-700">
                            {payloadSnippet(e.payload)}
                          </pre>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-800">
                  Sessions créées (jour Paris)
                </h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase text-gray-500">
                        <th className="py-2 pr-4">Début</th>
                        <th className="py-2 pr-4">Cinéma</th>
                        <th className="py-2 pr-4">Salle</th>
                        <th className="py-2 pr-4">Quiz</th>
                        <th className="py-2 pr-4">Joueurs</th>
                        <th className="py-2">État</th>
                      </tr>
                    </thead>
                    <tbody>
                      {obs.recentSessions.sessions.map((row) => (
                        <tr key={row.id} className="border-b border-gray-50">
                          <td className="whitespace-nowrap py-2 pr-4">
                            {formatShortDate(row.createdAt)}
                          </td>
                          <td className="py-2 pr-4">{row.cinemaName}</td>
                          <td className="py-2 pr-4">{row.screenName}</td>
                          <td className="py-2 pr-4">{row.quizTitle}</td>
                          <td className="py-2 pr-4">{row.totalPlayers}</td>
                          <td className="py-2">
                            <span title={row.winnerPseudo ? `Gagnant : ${row.winnerPseudo}` : ''}>
                              {sessionStateLabel(row.state)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {obs.recentSessions.sessions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-gray-500">
                            Aucune session créée aujourd&apos;hui.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}

          {legacy ? (
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Cinémas" value={legacy.cinemas} icon={FilmSlate} />
              <StatCard
                label="Invitations en attente"
                value={legacy.invitationsPending}
                color="text-blue-600"
                icon={EnvelopeSimple}
              />
              <div className="rounded-lg border bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-2">
                <div className="flex items-center gap-2 text-gray-500">
                  <Sparkle size={18} className="shrink-0" />
                  <p className="text-sm font-medium">IA</p>
                </div>
                <p className="mt-1 text-3xl font-bold text-violet-700">
                  {legacy.ai?.month.generations ?? 0} générations ce mois
                </p>
                <p className="mt-1 text-lg text-gray-700">
                  ≈ {(legacy.ai?.month.costEur ?? 0).toFixed(2)} €
                </p>
                <Link
                  href="/ai/usage"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-violet-600 hover:underline"
                >
                  Voir l&apos;historique
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
