'use client';

import { StyledQrCode } from '@/components/shared/qr-code';

const MOBILE_URL =
  process.env.NEXT_PUBLIC_MOBILE_URL || process.env.NEXT_PUBLIC_PLAY_URL || 'http://localhost:3002';

const QR_SIZE = 88;

interface LateJoinQrBadgeProps {
  slugShort: string;
}

export default function LateJoinQrBadge({ slugShort }: LateJoinQrBadgeProps) {
  const joinUrl = `${MOBILE_URL}/?s=${slugShort}`;

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
