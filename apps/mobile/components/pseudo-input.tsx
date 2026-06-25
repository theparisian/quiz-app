'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/media-url';

interface AvatarOption {
  id: string;
  imageUrl: string;
  label: string | null;
}

interface AvatarsResponse {
  enabled: boolean;
  avatars: AvatarOption[];
}

interface PseudoInputProps {
  sessionCode: string;
  onSubmit: (pseudo: string, avatarId: string | null) => void;
  disabled?: boolean;
}

export default function PseudoInput({ sessionCode, onSubmit, disabled }: PseudoInputProps) {
  const [pseudo, setPseudo] = useState('');
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [avatarsEnabled, setAvatarsEnabled] = useState(false);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const prefilled = useRef(false);
  const popoverRef = useRef<HTMLDivElement>(null);

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
    onSubmit(pseudo, selectedAvatarId);
  }

  function handleAvatarSelect(id: string) {
    setSelectedAvatarId(id);
    setPopoverOpen(false);
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div ref={popoverRef} className="relative">
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
            onChange={(e) => setPseudo(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={30}
            placeholder="Pseudo..."
            disabled={disabled}
            className="min-w-0 flex-1 bg-transparent py-2 text-lg font-medium text-white placeholder-gray-500 outline-none"
            style={{ fontSize: '18px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pseudo.length >= 2) handleSubmit();
            }}
          />
        </div>
      </div>

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
