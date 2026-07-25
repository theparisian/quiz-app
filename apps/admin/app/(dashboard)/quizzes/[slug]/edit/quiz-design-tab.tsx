'use client';

import { useQuery } from '@tanstack/react-query';
import { LOBBY_TIMER_LIMITS } from '@quiz-app/validation';
import { api, apiUploadFile } from '../../../../../lib/api';
import { QuizAnswerStylePicker } from '../../../../components/quiz-answer-style-picker';
import type { QuizApiDetail } from '../../../../../lib/quiz-editor-store';
import { resolveMediaUrl } from '../../../../../lib/media-url';
import { useQuizEditorStore } from '../../../../../lib/quiz-editor-store';

function DesignSection({
  title,
  description,
  phase,
  children,
}: {
  title: string;
  description?: string;
  phase?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {description ? <p className="mt-1 text-xs text-gray-500">{description}</p> : null}
        </div>
        {phase ? (
          <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {phase}
          </span>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DesignSubCard({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-gray-50/60 p-4 ${className ?? ''}`}>
      {title ? <p className="text-sm font-medium text-gray-800">{title}</p> : null}
      {description ? <p className="mt-1 text-xs text-gray-500">{description}</p> : null}
      <div className={title || description ? 'mt-3' : undefined}>{children}</div>
    </div>
  );
}

function MediaBackgroundField({
  title,
  description,
  mediaUrl,
  mediaType,
  overlayOpacity,
  readOnly,
  uploadEndpoint,
  deleteEndpoint,
  deleteLabel,
  onOverlayChange,
  onOverlayCommit,
  onSaved,
}: {
  title: string;
  description: string;
  mediaUrl: string | null;
  mediaType: string | null;
  overlayOpacity: number;
  readOnly: boolean;
  uploadEndpoint: string;
  deleteEndpoint: string;
  deleteLabel: string;
  onOverlayChange: (value: number) => void;
  onOverlayCommit: (value: number) => Promise<void>;
  onSaved: (q: QuizApiDetail) => void;
}) {
  return (
    <DesignSubCard title={title} description={description}>
      {mediaUrl ? (
        <div className="relative max-h-40 overflow-hidden rounded border">
          {mediaType === 'video' ? (
            <video
              src={resolveMediaUrl(mediaUrl) ?? mediaUrl}
              muted
              loop
              playsInline
              autoPlay
              className="h-40 w-full object-cover"
            />
          ) : (
            <img
              src={resolveMediaUrl(mediaUrl) ?? mediaUrl}
              alt=""
              className="h-40 w-full object-cover"
            />
          )}
          {overlayOpacity > 0 ? (
            <div
              className="pointer-events-none absolute inset-0 bg-black"
              style={{ opacity: overlayOpacity / 100 }}
            />
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,video/mp4,video/webm"
          disabled={readOnly}
          className="text-sm"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const q = await apiUploadFile<QuizApiDetail>(uploadEndpoint, f);
            onSaved(q);
          }}
        />
        {mediaUrl && !readOnly ? (
          <button
            type="button"
            className="rounded border px-2 py-1 text-sm"
            onClick={async () => {
              const q = await api.delete<QuizApiDetail>(deleteEndpoint);
              if (q) onSaved(q);
            }}
          >
            {deleteLabel}
          </button>
        ) : null}
      </div>
      <label className="mt-4 block text-sm">
        <span>Assombrissement ({overlayOpacity} %)</span>
        <input
          type="range"
          min={0}
          max={100}
          disabled={readOnly || !mediaUrl}
          className="mt-2 w-full disabled:opacity-50"
          value={overlayOpacity}
          onChange={(e) => onOverlayChange(Number(e.target.value))}
          onPointerUp={async (e) => {
            if (readOnly) return;
            await onOverlayCommit(Number((e.target as HTMLInputElement).value));
          }}
        />
      </label>
    </DesignSubCard>
  );
}

export function QuizDesignTab({
  slug,
  readOnly,
  markSaved,
}: {
  slug: string;
  readOnly: boolean;
  markSaved: (q: QuizApiDetail) => void;
}) {
  const updateMetadata = useQuizEditorStore((s) => s.updateMetadata);
  const brandingPrimary = useQuizEditorStore((s) => s.brandingPrimary);
  const brandingSecondary = useQuizEditorStore((s) => s.brandingSecondary);
  const answerDisplayStyle = useQuizEditorStore((s) => s.answerDisplayStyle);
  const lobbyPrizesEnabled = useQuizEditorStore((s) => s.lobbyPrizesEnabled);
  const coverImageUrl = useQuizEditorStore((s) => s.coverImageUrl);
  const backgroundMediaUrl = useQuizEditorStore((s) => s.backgroundMediaUrl);
  const backgroundMediaType = useQuizEditorStore((s) => s.backgroundMediaType);
  const backgroundOverlayOpacity = useQuizEditorStore((s) => s.backgroundOverlayOpacity);
  const lobbyBackgroundMediaUrl = useQuizEditorStore((s) => s.lobbyBackgroundMediaUrl);
  const lobbyBackgroundMediaType = useQuizEditorStore((s) => s.lobbyBackgroundMediaType);
  const lobbyBackgroundOverlayOpacity = useQuizEditorStore((s) => s.lobbyBackgroundOverlayOpacity);
  const lobbyTimer = useQuizEditorStore((s) => s.lobbyTimer);
  const avatarsEnabled = useQuizEditorStore((s) => s.avatarsEnabled);
  const avatarLibraryId = useQuizEditorStore((s) => s.avatarLibraryId);

  const { data: avatarLibrariesData } = useQuery({
    queryKey: ['avatar-libraries'],
    queryFn: () =>
      api.get<{ items: { id: string; slug: string; name: string; avatarsCount?: number }[] }>(
        '/api/avatar-libraries?active=true',
      ),
    refetchOnWindowFocus: false,
  });
  const avatarLibraries = avatarLibrariesData?.items ?? [];

  return (
    <div className="space-y-6">
      <DesignSection
        title="Identité visuelle"
        description="Couleurs et visuel affichés sur la console et le player."
        phase="Identité"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <DesignSubCard title="Couleurs de marque">
            <div className="flex flex-wrap gap-6">
              <label className="text-sm">
                Couleur primaire
                <input
                  type="color"
                  disabled={readOnly}
                  className="ml-2 h-10 w-16 rounded border disabled:opacity-50"
                  value={brandingPrimary}
                  onChange={(e) => updateMetadata({ brandingPrimary: e.target.value })}
                />
              </label>
              <label className="text-sm">
                Couleur secondaire
                <input
                  type="color"
                  disabled={readOnly}
                  className="ml-2 h-10 w-16 rounded border disabled:opacity-50"
                  value={brandingSecondary}
                  onChange={(e) => updateMetadata({ brandingSecondary: e.target.value })}
                />
              </label>
            </div>
            <div
              className="mt-4 flex h-20 items-center justify-center rounded-lg border shadow-inner"
              style={{
                background: `linear-gradient(135deg, ${brandingPrimary}, ${brandingSecondary})`,
              }}
            >
              <span className="text-sm font-semibold text-white drop-shadow">
                Aperçu des couleurs
              </span>
            </div>
          </DesignSubCard>

          <DesignSubCard
            title="Image de couverture"
            description="Affichée dans la console projectionniste et la liste des quizz."
          >
            {coverImageUrl ? (
              <img
                src={resolveMediaUrl(coverImageUrl) ?? coverImageUrl}
                alt=""
                className="max-h-32 rounded border object-contain"
              />
            ) : (
              <p className="text-xs text-gray-400">Aucune couverture</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                disabled={readOnly}
                className="text-sm"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const q = await apiUploadFile<QuizApiDetail>(`/api/quizzes/${slug}/cover`, f);
                  markSaved(q);
                }}
              />
              {coverImageUrl && !readOnly ? (
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-sm"
                  onClick={async () => {
                    const q = await api.delete<QuizApiDetail>(`/api/quizzes/${slug}/cover`);
                    if (q) markSaved(q);
                  }}
                >
                  Supprimer couverture
                </button>
              ) : null}
            </div>
          </DesignSubCard>
        </div>
      </DesignSection>

      <DesignSection
        title="Lobby — avant le début"
        description="Ce que voit le public pendant l'attente, avant le lancement du quiz."
        phase="Lobby"
      >
        <MediaBackgroundField
          title="Fond plein écran"
          description="Photo ou vidéo pendant l'attente (lots, infos sponsor, etc.)."
          mediaUrl={lobbyBackgroundMediaUrl}
          mediaType={lobbyBackgroundMediaType}
          overlayOpacity={lobbyBackgroundOverlayOpacity}
          readOnly={readOnly}
          uploadEndpoint={`/api/quizzes/${slug}/lobby-background`}
          deleteEndpoint={`/api/quizzes/${slug}/lobby-background`}
          deleteLabel="Supprimer fond lobby"
          onOverlayChange={(value) => updateMetadata({ lobbyBackgroundOverlayOpacity: value })}
          onOverlayCommit={async (value) => {
            const q = await api.patch<QuizApiDetail>(`/api/quizzes/${slug}`, {
              lobbyBackgroundOverlayOpacity: value,
            });
            if (q) markSaved(q);
          }}
          onSaved={markSaved}
        />

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <DesignSubCard title="Lots dans le panneau latéral">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300"
                disabled={readOnly}
                checked={lobbyPrizesEnabled}
                onChange={(e) => updateMetadata({ lobbyPrizesEnabled: e.target.checked })}
              />
              <span>
                <span className="font-medium text-gray-800">
                  Afficher les lots dans le panneau lobby
                </span>
                <span className="mt-1 block text-gray-500">
                  Désactivé par défaut. La plupart des cinémas intègrent les lots directement dans
                  l&apos;image de fond.
                </span>
              </span>
            </label>
          </DesignSubCard>

          <DesignSubCard title="Compte à rebours">
            <p className="text-xs text-gray-500">
              Si activé, le quiz se lance automatiquement à la fin du compte à rebours. Sinon,
              c&apos;est le projectionniste qui lance manuellement.
            </p>
            <label className="mt-3 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300"
                disabled={readOnly}
                checked={lobbyTimer.enabled}
                onChange={(e) =>
                  updateMetadata({ lobbyTimer: { ...lobbyTimer, enabled: e.target.checked } })
                }
              />
              <span className="font-medium text-gray-800">
                Activer le compte à rebours automatique
              </span>
            </label>
            {lobbyTimer.enabled ? (
              <div className="mt-3 grid gap-3">
                <label className="block text-sm">
                  <span>Durée d&apos;attente (minutes)</span>
                  <input
                    type="number"
                    min={LOBBY_TIMER_LIMITS.durationMinutes.min}
                    max={LOBBY_TIMER_LIMITS.durationMinutes.max}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                    disabled={readOnly}
                    value={lobbyTimer.durationMinutes}
                    onChange={(e) =>
                      updateMetadata({
                        lobbyTimer: { ...lobbyTimer, durationMinutes: Number(e.target.value) },
                      })
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span>Lancement auto dès (joueurs)</span>
                  <input
                    type="number"
                    min={LOBBY_TIMER_LIMITS.autoStartPlayerThreshold.min}
                    max={LOBBY_TIMER_LIMITS.autoStartPlayerThreshold.max}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                    disabled={readOnly}
                    value={lobbyTimer.autoStartPlayerThreshold}
                    onChange={(e) =>
                      updateMetadata({
                        lobbyTimer: {
                          ...lobbyTimer,
                          autoStartPlayerThreshold: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span>Attente réduite (minutes)</span>
                  <input
                    type="number"
                    min={LOBBY_TIMER_LIMITS.reducedDurationMinutes.min}
                    max={LOBBY_TIMER_LIMITS.reducedDurationMinutes.max}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                    disabled={readOnly}
                    value={lobbyTimer.reducedDurationMinutes}
                    onChange={(e) =>
                      updateMetadata({
                        lobbyTimer: {
                          ...lobbyTimer,
                          reducedDurationMinutes: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
                <p className="text-xs text-gray-500">
                  Une fois le seuil de joueurs atteint, le temps restant descend à l&apos;attente
                  réduite (jamais rallongé) pour ne pas faire patienter les joueurs déjà prêts.
                </p>
              </div>
            ) : null}
          </DesignSubCard>
        </div>
      </DesignSection>

      <DesignSection
        title="Partie — questions & réponses"
        description="Apparence de l'écran cinéma pendant le déroulement du quiz."
        phase="Partie"
      >
        <MediaBackgroundField
          title="Fond plein écran"
          description="Photo ou vidéo pendant la phase questions du player NUC."
          mediaUrl={backgroundMediaUrl}
          mediaType={backgroundMediaType}
          overlayOpacity={backgroundOverlayOpacity}
          readOnly={readOnly}
          uploadEndpoint={`/api/quizzes/${slug}/background`}
          deleteEndpoint={`/api/quizzes/${slug}/background`}
          deleteLabel="Supprimer fond"
          onOverlayChange={(value) => updateMetadata({ backgroundOverlayOpacity: value })}
          onOverlayCommit={async (value) => {
            const q = await api.patch<QuizApiDetail>(`/api/quizzes/${slug}`, {
              backgroundOverlayOpacity: value,
            });
            if (q) markSaved(q);
          }}
          onSaved={markSaved}
        />

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <DesignSubCard title="Style des réponses">
            <QuizAnswerStylePicker
              value={answerDisplayStyle}
              disabled={readOnly}
              onChange={(style) => updateMetadata({ answerDisplayStyle: style })}
            />
          </DesignSubCard>

          <DesignSubCard title="Avatars joueurs">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={avatarsEnabled}
                onChange={(e) => updateMetadata({ avatarsEnabled: e.target.checked })}
              />
              Autoriser les avatars joueurs
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Les joueurs choisissent (ou se voient attribuer) un avatar affiché sur l&apos;écran,
              dans les scores et en fin de partie.
            </p>
            {avatarsEnabled ? (
              <div className="mt-3">
                <label className="block text-sm">
                  Bibliothèque d&apos;avatars
                  <select
                    disabled={readOnly}
                    value={avatarLibraryId ?? ''}
                    onChange={(e) => updateMetadata({ avatarLibraryId: e.target.value || null })}
                    className="mt-1 w-full rounded border px-2 py-1.5 text-sm disabled:opacity-50"
                  >
                    <option value="">— Sélectionner —</option>
                    {avatarLibraries.map((lib) => (
                      <option key={lib.id} value={lib.id}>
                        {lib.name}
                        {lib.avatarsCount !== undefined ? ` (${lib.avatarsCount})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {avatarLibraries.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-600">
                    Aucune bibliothèque active. Créez-en une dans l&apos;onglet Avatars.
                  </p>
                ) : null}
                {!avatarLibraryId ? (
                  <p className="mt-1 text-xs text-amber-600">
                    Choisissez une bibliothèque pour activer les avatars.
                  </p>
                ) : null}
              </div>
            ) : null}
          </DesignSubCard>
        </div>
      </DesignSection>

      <DesignSection
        title="Résultats"
        description="Podium et classement final affichés en fin de session."
        phase="Résultats"
      >
        <DesignSubCard>
          <p className="text-sm text-gray-600">
            Le podium reprend les <strong>couleurs de marque</strong> définies dans l&apos;identité
            visuelle.
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Les lots à gagner se configurent dans l&apos;onglet <strong>Lots</strong>.
          </p>
        </DesignSubCard>
      </DesignSection>
    </div>
  );
}
