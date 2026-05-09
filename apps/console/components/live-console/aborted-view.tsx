'use client';

import Link from 'next/link';
import { useLiveSessionStore } from '@/lib/stores/live-session-store';

interface AbortedViewProps {
  screenId: string | null;
}

export function AbortedView({ screenId }: AbortedViewProps) {
  const abortReason = useLiveSessionStore((s) => s.abortReason);

  return (
    <div className="flex flex-col items-center gap-6 py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-900">Session abandonnée</h2>
      {abortReason && <p className="text-sm text-gray-600">Raison : &quot;{abortReason}&quot;</p>}
      <Link
        href={screenId ? `/screens/${screenId}` : '/dashboard'}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Retour à la salle
      </Link>
    </div>
  );
}
