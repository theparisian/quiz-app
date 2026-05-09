import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quiz Cinéma',
  description: 'Jouez au quiz cinéma depuis votre téléphone !',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Quiz Cinéma',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#1a1a2e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body
        className="min-h-screen bg-gray-950 text-white antialiased"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {children}
      </body>
    </html>
  );
}
