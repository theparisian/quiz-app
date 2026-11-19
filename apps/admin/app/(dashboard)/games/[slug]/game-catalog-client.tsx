'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, PencilSimple } from '@phosphor-icons/react';
import type { GameAudienceValue, GameKindValue, UpdateGameBody } from '@quiz-app/validation';
import { api, apiUploadFile } from '../../../../lib/api';
import { resolveMediaUrl } from '../../../../lib/media-url';
import { getNavItem } from '../../../../lib/nav-items';
import { GAME_STATUS_LABEL } from '../../../../lib/poll-api';
import {
  AUDIENCE_LABEL,
  ENGINE_LABEL,
  KIND_LABEL,
  catalogErrorMessage,
  contentEditorHref,
  type CatalogGameRow,
} from '../../../../lib/games-api';
import { PageHeader } from '../../../components/page-header';

interface SponsorOption {
  id: string;
  name: string;
  active: boolean;
}

interface CinemaOption {
  id: string;
  name: string;
  city: string | null;
}

interface FormState {
  tagline: string;
  rulesText: string;
  kind: GameKindValue;
  sponsorId: string;
  audience: GameAudienceValue;
  cinemaIds: string[];
  tags: string;
  minPlayers: string;
  durationMinutes: string;
}

function toForm(game: CatalogGameRow): FormState {
  return {
    tagline: game.tagline ?? '',
    rulesText: game.rulesText ?? '',
    kind: game.kind,
    sponsorId: game.sponsorId ?? '',
    audience: game.audience,
    cinemaIds: game.cinemas.map((c) => c.id),
    tags: game.tags.join(', '),
    minPlayers: game.minPlayers != null ? String(game.minPlayers) : '',
    durationMinutes:
      game.durationEstimateSeconds != null
        ? String(Math.max(1, Math.round(game.durationEstimateSeconds / 60)))
        : '',
  };
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Corps du PATCH : champs du catalogue, sans ceux qu'un jeu quiz tient de son quiz. */
function toBody(game: CatalogGameRow, form: FormState, initial: FormState): UpdateGameBody {
  const tags = parseTags(form.tags);
  const body: UpdateGameBody = {
    tagline: form.tagline.trim() || null,
    rulesText: form.rulesText.trim() || null,
    audience: form.audience,
    cinemaIds: form.cinemaIds,
    tags: tags.length > 0 ? tags : null,
    minPlayers: form.minPlayers ? Number(form.minPlayers) : null,
  };
  if (game.engineKey !== 'quiz') {
    body.kind = form.kind;
    body.sponsorId = form.sponsorId || null;
    // Durée : envoyée seulement si elle a été modifiée (la valeur affichée est arrondie).
    if (form.durationMinutes !== initial.durationMinutes) {
      body.durationEstimateSeconds = form.durationMinutes
        ? Number(form.durationMinutes) * 60
        : null;
    }
  }
  return body;
}

const inputClass =
  'mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';

/** Fiche catalogue d'un jeu (C1) : champs vus par les cinémas, présence, audience. */
export function GameCatalogClient({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const queryKey = ['games', 'detail', slug];
  const [form, setForm] = useState<FormState | null>(null);
  const [initial, setInitial] = useState<FormState | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const {
    data: game,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => api.get<CatalogGameRow>(`/api/games/${encodeURIComponent(slug)}`),
  });

  const { data: sponsors } = useQuery({
    queryKey: ['sponsors', 'options'],
    queryFn: () => api.get<{ items: SponsorOption[] }>('/api/sponsors?limit=100'),
    enabled: !!game && game.engineKey !== 'quiz',
  });

  const { data: cinemas } = useQuery({
    queryKey: ['cinemas', 'options'],
    queryFn: () => api.get<{ items: CinemaOption[] }>('/api/cinemas?limit=100'),
    enabled: form?.audience === 'selected_cinemas',
  });

  useEffect(() => {
    if (game && form === null) {
      const f = toForm(game);
      setForm(f);
      setInitial(f);
    }
  }, [game, form]);

  const onSaved = (updated: CatalogGameRow) => {
    qc.setQueryData(queryKey, updated);
    void qc.invalidateQueries({ queryKey: ['games'] });
  };

  const save = useMutation({
    mutationFn: (body: UpdateGameBody) =>
      api.patch<CatalogGameRow>(`/api/games/${encodeURIComponent(slug)}`, body),
    onSuccess: (updated) => {
      onSaved(updated);
      const f = toForm(updated);
      setForm(f);
      setInitial(f);
      setMessage({ ok: true, text: 'Modifications enregistrées.' });
    },
    onError: (err) => setMessage({ ok: false, text: catalogErrorMessage(err) }),
  });

  const toggle = useMutation({
    mutationFn: (enable: boolean) =>
      api.post<CatalogGameRow>(
        `/api/games/${encodeURIComponent(slug)}/${enable ? 'enable' : 'disable'}`,
      ),
    onSuccess: onSaved,
    onError: (err) => setMessage({ ok: false, text: catalogErrorMessage(err) }),
  });

  const cover = useMutation({
    mutationFn: (file: File | null) =>
      file
        ? apiUploadFile<CatalogGameRow>(`/api/games/${encodeURIComponent(slug)}/cover`, file)
        : api
            .delete<CatalogGameRow>(`/api/games/${encodeURIComponent(slug)}/cover`)
            .then((g) => g!),
    onSuccess: onSaved,
    onError: (err) => setMessage({ ok: false, text: catalogErrorMessage(err) }),
  });

  if (isLoading) return <p className="text-gray-400">Chargement…</p>;
  if (error || !game) return <p className="text-red-600">Jeu introuvable.</p>;
  if (!form || !initial) return null;

  const isQuiz = game.engineKey === 'quiz';
  const status = GAME_STATUS_LABEL[game.status];
  const editorHref = contentEditorHref(game);
  const coverUrl = resolveMediaUrl(game.coverImageUrl);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  const toggleCinema = (id: string) =>
    set(
      'cinemaIds',
      form.cinemaIds.includes(id)
        ? form.cinemaIds.filter((c) => c !== id)
        : [...form.cinemaIds, id],
    );
  const sponsorMissing = !isQuiz && form.kind === 'sponsored' && !form.sponsorId;

  return (
    <div className="max-w-3xl">
      <Link href="/games" className="text-sm text-gray-500 hover:text-gray-700">
        ← Catalogue
      </Link>
      <div className="mt-2">
        <PageHeader
          icon={getNavItem('/games')!.icon}
          title={game.title}
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>{ENGINE_LABEL[game.engineKey] ?? game.engineKey}</span>
              {status && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>
                  {status.label}
                </span>
              )}
              <span className="text-gray-400">{game.slug}</span>
            </span>
          }
          actions={
            editorHref ? (
              <Link
                href={editorHref}
                className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <PencilSimple size={16} />
                Modifier le contenu
              </Link>
            ) : null
          }
        />
      </div>

      {/* Présence dans le catalogue */}
      <section className="mt-6 flex items-center justify-between rounded-lg border bg-white p-4">
        <div>
          <h2 className="font-semibold text-gray-900">Dans le catalogue</h2>
          <p className="text-sm text-gray-500">
            {game.status === 'published'
              ? 'Les cinémas de l’audience voient ce jeu et peuvent le programmer.'
              : 'Le jeu n’est pas publié : il n’apparaîtra aux cinémas qu’une fois publié.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={game.catalogEnabled}
          aria-label="Dans le catalogue"
          disabled={toggle.isPending}
          onClick={() => toggle.mutate(!game.catalogEnabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
            game.catalogEnabled ? 'bg-green-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
              game.catalogEnabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </section>

      {/* Couverture */}
      <section className="mt-4 rounded-lg border bg-white p-4">
        <h2 className="font-semibold text-gray-900">Couverture</h2>
        <div className="mt-3 flex items-center gap-4">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-24 w-32 rounded object-cover" />
          ) : (
            <div className="flex h-24 w-32 items-center justify-center rounded bg-gray-100 text-gray-300">
              <ImageIcon size={32} />
            </div>
          )}
          {isQuiz ? (
            <p className="text-sm text-gray-500">
              Le titre et la couverture d’un quiz se modifient dans l’éditeur de quiz.
            </p>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <label className="cursor-pointer rounded-md border px-3 py-1.5 hover:bg-gray-50">
                {cover.isPending ? 'Envoi…' : 'Choisir une image'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) cover.mutate(file);
                    e.target.value = '';
                  }}
                />
              </label>
              {game.coverImageUrl && (
                <button
                  type="button"
                  onClick={() => cover.mutate(null)}
                  className="text-red-600 hover:underline"
                >
                  Retirer
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Fiche */}
      <form
        className="mt-4 space-y-4 rounded-lg border bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          save.mutate(toBody(game, form, initial));
        }}
      >
        <h2 className="font-semibold text-gray-900">Fiche catalogue</h2>

        <label className="block text-sm font-medium text-gray-700">
          Accroche
          <input
            type="text"
            maxLength={160}
            value={form.tagline}
            onChange={(e) => set('tagline', e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Règles du jeu
          <textarea
            rows={4}
            maxLength={5000}
            value={form.rulesText}
            onChange={(e) => set('rulesText', e.target.value)}
            className={inputClass}
          />
        </label>

        {isQuiz ? (
          <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-600">
            Type : {KIND_LABEL[game.kind]}
            {game.sponsor ? ` (${game.sponsor.name})` : ''} · Durée estimée :{' '}
            {game.durationEstimateSeconds != null
              ? `${Math.max(1, Math.round(game.durationEstimateSeconds / 60))} min`
              : '—'}
            . Ces informations viennent du quiz.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium text-gray-700">
              Type
              <select
                value={form.kind}
                onChange={(e) => set('kind', e.target.value as GameKindValue)}
                className={inputClass}
              >
                {Object.entries(KIND_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Sponsor
              <select
                value={form.sponsorId}
                onChange={(e) => set('sponsorId', e.target.value)}
                className={inputClass}
              >
                <option value="">Aucun</option>
                {sponsors?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.active ? '' : ' (inactif)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Durée estimée (min)
              <input
                type="number"
                min={1}
                max={120}
                value={form.durationMinutes}
                onChange={(e) => set('durationMinutes', e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        )}
        {sponsorMissing && (
          <p className="text-sm text-yellow-700">Choisissez le sponsor d’un jeu sponsorisé.</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            Tags (séparés par des virgules)
            <input
              type="text"
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Joueurs minimum
            <input
              type="number"
              min={1}
              max={1000}
              value={form.minPlayers}
              onChange={(e) => set('minPlayers', e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Audience</legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {(Object.keys(AUDIENCE_LABEL) as GameAudienceValue[]).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="audience"
                  value={value}
                  checked={form.audience === value}
                  onChange={() => set('audience', value)}
                />
                {AUDIENCE_LABEL[value]}
              </label>
            ))}
          </div>
          {form.audience === 'selected_cinemas' && (
            <div className="mt-3 max-h-64 overflow-y-auto rounded-md border p-3">
              {!cinemas && <p className="text-sm text-gray-400">Chargement des cinémas…</p>}
              {cinemas?.items.length === 0 && (
                <p className="text-sm text-gray-400">Aucun cinéma.</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {cinemas?.items.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.cinemaIds.includes(c.id)}
                      onChange={() => toggleCinema(c.id)}
                    />
                    <span>
                      {c.name}
                      {c.city ? <span className="text-gray-400"> · {c.city}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
              {form.cinemaIds.length === 0 && (
                <p className="mt-2 text-sm text-yellow-700">
                  Aucun cinéma choisi : le jeu n’est proposé à personne.
                </p>
              )}
            </div>
          )}
        </fieldset>

        {message && (
          <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={save.isPending || sponsorMissing}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
