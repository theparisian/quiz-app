'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  formatEuroCents,
  formatRatePercent,
  type SponsorCampaignStats,
} from '@quiz-app/validation';
import { api, downloadApiFile } from '@/lib/api';
import { chartGeometry, periodQuery, type DayPoint } from '@/lib/sponsor-portal';

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeZone: 'Europe/Paris',
});
const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function dayLabel(day: string): string {
  return DAY_FORMAT.format(new Date(`${day}T12:00:00Z`));
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

const CHART_W = 720;
const CHART_H = 200;
const PAD_LEFT = 40;
const PAD_BOTTOM = 24;
const PAD_TOP = 8;

/** Courbe des participants par jour (une série : pas de légende, le titre la nomme). */
function ParticipantsChart({ days }: { days: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (days.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-500">Aucune séance sur la période.</p>;
  }
  const plotW = CHART_W - PAD_LEFT - 8;
  const plotH = CHART_H - PAD_BOTTOM - PAD_TOP;
  const g = chartGeometry(days, plotW, plotH);
  const pts = g.points.map((p) => ({ ...p, x: p.x + PAD_LEFT, y: p.y + PAD_TOP }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const baseY = PAD_TOP + plotH;
  const area = `${line} L${pts[pts.length - 1]!.x},${baseY} L${pts[0]!.x},${baseY} Z`;
  const labelIdx = new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1]);
  const slot = pts.length > 1 ? plotW / (pts.length - 1) : plotW;
  const active = hover !== null ? pts[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Participants par jour"
        onMouseLeave={() => setHover(null)}
      >
        {g.ticks.map((t) => {
          const y = PAD_TOP + plotH - (t / g.yMax) * plotH;
          return (
            <g key={t}>
              <line x1={PAD_LEFT} x2={CHART_W - 8} y1={y} y2={y} className="stroke-gray-200" />
              <text
                x={PAD_LEFT - 6}
                y={y + 4}
                textAnchor="end"
                className="fill-gray-400 text-[11px]"
              >
                {t}
              </text>
            </g>
          );
        })}
        <path d={area} className="fill-blue-600/10" />
        <path d={line} fill="none" strokeWidth={2} className="stroke-blue-600" />
        {active && (
          <line
            x1={active.x}
            x2={active.x}
            y1={PAD_TOP}
            y2={baseY}
            className="stroke-gray-300"
            strokeDasharray="3 3"
          />
        )}
        {pts.map((p, i) => (
          <g key={p.point.day}>
            {(pts.length <= 31 || hover === i) && (
              <circle
                cx={p.x}
                cy={p.y}
                r={hover === i ? 5 : 3}
                className="fill-blue-600 stroke-white"
                strokeWidth={2}
              />
            )}
            {labelIdx.has(i) && (
              <text
                x={p.x}
                y={CHART_H - 6}
                textAnchor={
                  i === 0 && pts.length > 1
                    ? 'start'
                    : i === pts.length - 1 && pts.length > 1
                      ? 'end'
                      : 'middle'
                }
                className="fill-gray-500 text-[11px]"
              >
                {dayLabel(p.point.day)}
              </text>
            )}
            <rect
              x={p.x - slot / 2}
              y={PAD_TOP}
              width={Math.max(slot, 8)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border bg-white px-3 py-2 text-xs shadow"
          style={{ left: `${(active.x / CHART_W) * 100}%` }}
        >
          <p className="font-semibold text-gray-900">{dayLabel(active.point.day)}</p>
          <p className="text-gray-700">{active.point.participants} participants</p>
          <p className="text-gray-500">
            {active.point.sessions} séance{active.point.sessions > 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

/** Portail sponsor (C4) : chiffres agrégés d'une campagne sur une période. */
export default function SponsorCampaignPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const invalidPeriod = from !== '' && to !== '' && from > to;
  const qs = periodQuery(from, to);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sponsor-portal', 'campaign', id, from, to],
    queryFn: () =>
      api.get<SponsorCampaignStats>(`/api/sponsor-portal/campaigns/${encodeURIComponent(id)}${qs}`),
    enabled: !!id && !invalidPeriod,
  });

  const download = async () => {
    setDownloadError(null);
    try {
      await downloadApiFile(
        `/api/sponsor-portal/campaigns/${encodeURIComponent(id)}/export.csv${qs}`,
        `campagne-${id}.csv`,
      );
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Téléchargement impossible.');
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/sponsor" className="text-sm text-blue-600 hover:underline">
        ← Vos campagnes
      </Link>

      {isLoading && <p className="text-sm text-gray-400">Chargement…</p>}
      {isError && <p className="text-sm text-red-600">Cette campagne n&apos;est pas disponible.</p>}

      {data && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{data.campaign.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {data.campaign.game.title} · du {DATE_FORMAT.format(new Date(data.campaign.startsAt))}{' '}
            au {DATE_FORMAT.format(new Date(data.campaign.endsAt))}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-white p-4">
        <label className="text-sm text-gray-700">
          Du
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="ml-2 rounded border px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm text-gray-700">
          Au
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="ml-2 rounded border px-2 py-1 text-sm"
          />
        </label>
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Toute la campagne
          </button>
        )}
        <div className="ml-auto flex flex-col items-end">
          <button
            type="button"
            onClick={() => void download()}
            disabled={!data || invalidPeriod}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Exporter en CSV
          </button>
          {downloadError && <p className="mt-1 text-xs text-red-600">{downloadError}</p>}
        </div>
        {invalidPeriod && (
          <p className="w-full text-xs text-red-600">
            La date de début doit précéder la date de fin.
          </p>
        )}
      </div>

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Tile label="Séances diffusées" value={String(data.sessionsPlayed)} />
            <Tile label="Participants" value={String(data.participants)} />
            <Tile
              label="Taux de complétion"
              value={formatRatePercent(data.completionRate)}
              hint={`${data.finishers} joueurs jusqu'à la fin`}
            />
            <Tile
              label="Lots gagnés"
              value={String(data.prizesIssued)}
              {...(data.prizesRedeemed !== null
                ? { hint: `dont ${data.prizesRedeemed} utilisés` }
                : {})}
            />
            <Tile
              label="Taux de participation"
              value={formatRatePercent(data.participationRate)}
              hint={`Calculé sur ${data.attendanceKnownSessions} séance${
                data.attendanceKnownSessions > 1 ? 's' : ''
              } dont les entrées sont connues`}
            />
          </div>

          <div className="rounded-lg border bg-white p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Participants par jour</h2>
              <p className="text-xs text-gray-500">
                Montant de la période : {formatEuroCents(data.amountCents)}
              </p>
            </div>
            <ParticipantsChart days={data.byDay} />
          </div>

          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Cinéma</th>
                  <th className="px-4 py-2">Ville</th>
                  <th className="px-4 py-2 text-right">Séances</th>
                  <th className="px-4 py-2 text-right">Participants</th>
                </tr>
              </thead>
              <tbody>
                {data.byCinema.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                      Aucune séance sur la période.
                    </td>
                  </tr>
                )}
                {data.byCinema.map((c) => (
                  <tr key={`${c.cinemaName}-${c.city ?? ''}`} className="border-b last:border-b-0">
                    <td className="px-4 py-2 text-gray-900">{c.cinemaName}</td>
                    <td className="px-4 py-2 text-gray-700">{c.city ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{c.sessions}</td>
                    <td className="px-4 py-2 text-right font-mono">{c.participants}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
