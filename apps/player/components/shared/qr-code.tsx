'use client';

import { QRCodeSVG } from 'qrcode.react';

interface QrCodeProps {
  value: string;
  size?: number;
}

export default function QrCode({ value, size = 320 }: QrCodeProps) {
  return (
    <div className="rounded-2xl bg-white p-6">
      <QRCodeSVG value={value} size={size} level="M" />
    </div>
  );
}
