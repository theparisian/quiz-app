import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shh!',
  description: 'Jouez au quizz cinéma depuis votre téléphone !',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Shh!',
  },
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
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
