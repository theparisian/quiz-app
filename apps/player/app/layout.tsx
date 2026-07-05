import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shh! — Écran Cinéma',
  description: 'Écran cinéma Shh!',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="h-screen w-screen overflow-hidden bg-black text-white antialiased">
        {children}
      </body>
    </html>
  );
}
