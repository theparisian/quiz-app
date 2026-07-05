'use client';

import Link from 'next/link';
import { AppLogo } from '@quiz-app/ui';

export default function CheckEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <AppLogo className="mx-auto h-8" />
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
          <svg
            className="h-8 w-8 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Vérifie tes emails</h1>
        <p className="text-sm text-gray-500">
          Un lien de connexion a été envoyé à ton adresse email. Clique dessus pour te connecter.
        </p>
        <p className="text-xs text-gray-400">Le lien expire dans 15 minutes.</p>
        <Link href="/login" className="inline-block text-sm text-blue-600 hover:underline">
          Retour au login
        </Link>
      </div>
    </main>
  );
}
