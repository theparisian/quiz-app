'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, apiUploadFile } from '../../lib/api';
import { useQuizEditorStore, type AiGeneratedQuestion } from '../../lib/quiz-editor-store';

const LOADING_MSGS = [
  'Analyse du synopsis…',
  'Préparation des questions…',
  'Génération des réponses…',
  'Validation de la cohérence…',
  'Presque prêt…',
];

type Toast = { kind: 'ok' | 'err'; message: string };

export function AiGenerateModal(props: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const quizType = useQuizEditorStore((s) => s.type);
  const existingCount = useQuizEditorStore((s) => s.questions.length);
  const replaceQuestions = useQuizEditorStore((s) => s.replaceQuestions);
  const appendQuestions = useQuizEditorStore((s) => s.appendQuestions);

  const [sourceText, setSourceText] = useState('');
  const [contextHint, setContextHint] = useState('');
  const [numQuestions, setNumQuestions] = useState(8);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [tone, setTone] = useState<'serious' | 'casual' | 'humorous'>('serious');
  const [language, setLanguage] = useState<'fr' | 'en'>('fr');
  const [type, setType] = useState<'standard' | 'sponsored' | 'custom'>('standard');
  const [includeExplanations, setIncludeExplanations] = useState(false);
  const [highQuality, setHighQuality] = useState(false);
  const [mode, setMode] = useState<'replace' | 'append'>('append');
  const [files, setFiles] = useState<{ id: string; file: File; preview?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.open) {
      setType(quizType);
      setMode(existingCount === 0 ? 'replace' : 'append');
    }
  }, [props.open, quizType, existingCount]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % LOADING_MSGS.length), 3000);
    return () => clearInterval(t);
  }, [loading]);

  const opusHint = useMemo(() => '≈ 0,15–0,50 € par génération (estimation)', []);

  const appendDisabled = existingCount === 0;

  async function uploadImages(): Promise<string[]> {
    const urls: string[] = [];
    for (const item of files) {
      const res = await apiUploadFile<{ url: string }>(`/api/ai/input-image/${item.id}`, item.file);
      urls.push(res.url);
    }
    return urls;
  }

  async function onSubmit(): Promise<void> {
    if (sourceText.trim().length < 50) {
      setToast({ kind: 'err', message: 'Le texte source doit faire au moins 50 caractères.' });
      return;
    }
    setLoading(true);
    setMsgIdx(0);
    try {
      const imageUrls = await uploadImages();
      const body = {
        sourceText,
        numQuestions,
        difficulty,
        tone,
        language,
        contextHint: contextHint.trim() || null,
        includeExplanations,
        type,
        imageUrls,
        model: highQuality ? 'claude-opus-4-7' : 'claude-sonnet-4-6',
      };
      const result = await api.post<{
        generationId: string;
        quiz: { questions: AiGeneratedQuestion[] };
      }>('/api/ai/generate-quiz', body);
      const qs = result.quiz.questions;
      if (mode === 'replace' || existingCount === 0) {
        replaceQuestions(qs);
      } else {
        appendQuestions(qs);
      }
      props.onSuccess?.();
      props.onClose();
    } catch (e: unknown) {
      const err = e as Error & { status?: number; details?: { resetAt?: string | null } };
      const code = (e as Error & { code?: string }).code;
      if (err.status === 429) {
        const r = err.details?.resetAt;
        setToast({
          kind: 'err',
          message: `Limite atteinte.${r ? ` Réessayez après ${r}.` : ''}`,
        });
      } else if (err.status === 422 || code === 'AI_REFUSED') {
        setToast({ kind: 'err', message: 'Le modèle a refusé. Reformule ta demande.' });
      } else if (err.status === 504 || code === 'AI_TIMEOUT') {
        setToast({ kind: 'err', message: 'Trop long, réessaie.' });
      } else if (
        err.status === 502 ||
        code === 'AI_INVALID_OUTPUT' ||
        code === 'AI_PROVIDER_ERROR'
      ) {
        setToast({ kind: 'err', message: 'Erreur du fournisseur IA, réessaie plus tard.' });
      } else {
        setToast({ kind: 'err', message: err.message || 'Erreur inattendue.' });
      }
    } finally {
      setLoading(false);
    }
  }

  function onPickFiles(list: FileList | null): void {
    if (!list?.length) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= 5) break;
      const id = crypto.randomUUID();
      next.push({ id, file: f, preview: URL.createObjectURL(f) });
    }
    setFiles(next);
  }

  function removeFile(id: string): void {
    setFiles((prev) => {
      const x = prev.find((p) => p.id === id);
      if (x?.preview) URL.revokeObjectURL(x.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-white shadow-xl">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/90">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="text-sm font-medium text-gray-800">{LOADING_MSGS[msgIdx]}</p>
          </div>
        )}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900">✨ Générer avec IA</h2>
          <button
            type="button"
            className="text-2xl leading-none text-gray-500 hover:text-gray-900"
            onClick={() => !loading && props.onClose()}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        <div className="space-y-4 p-4">
          {toast && (
            <div
              className={`rounded-md px-3 py-2 text-sm ${
                toast.kind === 'ok' ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'
              }`}
            >
              {toast.message}
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-gray-800">Mode</p>
            <div className="mt-2 space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="ai-mode"
                  checked={mode === 'replace'}
                  disabled={loading}
                  onChange={() => setMode('replace')}
                />
                Remplacer le contenu actuel
              </label>
              <label className={`flex items-center gap-2 ${appendDisabled ? 'opacity-50' : ''}`}>
                <input
                  type="radio"
                  name="ai-mode"
                  checked={mode === 'append'}
                  disabled={loading || appendDisabled}
                  onChange={() => setMode('append')}
                />
                Ajouter aux questions existantes
              </label>
            </div>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-gray-800">Texte source *</span>
            <textarea
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              rows={8}
              value={sourceText}
              disabled={loading}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Colle ici un synopsis, une fiche film, des notes…"
            />
            <span className="text-xs text-gray-500">{sourceText.length}/50000</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-800">Contexte additionnel (optionnel)</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={contextHint}
              disabled={loading}
              onChange={(e) => setContextHint(e.target.value)}
              placeholder="Ex. sortie Dune 2"
            />
          </label>
          <div>
            <p className="text-sm font-medium text-gray-800">
              Images de référence (optionnel, max 5)
            </p>
            <button
              type="button"
              className="mt-2 w-full cursor-pointer rounded border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onPickFiles(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
            >
              Glisser-déposer ou cliquer pour ajouter
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                multiple
                className="hidden"
                onChange={(e) => onPickFiles(e.target.files)}
              />
            </button>
            <div className="mt-2 flex flex-wrap gap-2">
              {files.map((f) => (
                <div key={f.id} className="relative h-16 w-16 overflow-hidden rounded border">
                  <img src={f.preview ?? ''} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-0 top-0 bg-black/60 px-1 text-xs text-white"
                    onClick={() => removeFile(f.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded border bg-gray-50 p-3 text-sm">
            <p className="mb-2 font-medium text-gray-800">Paramètres</p>
            <label className="flex flex-col gap-1">
              <span>Nombre de questions : {numQuestions}</span>
              <input
                type="range"
                min={3}
                max={15}
                value={numQuestions}
                disabled={loading}
                onChange={(e) => setNumQuestions(Number(e.target.value))}
              />
            </label>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-gray-600">Difficulté</span>
                <select
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  value={difficulty}
                  disabled={loading}
                  onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                >
                  <option value="easy">Facile</option>
                  <option value="medium">Moyen</option>
                  <option value="hard">Difficile</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-600">Ton</span>
                <select
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  value={tone}
                  disabled={loading}
                  onChange={(e) => setTone(e.target.value as typeof tone)}
                >
                  <option value="serious">Sérieux</option>
                  <option value="casual">Décontracté</option>
                  <option value="humorous">Humoristique</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-600">Langue</span>
                <select
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  value={language}
                  disabled={loading}
                  onChange={(e) => setLanguage(e.target.value as typeof language)}
                >
                  <option value="fr">Français</option>
                  <option value="en">Anglais</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-600">Type de quiz</span>
                <select
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  value={type}
                  disabled={loading}
                  onChange={(e) => setType(e.target.value as typeof type)}
                >
                  <option value="standard">Standard</option>
                  <option value="sponsored">Sponsorisé</option>
                  <option value="custom">Personnalisé</option>
                </select>
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeExplanations}
                disabled={loading}
                onChange={(e) => setIncludeExplanations(e.target.checked)}
              />
              Inclure les explications
            </label>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={highQuality}
                disabled={loading}
                onChange={(e) => setHighQuality(e.target.checked)}
              />
              Qualité supérieure (Opus, plus lent et plus cher)
            </label>
            {highQuality && <p className="mt-1 text-xs text-gray-500">{opusHint}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t pt-3">
            <button
              type="button"
              className="rounded border px-4 py-2 text-sm"
              disabled={loading}
              onClick={() => props.onClose()}
            >
              Annuler
            </button>
            <button
              type="button"
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={loading || sourceText.trim().length < 50}
              onClick={() => void onSubmit()}
            >
              Générer le quizz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
