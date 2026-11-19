'use client';

import type { SponsorDisplay } from '@quiz-app/validation';
import { resolveMediaUrl } from '@/lib/media-url';

type SponsorBadgeSize = 'md' | 'sm';

interface SponsorBadgeProps {
  sponsor: SponsorDisplay;
  /** `md` : lobby et classement ; `sm` : coin de l'écran pendant la manche. */
  size?: SponsorBadgeSize;
  className?: string;
}

const LOGO_HEIGHT: Record<SponsorBadgeSize, string> = { md: 'h-14', sm: 'h-9' };
const NAME_SIZE: Record<SponsorBadgeSize, string> = { md: 'text-2xl', sm: 'text-lg' };

/**
 * « Présenté par » + logo du sponsor (C4). Le logo a une hauteur fixe sur un fond neutre
 * arrondi, pour rester lisible quel que soit le logo ; sans logo, le nom en texte. La couleur
 * de marque n'est jamais utilisée ici (seulement le liseré du carton d'ouverture).
 */
export default function SponsorBadge({ sponsor, size = 'md', className = '' }: SponsorBadgeProps) {
  const logo = resolveMediaUrl(sponsor.logoUrl);
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl bg-black/45 px-4 py-2.5 shadow-lg ring-1 ring-white/15 backdrop-blur-sm ${className}`}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-white/75">
        Présenté par
      </span>
      {logo ? (
        <span className="flex items-center rounded-xl bg-white/95 px-3 py-1.5">
          <img
            src={logo}
            alt={sponsor.name}
            className={`${LOGO_HEIGHT[size]} w-auto max-w-[14rem] object-contain`}
          />
        </span>
      ) : (
        <span className={`${NAME_SIZE[size]} font-bold text-white`}>{sponsor.name}</span>
      )}
    </div>
  );
}
