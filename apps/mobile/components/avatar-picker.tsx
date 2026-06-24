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

interface AvatarPickerProps {
  sessionCode: string;
  selectedId: string | null;
  onChange: (avatarId: string | null) => void;
  disabled?: boolean;
}

/**
 * Sélecteur d'avatar (optionnel). Pré-sélectionne un avatar aléatoire dès le
 * chargement, modifiable par le joueur. Ne s'affiche pas si les avatars sont
 * désactivés sur le quiz ou si la bibliothèque est vide.
 */
export default function AvatarPicker({
  sessionCode,
  selectedId,
  onChange,
  disabled,
}: AvatarPickerProps) {
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [enabled, setEnabled] = useState(false);
  const prefilled = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<AvatarsResponse>(`/api/sessions/by-code/${sessionCode}/avatars`)
      .then((data) => {
        if (cancelled) return;
        setEnabled(data.enabled);
        setAvatars(data.avatars);
        if (data.enabled && data.avatars.length > 0 && !prefilled.current) {
          prefilled.current = true;
          const random = data.avatars[Math.floor(Math.random() * data.avatars.length)]!;
          onChange(random.id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnabled(false);
          setAvatars([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionCode, onChange]);

  if (!enabled || avatars.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-center text-lg text-gray-400">Choisis ton avatar</span>
      <div className="grid max-h-56 grid-cols-4 gap-3 overflow-y-auto px-1 py-1">
        {avatars.map((a) => {
          const isSelected = a.id === selectedId;
          const url = resolveMediaUrl(a.imageUrl) ?? a.imageUrl;
          return (
            <button
              key={a.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(a.id)}
              aria-pressed={isSelected}
              aria-label={a.label ?? 'Avatar'}
              className={`aspect-square overflow-hidden rounded-full transition-all disabled:opacity-40 ${
                isSelected
                  ? 'ring-brand-500 scale-105 ring-4'
                  : 'opacity-70 ring-2 ring-white/15 hover:opacity-100'
              }`}
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
