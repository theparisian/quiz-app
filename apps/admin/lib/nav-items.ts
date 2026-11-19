import {
  type Icon,
  ChartBar,
  ChartBarHorizontal,
  EnvelopeSimple,
  FilmSlate,
  Gauge,
  Megaphone,
  MusicNotes,
  SealQuestion,
  Smiley,
  Sparkle,
} from '@phosphor-icons/react';

export type NavItem = { href: string; label: string; icon: Icon };

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: Gauge },
  { href: '/cinemas', label: 'Cinémas', icon: FilmSlate },
  { href: '/invitations', label: 'Invitations', icon: EnvelopeSimple },
  { href: '/quizzes', label: 'Quizz', icon: SealQuestion },
  { href: '/polls', label: 'Sondages', icon: ChartBarHorizontal },
  { href: '/reports', label: 'Rapports', icon: ChartBar },
  { href: '/ai/usage', label: 'IA', icon: Sparkle },
  { href: '/sponsors', label: 'Sponsors', icon: Megaphone },
  { href: '/avatars', label: 'Avatars', icon: Smiley },
  { href: '/audio', label: 'Audio', icon: MusicNotes },
];

export function getNavItem(href: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.href === href);
}
