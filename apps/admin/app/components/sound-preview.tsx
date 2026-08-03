'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from '@phosphor-icons/react';
import { resolveMediaUrl } from '../../lib/media-url';

interface SoundPreviewProps {
  audioUrl: string;
  label?: string;
  className?: string;
}

/** Écoute rapide d'un son dans l'admin. Un seul élément audio par bouton. */
export function SoundPreview({ audioUrl, label, className }: SoundPreviewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  function toggle() {
    const src = resolveMediaUrl(audioUrl);
    if (!src) return;

    if (!audioRef.current) {
      const el = new Audio(src);
      el.addEventListener('ended', () => setPlaying(false));
      audioRef.current = el;
    }

    const el = audioRef.current;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    el.currentTime = 0;
    void el
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? `Arrêter ${label ?? 'le son'}` : `Écouter ${label ?? 'le son'}`}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:border-blue-300 hover:text-blue-700 ${className ?? ''}`}
    >
      {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
    </button>
  );
}
