'use client';

import { useEffect, useRef } from 'react';
import QRCodeStyling from 'qr-code-styling';

interface StyledQrCodeProps {
  value: string;
  size?: number;
  className?: string;
}

/** QR code stylisé (modules arrondis) — sans conteneur. */
export function StyledQrCode({ value, size = 320, className }: StyledQrCodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const options = {
      width: size,
      height: size,
      type: 'svg' as const,
      data: value,
      margin: 0,
      qrOptions: {
        errorCorrectionLevel: 'M' as const,
      },
      dotsOptions: {
        color: '#000000',
        type: 'rounded' as const,
      },
      cornersSquareOptions: {
        color: '#000000',
        type: 'extra-rounded' as const,
      },
      cornersDotOptions: {
        color: '#000000',
        type: 'dot' as const,
      },
      backgroundOptions: {
        color: 'transparent',
      },
    };

    if (!qrRef.current) {
      qrRef.current = new QRCodeStyling(options);
      container.replaceChildren();
      qrRef.current.append(container);
    } else {
      qrRef.current.update(options);
    }
  }, [value, size]);

  return <div ref={containerRef} className={`leading-none [&_svg]:block ${className ?? ''}`} />;
}

interface QrCodeProps extends StyledQrCodeProps {
  caption?: React.ReactNode;
  captionClassName?: string;
}

/** QR code dans un encart blanc, avec légende optionnelle (lobby). */
export default function QrCode({
  value,
  size = 320,
  className,
  caption,
  captionClassName,
}: QrCodeProps) {
  return (
    <div
      className={`flex w-full flex-col items-center gap-3 rounded-2xl bg-white px-4 py-4 ${className ?? ''}`}
    >
      {caption && (
        <p
          className={
            captionClassName ??
            'max-w-[14rem] text-center text-xs font-medium leading-snug text-gray-800'
          }
        >
          {caption}
        </p>
      )}
      <StyledQrCode value={value} size={size} />
    </div>
  );
}
