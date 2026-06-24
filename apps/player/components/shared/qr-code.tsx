'use client';

import { QRCodeSVG } from 'qrcode.react';

interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
}

export default function QrCode({ value, size = 320, className }: QrCodeProps) {
  return (
    <div className={`rounded-2xl bg-white p-4 ${className ?? ''}`}>
      <QRCodeSVG value={value} size={size} level="M" />
    </div>
  );
}
