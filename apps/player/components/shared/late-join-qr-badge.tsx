'use client';

import { StyledQrCode } from '@/components/shared/qr-code';
import { buildJoinUrl } from '@/lib/join-url';

const QR_SIZE = 88;

interface LateJoinQrBadgeProps {
  slugShort: string;
  joinToken: string | null;
}

export default function LateJoinQrBadge({ slugShort, joinToken }: LateJoinQrBadgeProps) {
  const joinUrl = buildJoinUrl({ joinToken, slugShort });

  return (
    <div
      className="pointer-events-none fixed bottom-8 right-8 z-40 flex flex-col items-center"
      aria-hidden
    >
      <p className="mb-0 text-sm font-bold uppercase leading-none tracking-wide text-white">
        Rejoindre
      </p>
      <div className="rounded-2xl bg-white p-4 shadow-lg shadow-black/40">
        <StyledQrCode value={joinUrl} size={QR_SIZE} />
      </div>
    </div>
  );
}
