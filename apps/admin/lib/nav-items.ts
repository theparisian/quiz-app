import {
  type Icon,
  AddressBook,
  ChartBar,
  ChartBarHorizontal,
  EnvelopeSimple,
  FilmSlate,
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

export type NavItem = { href: string; label: string; icon: Icon };

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: Gauge },
  { href: '/cinemas', label: 'Cinémas', icon: FilmSlate },
  { href: '/invitations', label: 'Invitations', icon: EnvelopeSimple },
  { href: '/games', label: 'Catalogue', icon: Storefront },
  { href: '/quizzes', label: 'Quizz', icon: SealQuestion },
  { href: '/polls', label: 'Sondages', icon: ChartBarHorizontal },
  { href: '/burgers', label: 'Burger express', icon: Hamburger },
  { href: '/reports', label: 'Rapports', icon: ChartBar },
  { href: '/ai/usage', label: 'IA', icon: Sparkle },
  { href: '/sponsors', label: 'Sponsors', icon: Megaphone },
  { href: '/statements', label: 'Relevés', icon: Receipt },
  { href: '/contacts', label: 'Contacts', icon: AddressBook },
  { href: '/avatars', label: 'Avatars', icon: Smiley },
  { href: '/audio', label: 'Audio', icon: MusicNotes },
];

export function getNavItem(href: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.href === href);
}
