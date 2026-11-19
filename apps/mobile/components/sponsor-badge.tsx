'use client';

import type { SponsorDisplay } from '@quiz-app/validation';
import { resolveMediaUrl } from '@/lib/media-url';

interface SponsorBadgeProps {
  sponsor: SponsorDisplay;
  /** `badge` : lobby et écran final ; `banner` : bandeau fin en bas pendant la manche. */
  variant?: 'badge' | 'banner';
}

/**
 * « Présenté par » + logo du sponsor (C4). Logo à hauteur fixe sur un fond neutre arrondi
 * (lisible quel que soit le logo) ; sans logo, le nom en texte. La couleur de marque n'est
 * jamais utilisée pour le texte ni pour les boutons.
 */
export default function SponsorBadge({ sponsor, variant = 'badge' }: SponsorBadgeProps) {
  const logo = resolveMediaUrl(sponsor.logoUrl);

  if (variant === 'banner') {
    return (
      <div className="flex shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-black/40 px-4 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Présenté par
        </span>
        {logo ? (
          <span className="flex items-center rounded-md bg-white/95 px-2 py-0.5">
            <img src={logo} alt={sponsor.name} className="h-5 w-auto max-w-[8rem] object-contain" />
          </span>
        ) : (
          <span className="text-xs font-semibold text-white">{sponsor.name}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-2 px-6 pb-8">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Présenté par
      </span>
      {logo ? (
        <span className="flex items-center rounded-xl bg-white/95 px-4 py-2">
          <img src={logo} alt={sponsor.name} className="h-10 w-auto max-w-[12rem] object-contain" />
        </span>
      ) : (
        <span className="text-lg font-bold text-white">{sponsor.name}</span>
      )}
    </div>
  );
}
