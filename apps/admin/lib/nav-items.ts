import {
  type Icon,
  ChartBar,
  EnvelopeSimple,
  FilmSlate,
  Gauge,
  Megaphone,
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
  { href: '/reports', label: 'Rapports', icon: ChartBar },
  { href: '/ai/usage', label: 'IA', icon: Sparkle },
  { href: '/sponsors', label: 'Sponsors', icon: Megaphone },
  { href: '/avatars', label: 'Avatars', icon: Smiley },
];

export function getNavItem(href: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.href === href);
}
