'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Archive,
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretLeft,
  CheckCircle,
  Copy,
  Eye,
  FloppyDisk,
  PencilSimple,
  Plus,
  Sparkle,
  Trash,
} from '@phosphor-icons/react';
import { LOBBY_TIMER_LIMITS } from '@quiz-app/validation';
import { api, apiUploadFile } from '../../../../../lib/api';
import { AiGenerateModal } from '../../../../components/ai-generate-modal';
import { QuizAnswerStylePicker } from '../../../../components/quiz-answer-style-picker';
import type { AnswerPos, QuizApiDetail } from '../../../../../lib/quiz-editor-store';
import { resolveMediaUrl } from '../../../../../lib/media-url';
import { buildQuizSavePayload, useQuizEditorStore } from '../../../../../lib/quiz-editor-store';
import { QuizPrizesTab } from './quiz-prizes-tab';

function SortableQRow(props: {
  id: string;
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  dragDisabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
    disabled: props.dragDisabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };
  const grabCls = props.dragDisabled
    ? 'cursor-default opacity-40'
    : 'cursor-grab active:cursor-grabbing';
  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button
          type="button"
          className={`px-1 text-gray-500 ${grabCls}`}
          disabled={props.dragDisabled}
          title={
            props.dragDisabled
              ? 'Repasse le quiz en brouillon pour réordonner'
              : 'Glisser pour réordonner'
          }
          {...(!props.dragDisabled ? { ...attributes, ...listeners } : {})}
        >
          ⋮⋮
        </button>
        <button type="button" className="flex-1 text-left" onClick={props.onToggle}>
          <span className="font-medium text-gray-900">{props.title}</span>
          <span className="ml-2 text-sm text-gray-500">{props.subtitle}</span>
          <span className="float-right text-gray-400">{props.expanded ? '▼' : '▶'}</span>
        </button>
      </div>
      {props.expanded && <div className="border-t p-4">{props.children}</div>}
    </div>
  );
}

type EditTab = 'settings' | 'questions' | 'design' | 'music' | 'prizes';

const EDIT_TABS: { id: EditTab; label: string }[] = [
  { id: 'settings', label: 'Paramètres' },
  { id: 'questions', label: 'Questions' },
  { id: 'design', label: 'Design' },
  { id: 'music', label: 'Musique' },
  { id: 'prizes', label: 'Lots' },
];

