'use client';

import { StyledQrCode } from '@/components/shared/qr-code';

const MOBILE_URL =
  process.env.NEXT_PUBLIC_MOBILE_URL || process.env.NEXT_PUBLIC_PLAY_URL || 'http://localhost:3002';

const QR_SIZE = 88;
const BADGE_SIZE = 148;

interface LateJoinQrBadgeProps {
  slugShort: string;
}

export default function LateJoinQrBadge({ slugShort }: LateJoinQrBadgeProps) {
  const joinUrl = `${MOBILE_URL}/?s=${slugShort}`;
  const arcPath = `M 22,${BADGE_SIZE * 0.58} A ${BADGE_SIZE * 0.36},${BADGE_SIZE * 0.36} 0 0,1 ${BADGE_SIZE - 22},${BADGE_SIZE * 0.58}`;

  return (
    <div
      className="pointer-events-none fixed bottom-8 right-8 z-40"
      style={{ width: BADGE_SIZE, height: BADGE_SIZE }}
      aria-hidden
    >
      <svg
        width={BADGE_SIZE}
        height={BADGE_SIZE}
        viewBox={`0 0 ${BADGE_SIZE} ${BADGE_SIZE}`}
        className="absolute inset-0 overflow-visible"
      >
        <defs>
          <path id="late-join-arc" d={arcPath} fill="none" />
        </defs>
        <text
          fill="white"
          fontSize="11"
          fontWeight="700"
          letterSpacing="0.22em"
          className="uppercase"
        >
          <textPath href="#late-join-arc" startOffset="50%" textAnchor="middle">
            Rejoindre
          </textPath>
        </text>
      </svg>

      <div className="absolute left-1/2 top-[54%] -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-2xl bg-white p-4 shadow-lg shadow-black/40">
          <StyledQrCode value={joinUrl} size={QR_SIZE} />
        </div>
      </div>
    </div>
  );
}
