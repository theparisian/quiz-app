import {
  type Icon,
  AddressBook,
  ChartBar,
  Books,
  ChartBarHorizontal,
  EnvelopeSimple,
  FilmSlate,
  GameController,
  Hamburger,
  Gauge,
  Megaphone,
  MusicNotes,
  Receipt,
  SealQuestion,
  Smiley,
  Sparkle,
  Storefront,
} from '@phosphor-icons/react';

export type NavItem = {
  href: string;
  label: string;
  icon: Icon;
  /** Autres chemins qui allument cette entrée du menu (ses sous-pages). */
  match?: string[];
};

/**
 * Sous-pages de l'entrée « Jeux » : le catalogue (tous les jeux) puis une page par type de jeu.
 * Affichées en onglets en haut de chacune (`GamesTabs`). Ajouter un type de jeu : une ligne ici.
 */
export const GAME_SECTIONS: NavItem[] = [
  { href: '/games', label: 'Tous les jeux', icon: Storefront },
  { href: '/quizzes', label: 'Quiz', icon: SealQuestion },
  { href: '/polls', label: 'Sondages', icon: ChartBarHorizontal },
  { href: '/burgers', label: 'Burger express', icon: Hamburger },
  { href: '/towers', label: 'Tour de livres', icon: Books },
];

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: Gauge },
  { href: '/cinemas', label: 'Cinémas', icon: FilmSlate },
  { href: '/invitations', label: 'Invitations', icon: EnvelopeSimple },
  {
    href: '/games',
    label: 'Jeux',
    icon: GameController,
    match: GAME_SECTIONS.map((section) => section.href),
  },
  { href: '/reports', label: 'Rapports', icon: ChartBar },
  { href: '/ai/usage', label: 'IA', icon: Sparkle },
  { href: '/sponsors', label: 'Sponsors', icon: Megaphone },
  { href: '/statements', label: 'Relevés', icon: Receipt },
  { href: '/contacts', label: 'Contacts', icon: AddressBook },
  { href: '/avatars', label: 'Avatars', icon: Smiley },
  { href: '/audio', label: 'Audio', icon: MusicNotes },
];

/** L'entrée du menu ou la sous-page de jeux de ce chemin (icône des en-têtes de page). */
export function getNavItem(href: string): NavItem | undefined {
  return (
    GAME_SECTIONS.find((item) => item.href === href) ?? NAV_ITEMS.find((item) => item.href === href)
  );
}

/** `pathname` est `href` ou l'une de ses sous-pages. */
export function isPathUnder(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** L'entrée du menu est active pour ce chemin (elle-même ou l'une de ses sous-pages). */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.match ?? [])].some((href) => isPathUnder(pathname, href));
}
