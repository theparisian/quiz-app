'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/media-url';
import type { PseudoSuggestionsResponse } from '@quiz-app/validation';

interface AvatarOption {
  id: string;
  imageUrl: string;
  label: string | null;
}

interface AvatarsResponse {
  enabled: boolean;
  avatars: AvatarOption[];
}

interface SuggestionCard {
  pseudo: string;
  avatarId: string | null;
  avatarUrl: string | null;
}

interface PseudoInputProps {
  sessionCode: string;
  onSubmit: (
    pseudo: string,
    avatarId: string | null,
    pseudoSource?: 'SUGGESTED' | 'CUSTOM',
  ) => void;
  disabled?: boolean;
}

function pickDistinctAvatars(avatars: AvatarOption[], count: number): AvatarOption[] {
  if (avatars.length === 0) return [];
  const shuffled = [...avatars].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function buildSuggestionCards(pseudos: string[], avatars: AvatarOption[]): SuggestionCard[] {
  const picked = pickDistinctAvatars(avatars, pseudos.length);
  return pseudos.map((pseudo, i) => {
    const avatar = picked[i];
    return {
      pseudo,
      avatarId: avatar?.id ?? null,
      avatarUrl: avatar?.imageUrl ?? null,
    };
  });
}

export default function PseudoInput({ sessionCode, onSubmit, disabled }: PseudoInputProps) {
  const [pseudo, setPseudo] = useState('');
  const [pseudoSource, setPseudoSource] = useState<'SUGGESTED' | 'CUSTOM'>('CUSTOM');
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [avatarsEnabled, setAvatarsEnabled] = useState(false);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [suggestionPseudos, setSuggestionPseudos] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const prefilled = useRef(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(
    () => buildSuggestionCards(suggestionPseudos, avatars),
    [suggestionPseudos, avatars],
  );

  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const data = await api.get<PseudoSuggestionsResponse>(
        `/api/sessions/by-code/${sessionCode}/pseudo-suggestions`,
      );
      setSuggestionPseudos(data.suggestions);
    } catch {
      setSuggestionPseudos([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [sessionCode]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<AvatarsResponse>(`/api/sessions/by-code/${sessionCode}/avatars`)
      .then((data) => {
        if (cancelled) return;
        setAvatarsEnabled(data.enabled);
        setAvatars(data.avatars);
        if (data.enabled && data.avatars.length > 0 && !prefilled.current) {
          prefilled.current = true;
          const random = data.avatars[Math.floor(Math.random() * data.avatars.length)]!;
          setSelectedAvatarId(random.id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvatarsEnabled(false);
          setAvatars([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionCode]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  useEffect(() => {
    if (!popoverOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [popoverOpen]);

  const selectedAvatar = avatars.find((a) => a.id === selectedAvatarId);
  const showAvatar = avatarsEnabled && avatars.length > 0;

  function handleSubmit() {
    if (pseudo.length < 2) return;
    onSubmit(pseudo, selectedAvatarId, pseudoSource);
  }

  function handleAvatarSelect(id: string) {
    setSelectedAvatarId(id);
    setPopoverOpen(false);
  }

  function handlePseudoChange(value: string) {
    setPseudo(value);
    setPseudoSource('CUSTOM');
  }

  function handleSuggestionSelect(card: SuggestionCard) {
    setPseudo(card.pseudo);
    setPseudoSource('SUGGESTED');
    if (card.avatarId) {
      setSelectedAvatarId(card.avatarId);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div ref={popoverRef} className="relative my-6">
        {popoverOpen && showAvatar && (
          <div className="absolute bottom-full left-0 right-0 z-10 mb-3 rounded-2xl bg-white p-4 shadow-xl">
            <div className="grid grid-cols-5 gap-2">
              {avatars.map((a) => {
                const isSelected = a.id === selectedAvatarId;
                const url = resolveMediaUrl(a.imageUrl) ?? a.imageUrl;
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleAvatarSelect(a.id)}
                    aria-pressed={isSelected}
                    aria-label={a.label ?? 'Avatar'}
                    className={`aspect-square overflow-hidden rounded-lg p-0.5 transition-all disabled:opacity-40 ${
                      isSelected ? 'ring-brand-500 ring-2' : 'hover:opacity-80'
                    }`}
                  >
                    <img src={url} alt="" className="h-full w-full rounded-md object-cover" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-full bg-white/10 px-3 py-2 ring-1 ring-white/20">
          {showAvatar && selectedAvatar && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setPopoverOpen((o) => !o)}
              aria-label="Changer d'avatar"
              aria-expanded={popoverOpen}
              className="h-10 w-10 shrink-0 overflow-hidden rounded-full disabled:opacity-40"
            >
              <img
                src={resolveMediaUrl(selectedAvatar.imageUrl) ?? selectedAvatar.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          )}
          <input
            type="text"
            value={pseudo}
            onChange={(e) => handlePseudoChange(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={30}
            placeholder="Ton pseudo..."
            disabled={disabled}
            className="min-w-0 flex-1 bg-transparent py-2 text-lg font-medium text-white placeholder-gray-500 outline-none"
            style={{ fontSize: '18px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pseudo.length >= 2) handleSubmit();
            }}
          />
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
              Ou prends une identité prête
            </span>
            <button
              type="button"
              disabled={disabled || suggestionsLoading}
              onClick={loadSuggestions}
              className="text-brand-400 flex shrink-0 items-center gap-1 text-sm font-medium disabled:opacity-40"
            >
              Autres
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-4 w-4 ${suggestionsLoading ? 'animate-spin' : ''}`}
                aria-hidden
              >
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13" />
                <path d="M21 17v-6h-6" />
                <path d="M3 7a9 9 0 0 0 9 9 9 9 0 0 0 6.69-3L21 11" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {suggestions.map((card) => {
              const isSelected = pseudoSource === 'SUGGESTED' && pseudo === card.pseudo;
              const avatarUrl = card.avatarUrl
                ? (resolveMediaUrl(card.avatarUrl) ?? card.avatarUrl)
                : null;
              return (
                <button
                  key={card.pseudo}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSuggestionSelect(card)}
                  className={`flex flex-col items-center gap-2 rounded-xl bg-white/10 px-2 py-3 text-center transition-all disabled:opacity-40 ${
                    isSelected ? 'ring-brand-500 bg-brand-500/10 ring-2' : 'hover:bg-white/15'
                  }`}
                >
                  {avatarUrl && (
                    <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                  )}
                  <span className="w-full truncate text-sm font-semibold leading-tight">
                    {card.pseudo}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={disabled || pseudo.length < 2}
        className="bg-brand-500 hover:bg-brand-600 rounded-full py-4 text-lg font-semibold text-white transition-colors disabled:opacity-40"
      >
        Jouer
      </button>
    </div>
  );
}
