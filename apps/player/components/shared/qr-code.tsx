'use client';

import { QRCodeSVG } from 'qrcode.react';

interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
  caption?: string;
}

export default function QrCode({ value, size = 320, className, caption }: QrCodeProps) {
  return (
    <div
      className={`flex w-full flex-col items-center gap-3 rounded-2xl bg-white px-4 py-4 ${className ?? ''}`}
    >
      {caption && (
        <p className="max-w-[14rem] text-center text-xs font-medium leading-snug text-gray-800">
          {caption}
        </p>
      )}
      <QRCodeSVG value={value} size={size} level="M" />
    </div>
  );
}
