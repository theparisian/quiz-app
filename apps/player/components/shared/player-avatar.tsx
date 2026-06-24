'use client';

import { resolveMediaUrl } from '@/lib/media-url';

interface PlayerAvatarProps {
  avatarUrl: string | null | undefined;
  pseudo: string;
  /** Taille en pixels (carré). */
  size: number;
  className?: string;
}

/**
 * Avatar rond du joueur. Affiche l'image (PNG transparent 512x512 redimensionné)
 * ou un fallback avec l'initiale du pseudo si aucun avatar n'est défini.
 */
export default function PlayerAvatar({ avatarUrl, pseudo, size, className }: PlayerAvatarProps) {
  const resolved = resolveMediaUrl(avatarUrl);
  const initial = pseudo.trim().charAt(0).toUpperCase() || '?';

  if (!resolved) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white/15 font-bold text-white ${className ?? ''}`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        aria-hidden
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={resolved}
      alt=""
      className={`inline-block shrink-0 rounded-full object-cover ${className ?? ''}`}
      style={{ width: size, height: size }}
    />
  );
}
