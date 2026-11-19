'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_MAX_SESSIONS_PER_SCREEN_PER_DAY,
  formatEuroCents,
  nonBillableReasonLabel,
  type Campaign,
  type CampaignListResponse,
  type CampaignPricingValue,
  type DeliveryListResponse,
} from '@quiz-app/validation';
import { api } from '../../../../lib/api';
import type { CatalogGameListResponse } from '../../../../lib/games-api';
import {
  CAMPAIGN_STATUS_CLASS,
  CAMPAIGN_STATUS_LABEL,
  campaignErrorMessage,
  parseEuroToCents,
  priceLabel,
} from '../../../../lib/campaigns-api';

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

interface CampaignsTabProps {
  sponsorSlug: string;
  sponsorId: string;
}

/** Onglet « Campagnes » de la fiche sponsor (C3) : liste, création, état, totaux. */
export function CampaignsTab({ sponsorSlug, sponsorId }: CampaignsTabProps) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [openDeliveries, setOpenDeliveries] = useState<string | null>(null);

  const listKey = ['campaigns', sponsorSlug];
  const { data, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: () =>
      api.get<CampaignListResponse>(
        `/api/campaigns?sponsorSlug=${encodeURIComponent(sponsorSlug)}&limit=100`,
      ),
  });

  const action = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: 'activate' | 'pause' | 'end' | 'delete' }) =>
      verb === 'delete'
        ? api.delete(`/api/campaigns/${id}`)
        : api.post<Campaign>(`/api/campaigns/${id}/${verb}`, {}),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: listKey });
    },
    onError: (err) => setError(campaignErrorMessage(err)),
  });

  const items = data?.items ?? [];
  const totals = items.reduce(
    (acc, c) => ({
      amountCents: acc.amountCents + c.totals.amountCents,
      cinemaShareCents: acc.cinemaShareCents + c.totals.cinemaShareCents,
      billable: acc.billable + c.totals.billableDeliveries,
    }),
    { amountCents: 0, cinemaShareCents: 0, billable: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {totals.billable} séance{totals.billable > 1 ? 's' : ''} facturable
          {totals.billable > 1 ? 's' : ''} · facturé {formatEuroCents(totals.amountCents)} · part
          des cinémas {formatEuroCents(totals.cinemaShareCents)}
        </p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          {showForm ? 'Fermer' : 'Nouvelle campagne'}
        </button>
      </div>

      {showForm && (
        <CampaignForm
          sponsorSlug={sponsorSlug}
          sponsorId={sponsorId}
          onCreated={() => {
            setShowForm(false);
            void qc.invalidateQueries({ queryKey: listKey });
          }}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {!isLoading && items.length === 0 && (
        <p className="rounded-lg border bg-white p-6 text-center text-sm text-gray-500">
          Aucune campagne pour ce sponsor.
        </p>
      )}

      {items.map((c) => (
        <div key={c.id} className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900">{c.name}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CAMPAIGN_STATUS_CLASS[c.status]}`}
                >
                  {CAMPAIGN_STATUS_LABEL[c.status]}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-gray-600">
                {c.game.title} · du {DATE_FORMAT.format(new Date(c.startsAt))} au{' '}
                {DATE_FORMAT.format(new Date(c.endsAt))}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {priceLabel(c.unitPriceCents, c.pricing)} · {c.cinemaSharePercent} % au cinéma
                {c.maxSessions !== null && ` · ${c.maxSessions} séances max.`}
                {c.maxSessionsPerScreenPerDay !== null &&
                  ` · ${c.maxSessionsPerScreenPerDay} par salle et par jour`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(c.status === 'draft' || c.status === 'paused') && (
                <ActionButton onClick={() => action.mutate({ id: c.id, verb: 'activate' })}>
                  Activer
                </ActionButton>
              )}
              {c.status === 'active' && (
                <ActionButton onClick={() => action.mutate({ id: c.id, verb: 'pause' })}>
                  Mettre en pause
                </ActionButton>
              )}
              {c.status !== 'ended' && (
                <ActionButton
                  onClick={() => {
                    if (confirm('Terminer cette campagne ? Elle ne pourra plus être réactivée.')) {
                      action.mutate({ id: c.id, verb: 'end' });
                    }
                  }}
                >
                  Terminer
                </ActionButton>
              )}
              {c.totals.deliveries === 0 && (
                <ActionButton
                  danger
                  onClick={() => {
                    if (confirm('Supprimer cette campagne ?')) {
                      action.mutate({ id: c.id, verb: 'delete' });
                    }
                  }}
                >
                  Supprimer
                </ActionButton>
              )}
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat
              label="Séances facturables"
              value={`${c.totals.billableDeliveries} / ${c.totals.deliveries}`}
            />
            <Stat label="Participants" value={String(c.totals.participants)} />
            <Stat label="Facturé" value={formatEuroCents(c.totals.amountCents)} />
            <Stat label="Part des cinémas" value={formatEuroCents(c.totals.cinemaShareCents)} />
          </dl>
          {c.totals.deliveries > 0 && (
            <button
              type="button"
              onClick={() => setOpenDeliveries((v) => (v === c.id ? null : c.id))}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              {openDeliveries === c.id ? 'Masquer les diffusions' : 'Voir les diffusions'}
            </button>
          )}
          {openDeliveries === c.id && <DeliveriesTable campaignId={c.id} />}
        </div>
      ))}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
        danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function DeliveriesTable({ campaignId }: { campaignId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['campaign-deliveries', campaignId],
    queryFn: () =>
      api.get<DeliveryListResponse>(`/api/campaigns/${campaignId}/deliveries?limit=200`),
  });
  if (isLoading) return <p className="mt-2 text-sm text-gray-500">Chargement…</p>;
  if (!data) return null;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b text-gray-500">
          <tr>
            <th className="py-1 pr-3">Date</th>
            <th className="py-1 pr-3">Cinéma / salle</th>
            <th className="py-1 pr-3 text-right">Participants</th>
            <th className="py-1 pr-3 text-right">Entrées</th>
            <th className="py-1 pr-3 text-right">Lots</th>
            <th className="py-1 pr-3">Statut</th>
            <th className="py-1 text-right">Montant</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((d) => (
            <tr key={d.id} className="border-b last:border-b-0">
              <td className="py-1 pr-3">{DATE_TIME_FORMAT.format(new Date(d.playedAt))}</td>
              <td className="py-1 pr-3">
                {d.cinema.name} · {d.screen.name}
              </td>
              <td className="py-1 pr-3 text-right">
                {d.participants} ({d.finishers} jusqu’au bout)
              </td>
              <td className="py-1 pr-3 text-right">{d.attendance ?? '—'}</td>
              <td className="py-1 pr-3 text-right">{d.prizesIssued}</td>
              <td className="py-1 pr-3">
                {d.billable ? 'Facturable' : nonBillableReasonLabel(d.nonBillableReason)}
              </td>
              <td className="py-1 text-right font-mono">{formatEuroCents(d.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.total > data.items.length && (
        <p className="mt-1 text-xs text-gray-500">
          {data.items.length} diffusions affichées sur {data.total}.
        </p>
      )}
    </div>
  );
}

function CampaignForm({
  sponsorSlug,
  sponsorId,
  onCreated,
}: {
  sponsorSlug: string;
  sponsorId: string;
  onCreated: () => void;
}) {
  const { data: games } = useQuery({
    queryKey: ['games', 'sponsored'],
    queryFn: () => api.get<CatalogGameListResponse>('/api/games?kind=sponsored&limit=100'),
  });
  const sponsorGames = useMemo(
    () => (games?.items ?? []).filter((g) => g.sponsorId === sponsorId),
    [games, sponsorId],
  );

  const [name, setName] = useState('');
  const [gameSlug, setGameSlug] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [pricing, setPricing] = useState<CampaignPricingValue>('per_session');
  const [unitPrice, setUnitPrice] = useState('');
  const [share, setShare] = useState('50');
  const [maxSessions, setMaxSessions] = useState('');
  const [maxPerDay, setMaxPerDay] = useState(String(DEFAULT_MAX_SESSIONS_PER_SCREEN_PER_DAY));
  const [emailSharing, setEmailSharing] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<Campaign>('/api/campaigns', body),
    onSuccess: onCreated,
    onError: (err) => setError(campaignErrorMessage(err)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const unitPriceCents = parseEuroToCents(unitPrice);
    const sharePercent = Number(share);
    if (!name.trim() || !gameSlug || !startsAt || !endsAt) {
      setError('Renseignez le nom, le jeu et la période.');
      return;
    }
    if (unitPriceCents === null) {
      setError('Prix unitaire invalide (ex. 4,50).');
      return;
    }
    if (!Number.isInteger(sharePercent) || sharePercent < 0 || sharePercent > 100) {
      setError('La part du cinéma est un pourcentage entier entre 0 et 100.');
      return;
    }
    // Période en jours entiers, heure locale : du début du premier jour à la fin du dernier.
    const start = new Date(`${startsAt}T00:00:00`);
    const end = new Date(`${endsAt}T23:59:59`);
    if (end.getTime() <= start.getTime()) {
      setError('La fin doit suivre le début.');
      return;
    }
    setError(null);
    create.mutate({
      sponsorSlug,
      gameSlug,
      name: name.trim(),
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      pricing,
      unitPriceCents,
      cinemaSharePercent: sharePercent,
      maxSessions: maxSessions.trim() ? Number(maxSessions) : null,
      maxSessionsPerScreenPerDay: maxPerDay.trim() ? Number(maxPerDay) : null,
      emailSharingEnabled: emailSharing,
      notes: notes.trim() || null,
    });
  };

  const input = 'mt-1 w-full rounded border px-3 py-2 text-sm';
  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">Nouvelle campagne (brouillon)</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Nom
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          Jeu sponsorisé
          <select className={input} value={gameSlug} onChange={(e) => setGameSlug(e.target.value)}>
            <option value="">Choisir…</option>
            {sponsorGames.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.title}
              </option>
            ))}
          </select>
          {games && sponsorGames.length === 0 && (
            <span className="mt-1 block text-xs font-normal text-gray-500">
              Aucun jeu sponsorisé par ce sponsor dans le catalogue.
            </span>
          )}
        </label>
        <label className="block text-sm font-medium">
          Début
          <input
            type="date"
            className={input}
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Fin (incluse)
          <input
            type="date"
            className={input}
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Tarif
          <select
            className={input}
            value={pricing}
            onChange={(e) => setPricing(e.target.value as CampaignPricingValue)}
          >
            <option value="per_session">Par séance diffusée</option>
            <option value="per_participant">Par participant</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Prix unitaire (€)
          <input
            className={input}
            inputMode="decimal"
            placeholder="4,50"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Part du cinéma (%)
          <input
            type="number"
            min={0}
            max={100}
            className={input}
            value={share}
            onChange={(e) => setShare(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Séances facturables max. (vide : sans plafond)
          <input
            type="number"
            min={1}
            className={input}
            value={maxSessions}
            onChange={(e) => setMaxSessions(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Max. par salle et par jour (vide : sans plafond)
          <input
            type="number"
            min={1}
            className={input}
            value={maxPerDay}
            onChange={(e) => setMaxPerDay(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm font-medium">
          <input
            type="checkbox"
            checked={emailSharing}
            onChange={(e) => setEmailSharing(e.target.checked)}
          />
          Partage des emails avec le sponsor
        </label>
      </div>
      <label className="block text-sm font-medium">
        Notes
        <textarea
          rows={3}
          className={input}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={create.isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Créer la campagne
      </button>
    </form>
  );
}
