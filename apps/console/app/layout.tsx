import type { Metadata } from 'next';
import { QueryProvider } from '../lib/query-provider';
import { AuthProvider } from '../lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shh! — Console',
  description: 'Console projectionniste Shh!',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
