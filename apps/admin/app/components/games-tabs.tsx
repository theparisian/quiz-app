'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GAME_SECTIONS, isPathUnder } from '../../lib/nav-items';

/**
 * Onglets de l'entrée « Jeux » du menu : le catalogue (tous les jeux) et une page par type de
 * jeu. Affichés en haut de chacune de ces pages.
 */
export function GamesTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b" aria-label="Types de jeux">
      {GAME_SECTIONS.map((section) => {
        const active = isPathUnder(pathname, section.href);
        const SectionIcon = section.icon;
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              active
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <SectionIcon size={18} weight={active ? 'fill' : 'regular'} />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
