'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Trophy } from '@phosphor-icons/react';
import { ANSWER_COLORS, type AnswerLetter } from '@quiz-app/design-tokens';
import { api } from '../../../../lib/api';
import { resolveMediaUrl } from '../../../../lib/media-url';

// ── Types (miroir de SessionReport côté API) ──────────────────────────────────

interface AnswerOption {
  answerId: string;
  position: AnswerLetter;
  text: string;
  isCorrect: boolean;
  count: number;
}

interface QuestionReport {
  id: string;
  position: number;
  text: string;
  imageUrl: string | null;
  eligible: number;
  respondents: number;
  participationRate: number | null;
  correctCount: number;
  correctRate: number | null;
  avgResponseTimeMs: number | null;
  options: AnswerOption[];
}

interface PodiumEntry {
  playerId: string;
  pseudo: string;
  avatarUrl: string | null;
  score: number;
  rank: number;
}

interface SessionReport {
  session: {
    id: string;
    slugShort: string;
    state: 'ended' | 'aborted';
    createdAt: string;
    startedAt: string | null;
    endedAt: string | null;
    quizTitle: string;
    quizSlug: string;
    cinemaName: string;
    cinemaSlug: string;
    screenName: string;
    sponsor: { name: string; logoUrl: string | null } | null;
  };
  players: { total: number; lobbyJoined: number; lateJoined: number; active: number };
  completionRate: number | null;
  avgResponseTimeMs: number | null;
  questions: QuestionReport[];
  retention: Array<{ position: number; respondents: number }>;
  synthesis: {
    easiestQuestion: { position: number; text: string; correctRate: number } | null;
    hardestQuestion: { position: number; text: string; correctRate: number } | null;
    avgResponseTimeMs: number | null;
  };
  podium: PodiumEntry[];
  prizes: {
    total: number;
    consolationCount: number;
    byType: Array<{ type: string; count: number }>;
    emailProvidedCount: number;
    emailSentCount: number;
    redeemedCount: number;
    emailOptInRate: number | null;
    redemptionRate: number | null;
  };
}

// ── Helpers de formatage ──────────────────────────────────────────────────────

function formatPct(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}\u00a0%`;
}

function formatSeconds(ms: number | null): string {
  if (ms === null) return '—';
  return `${(ms / 1000).toFixed(1)}\u00a0s`;
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const PRIZE_TYPE_LABELS: Record<string, string> = {
  discount_qr: 'Réduction (QR)',
  video: 'Vidéo',
  other: 'Autre',
};

// ── Sous-composants ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <p className="text-5xl font-bold tracking-tight text-gray-900">{value}</p>
      <p className="mt-3 text-sm font-medium text-gray-500">{label}</p>
      {sub ? <p className="mt-0.5 text-xs text-gray-400">{sub}</p> : null}
    </div>
  );
}

function RetentionChart({ data }: { data: Array<{ position: number; respondents: number }> }) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-400">Aucune donnée de participation.</p>;
  }

  const W = 800;
  const H = 220;
  const padX = 24;
  const padTop = 16;
  const padBottom = 32;
  const maxVal = Math.max(1, ...data.map((d) => d.respondents));
  const n = data.length;

  const xFor = (i: number) => (n === 1 ? W / 2 : padX + (i * (W - 2 * padX)) / (n - 1));
  const yFor = (v: number) => padTop + (1 - v / maxVal) * (H - padTop - padBottom);

  const linePoints = data.map((d, i) => `${xFor(i)},${yFor(d.respondents)}`).join(' ');
  const areaPoints = `${padX},${H - padBottom} ${linePoints} ${xFor(n - 1)},${H - padBottom}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Courbe de rétention"
    >
      <defs>
        <linearGradient id="retentionFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map((t) => (
        <line
          key={t}
          x1={padX}
          x2={W - padX}
          y1={yFor(maxVal * t)}
          y2={yFor(maxVal * t)}
          stroke="#f1f5f9"
          strokeWidth={1}
        />
      ))}

      <polygon points={areaPoints} fill="url(#retentionFill)" />
      <polyline
        points={linePoints}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />

      {data.map((d, i) => (
        <g key={d.position}>
          <circle cx={xFor(i)} cy={yFor(d.respondents)} r={4} fill="#3b82f6" />
          <text
            x={xFor(i)}
            y={yFor(d.respondents) - 12}
            textAnchor="middle"
            className="fill-gray-700"
            fontSize={13}
            fontWeight={600}
          >
            {d.respondents}
          </text>
          <text x={xFor(i)} y={H - 10} textAnchor="middle" className="fill-gray-400" fontSize={12}>
            Q{d.position}
          </text>
        </g>
      ))}
    </svg>
  );
}

