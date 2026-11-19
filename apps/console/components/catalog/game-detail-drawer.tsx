'use client';

import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CatalogGame, CatalogGameDetail } from '@quiz-app/validation';
import { Clock, Image as ImageIcon, Users, X } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/media-url';
import { ENGINE_LABEL, estimateGameSeconds, formatDuration, revenueLabel } from './format';

interface GameDetailDrawerBaseProps {
  /** Jeu ouvert (données de la carte, affichées pendant le chargement de la fiche). */
  game: CatalogGame;
  cinemaSlug: string;
  onClose: () => void;
}

/** Lanceur de séance : boutons « Choisir » / « Retirer de la séance ». */
interface GameDetailDrawerSelectionProps extends GameDetailDrawerBaseProps {
  /** Le jeu est déjà dans la séance. */
  selected: boolean;
  /** La séance est pleine : un nouveau jeu ne peut plus être choisi. */
  maxReached: boolean;
  onChoose: (game: CatalogGame) => void;
  onRemove: (slug: string) => void;
  footer?: undefined;
}

/** Autre usage (programmation, C2) : pied de panneau fourni, ou aucun (`null`). */
interface GameDetailDrawerFooterProps extends GameDetailDrawerBaseProps {
  footer: Exclude<ReactNode, undefined>;
}

type GameDetailDrawerProps = GameDetailDrawerSelectionProps | GameDetailDrawerFooterProps;

/** Panneau latéral droit : fiche complète d'un jeu du catalogue, règles, questions d'exemple. */
export function GameDetailDrawer(props: GameDetailDrawerProps) {
  const { game, cinemaSlug, onClose } = props;
  const {
    data: detail,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['catalog', cinemaSlug, 'detail', game.slug],
    queryFn: () =>
      api.get<CatalogGameDetail>(
        `/api/catalog/${encodeURIComponent(game.slug)}?cinemaSlug=${encodeURIComponent(cinemaSlug)}`,
      ),
    staleTime: 30_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown: CatalogGame = detail ?? game;
  const coverUrl = resolveMediaUrl(shown.coverImageUrl);
  const logoUrl = resolveMediaUrl(shown.sponsor?.logoUrl);
  const summary = detail?.contentSummary ?? null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Fermer la fiche"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <span className="text-xs font-medium uppercase text-gray-500">
            {ENGINE_LABEL[shown.engineKey] ?? shown.engineKey}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="aspect-[16/9] w-full overflow-hidden bg-gray-100">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-300">
                <ImageIcon size={48} weight="duotone" />
              </div>
            )}
          </div>

          <div className="space-y-4 p-5">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{shown.title}</h3>
              {shown.tagline && <p className="mt-0.5 text-sm text-gray-600">{shown.tagline}</p>}
              {shown.revenue && (
                <p className="mt-2 inline-block rounded-md bg-emerald-50 px-2 py-1 text-sm font-medium text-emerald-800">
                  {revenueLabel(shown.revenue)}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <Clock size={14} />
                  {formatDuration(estimateGameSeconds(shown))}
                </span>
                {detail?.minPlayers != null && (
                  <span className="inline-flex items-center gap-1">
                    <Users size={14} />
                    {detail.minPlayers} joueurs minimum
                  </span>
                )}
                {shown.kind === 'sponsored' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                    {logoUrl && (
                      <img src={logoUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
                    )}
                    Sponsorisé{shown.sponsor ? ` par ${shown.sponsor.name}` : ''}
                  </span>
                )}
                {shown.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {isLoading && <p className="text-sm text-gray-400">Chargement de la fiche…</p>}
            {isError && (
              <p className="text-sm text-red-600">
                La fiche de ce jeu n&apos;est pas disponible pour le moment.
              </p>
            )}

            {detail?.description && (
              <section>
                <h4 className="text-sm font-semibold text-gray-900">Présentation</h4>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-700">
                  {detail.description}
                </p>
              </section>
            )}

            {detail?.rulesText && (
              <section>
                <h4 className="text-sm font-semibold text-gray-900">Règles</h4>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{detail.rulesText}</p>
              </section>
            )}

            {summary && (
              <section>
                <h4 className="text-sm font-semibold text-gray-900">
                  {summary.questionsCount} question{summary.questionsCount > 1 ? 's' : ''}
                </h4>
                {summary.sampleQuestions.length > 0 && (
                  <>
                    <p className="mt-1 text-xs text-gray-500">Exemples :</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">
                      {summary.sampleQuestions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}
          </div>
        </div>

        {props.footer !== undefined ? (
          props.footer !== null && <div className="border-t p-4">{props.footer}</div>
        ) : (
          <SelectionFooter {...props} slug={shown.slug} shown={shown} />
        )}
      </aside>
    </div>
  );
}

function SelectionFooter({
  selected,
  maxReached,
  onChoose,
  onRemove,
  slug,
  shown,
}: GameDetailDrawerSelectionProps & { slug: string; shown: CatalogGame }) {
  return (
    <div className="border-t p-4">
      {selected ? (
        <button
          type="button"
          onClick={() => onRemove(slug)}
          className="w-full rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Retirer de la séance
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => onChoose(shown)}
            disabled={maxReached}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Choisir
          </button>
          {maxReached && (
            <p className="mt-2 text-center text-xs text-gray-500">
              La séance compte déjà le nombre maximal de manches.
            </p>
          )}
        </>
      )}
    </div>
  );
}
