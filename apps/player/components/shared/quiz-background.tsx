'use client';

import { useNucStore } from '@/lib/stores/nuc-store';
import { resolveMediaUrl } from '@/lib/media-url';

export default function QuizBackground() {
  const mediaUrl = useNucStore((s) => s.quizBackgroundMediaUrl);
  const mediaType = useNucStore((s) => s.quizBackgroundMediaType);
  const overlayOpacity = useNucStore((s) => s.quizBackgroundOverlayOpacity);

  const url = resolveMediaUrl(mediaUrl);
  if (!url || !mediaType) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      {mediaType === 'video' ? (
        <video src={url} autoPlay loop muted playsInline className="h-full w-full object-cover" />
      ) : (
        <img src={url} alt="" className="h-full w-full object-cover" />
      )}
      {overlayOpacity > 0 && (
        <div className="absolute inset-0 bg-black" style={{ opacity: overlayOpacity / 100 }} />
      )}
    </div>
  );
}