function QuestionCard({ q }: { q: QuestionReport }) {
  const maxCount = Math.max(1, ...q.options.map((o) => o.count));
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600">
            {q.position}
          </span>
          <h3 className="text-lg font-semibold leading-snug text-gray-900">{q.text}</h3>
        </div>
        <div className="flex shrink-0 gap-6 text-right">
          <div>
            <p className="text-2xl font-bold text-emerald-600">{formatPct(q.correctRate)}</p>
            <p className="text-xs text-gray-400">bonnes réponses</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{formatSeconds(q.avgResponseTimeMs)}</p>
            <p className="text-xs text-gray-400">temps moyen</p>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-2.5">
        {q.options.map((o) => {
          const color = ANSWER_COLORS[o.position]?.bg ?? '#94a3b8';
          const widthPct = (o.count / maxCount) * 100;
          const sharePct = q.respondents > 0 ? Math.round((o.count / q.respondents) * 100) : 0;
          return (
            <div key={o.answerId} className="flex items-center gap-3">
              <span
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                style={{ backgroundColor: color }}
              >
                {o.position}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-sm ${o.isCorrect ? 'font-semibold text-gray-900' : 'text-gray-600'}`}
                  >
                    {o.text}
                    {o.isCorrect ? (
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700">
                        Bonne réponse
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-gray-400">
                    {o.count} · {sharePct}&nbsp;%
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: color,
                      opacity: o.isCorrect ? 1 : 0.45,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        {q.respondents} répondant{q.respondents > 1 ? 's' : ''} sur {q.eligible} présent
        {q.eligible > 1 ? 's' : ''} · participation {formatPct(q.participationRate)}
      </p>
    </div>
  );
}

function PodiumColumn({ entry, height }: { entry: PodiumEntry; height: string }) {
  const medal = entry.rank === 1 ? '#F1C40F' : entry.rank === 2 ? '#B8C2CC' : '#CD7F32';
  const avatar = resolveMediaUrl(entry.avatarUrl);
  const initials = entry.pseudo.slice(0, 2).toUpperCase();
  return (
    <div className="flex w-full flex-col items-center">
      <div className="relative">
        <div
          className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 bg-gray-100 sm:h-20 sm:w-20"
          style={{ borderColor: medal }}
        >
          {avatar ? (
            <img src={avatar} alt={entry.pseudo} className="h-full w-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-gray-500">{initials}</span>
          )}
        </div>
        <span
          className="absolute -bottom-1 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full text-xs font-bold text-white shadow"
          style={{ backgroundColor: medal }}
        >
          {entry.rank}
        </span>
      </div>
      <p className="mt-4 max-w-[9rem] truncate text-center text-sm font-semibold text-gray-900">
        {entry.pseudo}
      </p>
      <p className="text-xs font-medium text-gray-400">{entry.score.toLocaleString('fr-FR')} pts</p>
      <div
        className="mt-3 w-full rounded-t-xl bg-gradient-to-b from-gray-100 to-gray-50"
        style={{ height }}
      />
    </div>
  );
}

function Podium({ podium }: { podium: PodiumEntry[] }) {
  if (podium.length === 0) {
    return <p className="text-sm text-gray-400">Aucun joueur classé.</p>;
  }
  const byRank = (r: number) => podium.find((p) => p.rank === r);
  const first = byRank(1) ?? podium[0];
  const second = byRank(2) ?? podium[1];
  const third = byRank(3) ?? podium[2];

  return (
    <div className="mx-auto flex max-w-lg items-end justify-center gap-4">
      <div className="flex-1">
        {second ? <PodiumColumn entry={second} height="4.5rem" /> : null}
      </div>
      <div className="flex-1">{first ? <PodiumColumn entry={first} height="7rem" /> : null}</div>
      <div className="flex-1">{third ? <PodiumColumn entry={third} height="3rem" /> : null}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">{children}</h2>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportDetailPage() {
  const params = useParams();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['session-report', sessionId],
    queryFn: () => api.get<SessionReport>(`/api/sessions/${sessionId}/report`),
    enabled: !!sessionId,
  });

  if (isLoading) {
    return <p className="text-gray-400">Chargement du rapport...</p>;
  }
  if (isError || !data) {
    return (
      <div>
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >
          <ArrowLeft size={14} /> Retour aux rapports
        </Link>
        <p className="mt-6 text-sm text-red-600">Rapport indisponible pour cette session.</p>
      </div>
    );
  }

  const { session, players, prizes } = data;
  const sponsorLogo = resolveMediaUrl(session.sponsor?.logoUrl);

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <Link
        href="/reports"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
      >
        <ArrowLeft size={14} /> Rapports
      </Link>

      {/* Bandeau d'en-tête */}
      <header className="mt-4 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-6 bg-gradient-to-br from-gray-900 to-gray-700 p-8">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  session.state === 'ended'
                    ? 'bg-emerald-400/20 text-emerald-100'
                    : 'bg-amber-400/20 text-amber-100'
                }`}
              >
                {session.state === 'ended' ? 'Session terminée' : 'Session interrompue'}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {session.quizTitle}
            </h1>
            <p className="mt-2 text-sm text-gray-300">
              {session.cinemaName} · {session.screenName}
            </p>
            <p className="text-sm capitalize text-gray-400">
              {formatDateTime(session.endedAt ?? session.startedAt ?? session.createdAt)}
            </p>
          </div>
          {session.sponsor ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/10 px-5 py-4 backdrop-blur">
              <span className="text-[10px] uppercase tracking-widest text-gray-300">Sponsor</span>
              {sponsorLogo ? (
                <img
                  src={sponsorLogo}
                  alt={session.sponsor.name}
                  className="max-h-12 max-w-[10rem] object-contain"
                />
              ) : (
                <span className="text-lg font-semibold text-white">{session.sponsor.name}</span>
              )}
            </div>
          ) : null}
        </div>
      </header>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Joueurs"
          value={String(players.total)}
          sub={`${players.active} actifs · ${players.lateJoined} en retard`}
        />
        <StatCard
          label="Taux de complétion"
          value={formatPct(data.completionRate)}
          sub="ont répondu jusqu'au bout"
        />
        <StatCard
          label="Temps de réponse moyen"
          value={formatSeconds(data.avgResponseTimeMs)}
          sub="toutes questions"
        />
        <StatCard
          label="Lots émis"
          value={String(prizes.total)}
          sub={`dont ${prizes.consolationCount} consolation`}
        />
      </div>

      {/* Synthèse difficulté */}
      {data.synthesis.easiestQuestion || data.synthesis.hardestQuestion ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.synthesis.easiestQuestion ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Question la plus facile
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-gray-700">
                Q{data.synthesis.easiestQuestion.position} — {data.synthesis.easiestQuestion.text}
              </p>
              <p className="mt-1 text-sm font-bold text-emerald-700">
                {formatPct(data.synthesis.easiestQuestion.correctRate)} de bonnes réponses
              </p>
            </div>
          ) : null}
          {data.synthesis.hardestQuestion ? (
            <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                Question la plus difficile
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-gray-700">
                Q{data.synthesis.hardestQuestion.position} — {data.synthesis.hardestQuestion.text}
              </p>
              <p className="mt-1 text-sm font-bold text-rose-700">
                {formatPct(data.synthesis.hardestQuestion.correctRate)} de bonnes réponses
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Rétention */}
      <section className="mt-10">
        <SectionTitle>Rétention de l&apos;audience</SectionTitle>
        <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <p className="mb-4 text-sm text-gray-500">
            Nombre de répondants par question — pour voir où l&apos;audience décroche.
          </p>
          <RetentionChart data={data.retention} />
        </div>
      </section>

      {/* Détail par question */}
      <section className="mt-10">
        <SectionTitle>Détail par question</SectionTitle>
        <div className="mt-3 space-y-4">
          {data.questions.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
          {data.questions.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune question jouée.</p>
          ) : null}
        </div>
      </section>

      {/* Podium */}
      <section className="mt-10">
        <SectionTitle>Podium</SectionTitle>
        <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center justify-center gap-2 text-gray-400">
            <Trophy size={18} weight="fill" className="text-yellow-500" />
            <span className="text-sm font-medium">Top 3 des joueurs</span>
          </div>
          <Podium podium={data.podium} />
        </div>
      </section>

      {/* Lots */}
      <section className="mt-10">
        <SectionTitle>Lots</SectionTitle>
        <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          {prizes.total === 0 ? (
            <p className="text-sm text-gray-400">Aucun lot émis pour cette session.</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Répartition par type
                </p>
                <ul className="mt-2 space-y-1.5">
                  {prizes.byType.map((t) => (
                    <li key={t.type} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{PRIZE_TYPE_LABELS[t.type] ?? t.type}</span>
                      <span className="font-semibold text-gray-900">{t.count}</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between border-t border-gray-100 pt-1.5 text-sm">
                    <span className="text-gray-600">dont consolation</span>
                    <span className="font-semibold text-gray-900">{prizes.consolationCount}</span>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Opt-in email
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {formatPct(prizes.emailOptInRate)}
                </p>
                <p className="text-xs text-gray-400">
                  {prizes.emailProvidedCount} sur {prizes.total} lots
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Taux de redemption
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {formatPct(prizes.redemptionRate)}
                </p>
                <p className="text-xs text-gray-400">
                  {prizes.redeemedCount} utilisés · {prizes.emailSentCount} envoyés
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