export function QuizEditClient({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [pubErr, setPubErr] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiOkBanner, setAiOkBanner] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EditTab>('settings');

  const isDirty = useQuizEditorStore((s) => s.isDirty);
  const quizStatus = useQuizEditorStore((s) => s.quizStatus);
  const title = useQuizEditorStore((s) => s.title);
  const description = useQuizEditorStore((s) => s.description);
  const type = useQuizEditorStore((s) => s.type);
  const sponsorId = useQuizEditorStore((s) => s.sponsorId);
  const language = useQuizEditorStore((s) => s.language);
  const durationEstimateSeconds = useQuizEditorStore((s) => s.durationEstimateSeconds);
  const brandingPrimary = useQuizEditorStore((s) => s.brandingPrimary);
  const brandingSecondary = useQuizEditorStore((s) => s.brandingSecondary);
  const answerDisplayStyle = useQuizEditorStore((s) => s.answerDisplayStyle);
  const lateJoinQrEnabled = useQuizEditorStore((s) => s.lateJoinQrEnabled);
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
  const questions = useQuizEditorStore((s) => s.questions);
  const expandedTempId = useQuizEditorStore((s) => s.expandedTempId);
  const hydrate = useQuizEditorStore((s) => s.hydrate);
  const markSaved = useQuizEditorStore((s) => s.markSaved);
  const setExpanded = useQuizEditorStore((s) => s.setExpanded);
  const updateMetadata = useQuizEditorStore((s) => s.updateMetadata);
  const addQuestion = useQuizEditorStore((s) => s.addQuestion);
  const updateQuestion = useQuizEditorStore((s) => s.updateQuestion);
  const removeQuestion = useQuizEditorStore((s) => s.removeQuestion);
  const reorderQuestions = useQuizEditorStore((s) => s.reorderQuestions);
  const duplicateQuestion = useQuizEditorStore((s) => s.duplicateQuestion);
  const updateAnswer = useQuizEditorStore((s) => s.updateAnswer);
  const setCorrectAnswer = useQuizEditorStore((s) => s.setCorrectAnswer);
  const resetFromApi = useQuizEditorStore((s) => s.resetFromApi);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { data, isLoading } = useQuery({
    queryKey: ['quiz', slug],
    queryFn: () => api.get<QuizApiDetail>(`/api/quizzes/${slug}`),
    refetchOnWindowFocus: false,
  });

  const { data: avatarLibrariesData } = useQuery({
    queryKey: ['avatar-libraries'],
    queryFn: () =>
      api.get<{ items: { id: string; slug: string; name: string; avatarsCount?: number }[] }>(
        '/api/avatar-libraries?active=true',
      ),
    refetchOnWindowFocus: false,
  });
  const avatarLibraries = avatarLibrariesData?.items ?? [];

  useEffect(() => {
    if (!data) return;
    if (!useQuizEditorStore.getState().isDirty) {
      hydrate(data);
    }
  }, [data, hydrate]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useQuizEditorStore.getState().isDirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const saveMut = useMutation({
    mutationFn: () => api.put<QuizApiDetail>(`/api/quizzes/${slug}/full`, buildQuizSavePayload()),
    onSuccess: (q) => {
      markSaved(q);
      void qc.invalidateQueries({ queryKey: ['quiz', slug] });
    },
    onError: (e: Error) => alert(e.message),
  });

  const publishMut = useMutation({
    mutationFn: () => api.post<QuizApiDetail>(`/api/quizzes/${slug}/publish`, {}),
    onSuccess: (q) => {
      setPubErr(null);
      markSaved(q);
      void qc.invalidateQueries({ queryKey: ['quiz', slug] });
    },
    onError: (e: Error & { details?: unknown }) => {
      const d = e.details as { questionErrors?: Record<string, string[]> } | undefined;
      if (d?.questionErrors) {
        setPubErr(
          Object.entries(d.questionErrors)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
            .join('\n'),
        );
      } else alert(e.message);
    },
  });

  const unpublishMut = useMutation({
    mutationFn: () => api.post<QuizApiDetail>(`/api/quizzes/${slug}/unpublish`, {}),
    onSuccess: (q) => {
      markSaved(q);
      void qc.invalidateQueries({ queryKey: ['quiz', slug] });
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post<QuizApiDetail>(`/api/quizzes/${slug}/archive`, {}),
    onSuccess: (q) => {
      markSaved(q);
      void qc.invalidateQueries({ queryKey: ['quiz', slug] });
    },
  });

  const unarchiveMut = useMutation({
    mutationFn: () => api.post<QuizApiDetail>(`/api/quizzes/${slug}/unarchive`, {}),
    onSuccess: (q) => {
      markSaved(q);
      void qc.invalidateQueries({ queryKey: ['quiz', slug] });
    },
  });

  const duplicateMut = useMutation({
    mutationFn: () => api.post<QuizApiDetail>(`/api/quizzes/${slug}/duplicate`, {}),
    onSuccess: (q) => {
      window.location.href = `/quizzes/${q.slug}/edit`;
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/quizzes/${slug}`),
    onSuccess: () => {
      window.location.href = '/quizzes';
    },
  });

  const onDragEnd = (e: DragEndEvent) => {
    const st = useQuizEditorStore.getState();
    if (st.quizStatus !== 'draft') return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ordered = [...st.questions].sort((a, b) => a.position - b.position);
    const oldIndex = ordered.findIndex((x) => x.tempId === active.id);
    const newIndex = ordered.findIndex((x) => x.tempId === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorderQuestions(oldIndex, newIndex);
  };

  const structuredLocked = quizStatus === 'published';
  const readOnly = quizStatus === 'archived';
  const statusBadge =
    quizStatus === 'draft'
      ? 'bg-gray-100 text-gray-800'
      : quizStatus === 'published'
        ? 'bg-green-100 text-green-800'
        : 'bg-orange-100 text-orange-900';

  const sponsorsQ = useQuery({
    queryKey: ['sponsors', 'pick'],
    queryFn: () =>
      api.get<{
        items: { id: string; slug: string; name: string; active: boolean }[];
      }>('/api/sponsors?limit=500&active=true'),
  });

  const items = useMemo(() => [...questions].sort((a, b) => a.position - b.position), [questions]);

  if (isLoading && !title) return <p className="text-gray-500">Chargement…</p>;
  if (!data && !title) return <p className="text-red-600">Quiz introuvable.</p>;

  return (
    <div className="space-y-4">
      {pubErr && (
        <div className="whitespace-pre-wrap rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
          {pubErr}
        </div>
      )}
      {aiOkBanner && (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900">
          {aiOkBanner}
          <button
            type="button"
            className="float-right text-xs text-green-800 underline"
            onClick={() => setAiOkBanner(null)}
          >
            Fermer
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/quizzes"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >
          <CaretLeft size={14} />
          Retour
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Édition du quizz</h1>
        <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${statusBadge}`}>
          {quizStatus}
        </span>
        {isDirty && (
          <span className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-medium text-amber-900">
            Modifications non enregistrées
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <a
            href={`/quizzes/${slug}/preview`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <Eye size={15} />
            Preview
          </a>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
            onClick={() => {
              if (useQuizEditorStore.getState().isDirty) {
                if (!confirm('Abandonner les modifications locales ?')) return;
              }
              void (async () => {
                const fresh = await api.get<QuizApiDetail>(`/api/quizzes/${slug}`);
                resetFromApi(fresh);
                void qc.invalidateQueries({ queryKey: ['quiz', slug] });
              })();
            }}
          >
            <ArrowCounterClockwise size={15} />
            Annuler
          </button>
          <button
            type="button"
            disabled={!isDirty || readOnly || saveMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={() => saveMut.mutate()}
          >
            <FloppyDisk size={15} />
            Enregistrer
          </button>
          {quizStatus === 'draft' && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm text-white"
              onClick={() => publishMut.mutate()}
            >
              <CheckCircle size={15} />
              Publier
            </button>
          )}
          {quizStatus === 'published' && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm text-white"
              onClick={() => {
                if (
                  confirm(
                    "Le quiz ne sera plus jouable tant qu'il n'est pas republié. Repasser en brouillon ?",
                  )
                ) {
                  unpublishMut.mutate();
                }
              }}
            >
              <PencilSimple size={15} />
              Repasser en brouillon
            </button>
          )}
          {quizStatus !== 'archived' && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
              onClick={() => archiveMut.mutate()}
            >
              <Archive size={15} />
              Archiver
            </button>
          )}
          {quizStatus === 'archived' && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
              onClick={() => unarchiveMut.mutate()}
            >
              <ArrowClockwise size={15} />
              Désarchiver
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
            onClick={() => duplicateMut.mutate()}
          >
            <Copy size={15} />
            Dupliquer
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700"
            onClick={() => {
              if (confirm('Supprimer définitivement ce quiz ?')) deleteMut.mutate();
            }}
          >
            <Trash size={15} />
            Supprimer
          </button>
        </div>
      </div>

      {structuredLocked && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          ⚠️ Quiz publié — édition limitée (texte et visuels).{' '}
          <button
            type="button"
            className="font-medium text-amber-900 underline"
            onClick={() => {
              if (
                confirm(
                  "Le quiz ne sera plus jouable tant qu'il n'est pas republié. Repasser en brouillon ?",
                )
              ) {
                unpublishMut.mutate();
              }
            }}
          >
            Repasser en brouillon
          </button>
        </div>
      )}
      {readOnly && (
        <div className="rounded border border-gray-200 bg-gray-100 px-3 py-2 text-sm">
          Quiz archivé — lecture seule.{' '}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => unarchiveMut.mutate()}
          >
            Désarchiver pour éditer
          </button>
        </div>
      )}

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex flex-wrap gap-1">
          {EDIT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.id === 'questions' && (
                <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {items.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'settings' && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Paramètres généraux</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span>Titre *</span>
              <input
                className="mt-1 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                disabled={readOnly}
                value={title}
                onChange={(e) => updateMetadata({ title: e.target.value })}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span>Description</span>
              <textarea
                className="mt-1 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                disabled={readOnly}
                rows={3}
                value={description ?? ''}
                onChange={(e) => updateMetadata({ description: e.target.value || null })}
              />
            </label>
            <label className="block text-sm">
              <span>Type</span>
              <select
                className="mt-1 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                disabled={readOnly || structuredLocked}
                title={structuredLocked ? 'Repasse en brouillon pour modifier ce champ' : undefined}
                value={type}
                onChange={(e) =>
                  updateMetadata({
                    type: e.target.value as typeof type,
                  })
                }
              >
                <option value="standard">standard</option>
                <option value="sponsored">sponsored</option>
                <option value="custom">custom</option>
              </select>
            </label>
            <label className="block text-sm">
              <span>Sponsor (actifs)</span>
              <select
                className="mt-1 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                disabled={readOnly || structuredLocked}
                title={structuredLocked ? 'Repasse en brouillon pour modifier ce champ' : undefined}
                value={sponsorId ?? ''}
                onChange={(e) =>
                  updateMetadata({
                    sponsorId: e.target.value === '' ? null : e.target.value,
                  })
                }
              >
                <option value="">—</option>
                {sponsorsQ.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span>Langue</span>
              <input
                className="mt-1 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                disabled={readOnly}
                value={language}
                onChange={(e) => updateMetadata({ language: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span>Durée estimée (secondes)</span>
              <input
                type="number"
                className="mt-1 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                disabled={readOnly || structuredLocked}
                title={structuredLocked ? 'Repasse en brouillon pour modifier ce champ' : undefined}
                value={durationEstimateSeconds ?? ''}
                onChange={(e) =>
                  updateMetadata({
                    durationEstimateSeconds: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="flex items-start gap-3 text-sm md:col-span-2">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300"
                disabled={readOnly}
                checked={lateJoinQrEnabled}
                onChange={(e) => updateMetadata({ lateJoinQrEnabled: e.target.checked })}
              />
              <span>
                <span className="font-medium text-gray-800">
                  QR code late-join pendant la partie
                </span>
                <span className="mt-1 block text-gray-500">
                  Affiche un petit QR en bas à droite de l&apos;écran NUC pendant les questions,
                  pour rejoindre en cours de séance.
                </span>
              </span>
            </label>
          </div>
        </div>
      )}

      {activeTab === 'design' && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Design</h2>
          <div className="mt-3 grid gap-6">
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

            <QuizAnswerStylePicker
              value={answerDisplayStyle}
              disabled={readOnly}
              onChange={(style) => updateMetadata({ answerDisplayStyle: style })}
            />

            <div className="rounded-lg border border-gray-200 p-3">
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
              {avatarsEnabled && (
                <div className="mt-3">
                  <label className="text-sm">
                    Bibliothèque d&apos;avatars
                    <select
                      disabled={readOnly}
                      value={avatarLibraryId ?? ''}
                      onChange={(e) => updateMetadata({ avatarLibraryId: e.target.value || null })}
                      className="ml-2 rounded border px-2 py-1 text-sm disabled:opacity-50"
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
                  {avatarLibraries.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      Aucune bibliothèque active. Créez-en une dans l&apos;onglet Avatars.
                    </p>
                  )}
                  {avatarsEnabled && !avatarLibraryId && (
                    <p className="mt-1 text-xs text-amber-600">
                      Choisissez une bibliothèque pour activer les avatars.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-medium">Image de couverture</p>
              {coverImageUrl && (
                <img
                  src={resolveMediaUrl(coverImageUrl) ?? coverImageUrl}
                  alt=""
                  className="mt-2 max-h-32 rounded border object-contain"
                />
              )}
              <div className="mt-2 flex gap-2">
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
                {coverImageUrl && !readOnly && (
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
                )}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium">Fond du lobby (écran cinéma)</p>
              <p className="mt-1 text-xs text-gray-500">
                Photo ou vidéo plein écran pendant l&apos;attente avant le début du quiz (lots,
                infos sponsor, etc.).
              </p>
              {lobbyBackgroundMediaUrl && (
                <div className="relative mt-2 max-h-40 overflow-hidden rounded border">
                  {lobbyBackgroundMediaType === 'video' ? (
                    <video
                      src={resolveMediaUrl(lobbyBackgroundMediaUrl) ?? lobbyBackgroundMediaUrl}
                      muted
                      loop
                      playsInline
                      autoPlay
                      className="h-40 w-full object-cover"
                    />
                  ) : (
                    <img
                      src={resolveMediaUrl(lobbyBackgroundMediaUrl) ?? lobbyBackgroundMediaUrl}
                      alt=""
                      className="h-40 w-full object-cover"
                    />
                  )}
                  {lobbyBackgroundOverlayOpacity > 0 && (
                    <div
                      className="pointer-events-none absolute inset-0 bg-black"
                      style={{ opacity: lobbyBackgroundOverlayOpacity / 100 }}
                    />
                  )}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,video/mp4,video/webm"
                  disabled={readOnly}
                  className="text-sm"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const q = await apiUploadFile<QuizApiDetail>(
                      `/api/quizzes/${slug}/lobby-background`,
                      f,
                    );
                    markSaved(q);
                  }}
                />
                {lobbyBackgroundMediaUrl && !readOnly && (
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-sm"
                    onClick={async () => {
                      const q = await api.delete<QuizApiDetail>(
                        `/api/quizzes/${slug}/lobby-background`,
                      );
                      if (q) markSaved(q);
                    }}
                  >
                    Supprimer fond lobby
                  </button>
                )}
              </div>
              <label className="mt-4 block text-sm">
                <span>Assombrissement ({lobbyBackgroundOverlayOpacity} %)</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  disabled={readOnly || !lobbyBackgroundMediaUrl}
                  className="mt-2 w-full max-w-md disabled:opacity-50"
                  value={lobbyBackgroundOverlayOpacity}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    updateMetadata({ lobbyBackgroundOverlayOpacity: value });
                  }}
                  onPointerUp={async (e) => {
                    if (readOnly) return;
                    const value = Number((e.target as HTMLInputElement).value);
                    const q = await api.patch<QuizApiDetail>(`/api/quizzes/${slug}`, {
                      lobbyBackgroundOverlayOpacity: value,
                    });
                    if (q) markSaved(q);
                  }}
                />
              </label>
              <label className="mt-4 flex items-start gap-3 text-sm">
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
            </div>

            <div>
              <p className="text-sm font-medium">Compte à rebours du lobby</p>
              <p className="mt-1 text-xs text-gray-500">
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

              {lobbyTimer.enabled && (
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
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
                  <p className="text-xs text-gray-500 sm:col-span-3">
                    Une fois le seuil de joueurs atteint, le temps restant descend à l&apos;attente
                    réduite (jamais rallongé) pour ne pas faire patienter les joueurs déjà prêts.
                  </p>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-medium">Fond des questions (écran cinéma)</p>
              <p className="mt-1 text-xs text-gray-500">
                Photo ou vidéo plein écran pendant la phase questions du player NUC.
              </p>
              {backgroundMediaUrl && (
                <div className="relative mt-2 max-h-40 overflow-hidden rounded border">
                  {backgroundMediaType === 'video' ? (
                    <video
                      src={resolveMediaUrl(backgroundMediaUrl) ?? backgroundMediaUrl}
                      muted
                      loop
                      playsInline
                      autoPlay
                      className="h-40 w-full object-cover"
                    />
                  ) : (
                    <img
                      src={resolveMediaUrl(backgroundMediaUrl) ?? backgroundMediaUrl}
                      alt=""
                      className="h-40 w-full object-cover"
                    />
                  )}
                  {backgroundOverlayOpacity > 0 && (
                    <div
                      className="pointer-events-none absolute inset-0 bg-black"
                      style={{ opacity: backgroundOverlayOpacity / 100 }}
                    />
                  )}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,video/mp4,video/webm"
                  disabled={readOnly}
                  className="text-sm"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const q = await apiUploadFile<QuizApiDetail>(
                      `/api/quizzes/${slug}/background`,
                      f,
                    );
                    markSaved(q);
                  }}
                />
                {backgroundMediaUrl && !readOnly && (
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-sm"
                    onClick={async () => {
                      const q = await api.delete<QuizApiDetail>(`/api/quizzes/${slug}/background`);
                      if (q) markSaved(q);
                    }}
                  >
                    Supprimer fond
                  </button>
                )}
              </div>
              <label className="mt-4 block text-sm">
                <span>Assombrissement ({backgroundOverlayOpacity} %)</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  disabled={readOnly || !backgroundMediaUrl}
                  className="mt-2 w-full max-w-md disabled:opacity-50"
                  value={backgroundOverlayOpacity}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    updateMetadata({ backgroundOverlayOpacity: value });
                  }}
                  onPointerUp={async (e) => {
                    if (readOnly) return;
                    const value = Number((e.target as HTMLInputElement).value);
                    const q = await api.patch<QuizApiDetail>(`/api/quizzes/${slug}`, {
                      backgroundOverlayOpacity: value,
                    });
                    if (q) markSaved(q);
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'music' && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Musique</h2>
          <p className="mt-3 text-sm text-gray-600">
            La musique d&apos;ambiance est configurée au niveau du cinéma (fichier MP3 sur le NUC).
            La personnalisation musicale par quiz sera disponible prochainement.
          </p>
        </div>
      )}

      {activeTab === 'prizes' && <QuizPrizesTab slug={slug} sponsorId={sponsorId} />}

      {activeTab === 'questions' && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Questions ({items.length})</h2>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={readOnly || structuredLocked}
                title={
                  structuredLocked || readOnly
                    ? 'Disponible uniquement en brouillon'
                    : 'Générer des questions avec l’IA'
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-violet-500 px-3 py-1.5 text-xs font-medium text-violet-700 disabled:opacity-50"
                onClick={() => setAiOpen(true)}
              >
                <Sparkle size={14} weight="fill" />
                Générer avec IA
              </button>
              <button
                type="button"
                disabled={readOnly || structuredLocked}
                title={
                  structuredLocked
                    ? 'Repasse le quiz en brouillon pour modifier ce champ'
                    : undefined
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                onClick={() => addQuestion()}
              >
                <Plus size={14} weight="bold" />
                Ajouter une question
              </button>
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={items.map((q) => q.tempId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="mt-4 space-y-3">
                {items.map((q, qi) => {
                  const expanded = expandedTempId === q.tempId;
                  return (
                    <SortableQRow
                      key={q.tempId}
                      id={q.tempId}
                      dragDisabled={readOnly || structuredLocked}
                      expanded={expanded}
                      onToggle={() => setExpanded(expanded ? null : q.tempId)}
                      title={`${qi + 1}. ${q.text.slice(0, 60)}${q.text.length > 60 ? '…' : ''}`}
                      subtitle={`${q.timeLimitSeconds}s · ${q.pointsMax} pts`}
                    >
                      <div className="space-y-3">
                        <label className="block text-sm">
                          Texte de la question
                          <textarea
                            className="mt-1 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                            disabled={readOnly}
                            rows={3}
                            value={q.text}
                            onChange={(e) => updateQuestion(q.tempId, { text: e.target.value })}
                          />
                        </label>
                        <div className="flex flex-wrap gap-4">
                          {q.imageUrl && (
                            <img
                              src={resolveMediaUrl(q.imageUrl) ?? q.imageUrl}
                              alt=""
                              className="max-h-32 rounded border"
                            />
                          )}
                          <label className="text-sm">
                            Image (optionnelle)
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/svg+xml"
                              disabled={readOnly}
                              className="ml-2"
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (!f || !q.id) return;
                                const res = await apiUploadFile<QuizApiDetail>(
                                  `/api/quizzes/${slug}/questions/${q.id}/image`,
                                  f,
                                );
                                markSaved(res);
                              }}
                            />
                          </label>
                          {q.imageUrl && !readOnly && q.id && (
                            <button
                              type="button"
                              className="rounded border px-2 py-1 text-sm"
                              onClick={async () => {
                                const res = await api.delete<QuizApiDetail>(
                                  `/api/quizzes/${slug}/questions/${q.id}/image`,
                                );
                                if (res) markSaved(res);
                              }}
                            >
                              Supprimer image
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-700">Réponses</p>
                          {(['A', 'B', 'C', 'D'] as const).map((pos) => {
                            const ans = q.answers.find((a) => a.position === pos)!;
                            return (
                              <div key={pos} className="flex items-center gap-2">
                                <span className="w-8 font-mono text-sm">{pos}</span>
                                <input
                                  type="radio"
                                  name={`corr-${q.tempId}`}
                                  checked={ans.isCorrect}
                                  disabled={readOnly || structuredLocked}
                                  title={
                                    structuredLocked
                                      ? 'Repasse en brouillon pour modifier ce champ'
                                      : undefined
                                  }
                                  onChange={() => setCorrectAnswer(q.tempId, pos)}
                                />
                                <input
                                  type="text"
                                  className="flex-1 rounded border px-2 py-1 text-sm disabled:bg-gray-100"
                                  disabled={readOnly}
                                  value={ans.text}
                                  onChange={(e) =>
                                    updateAnswer(q.tempId, pos as AnswerPos, {
                                      text: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <label className="text-sm">
                            Time limit
                            <input
                              type="number"
                              disabled={readOnly || structuredLocked}
                              title={
                                structuredLocked
                                  ? 'Repasse en brouillon pour modifier ce champ'
                                  : undefined
                              }
                              className="ml-2 w-20 rounded border px-2 py-1 text-sm disabled:bg-gray-100"
                              value={q.timeLimitSeconds}
                              onChange={(e) =>
                                updateQuestion(q.tempId, {
                                  timeLimitSeconds: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="text-sm">
                            Points max
                            <input
                              type="number"
                              disabled={readOnly || structuredLocked}
                              className="ml-2 w-24 rounded border px-2 py-1 text-sm disabled:bg-gray-100"
                              title={
                                structuredLocked
                                  ? 'Repasse en brouillon pour modifier ce champ'
                                  : undefined
                              }
                              value={q.pointsMax}
                              onChange={(e) =>
                                updateQuestion(q.tempId, { pointsMax: Number(e.target.value) })
                              }
                            />
                          </label>
                          <label className="text-sm">
                            Points floor
                            <input
                              type="number"
                              disabled={readOnly || structuredLocked}
                              className="ml-2 w-24 rounded border px-2 py-1 text-sm disabled:bg-gray-100"
                              title={
                                structuredLocked
                                  ? 'Repasse en brouillon pour modifier ce champ'
                                  : undefined
                              }
                              value={q.pointsFloor}
                              onChange={(e) =>
                                updateQuestion(q.tempId, { pointsFloor: Number(e.target.value) })
                              }
                            />
                          </label>
                        </div>
                        <label className="block text-sm">
                          Explication
                          <textarea
                            className="mt-1 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                            disabled={readOnly}
                            rows={2}
                            value={q.explanation ?? ''}
                            onChange={(e) =>
                              updateQuestion(q.tempId, {
                                explanation: e.target.value || null,
                              })
                            }
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded border px-3 py-1 text-sm"
                            disabled={readOnly || structuredLocked}
                            onClick={() => duplicateQuestion(q.tempId)}
                          >
                            <Copy size={14} />
                            Dupliquer cette question
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded border border-red-100 px-3 py-1 text-sm text-red-700 disabled:opacity-50"
                            disabled={readOnly || structuredLocked}
                            onClick={() => removeQuestion(q.tempId)}
                          >
                            <Trash size={14} />
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </SortableQRow>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            className="mt-4 w-full rounded border border-dashed py-3 text-sm text-gray-600 disabled:opacity-50"
            disabled={readOnly || structuredLocked}
            onClick={() => addQuestion()}
          >
            + Ajouter une question
          </button>
        </div>
      )}
      <AiGenerateModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onSuccess={() => setAiOkBanner('Quizz généré ! Vérifie et ajuste avant de publier.')}
      />
    </div>
  );
}
