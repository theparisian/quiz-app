'use client';

import { useNucStore } from '@/lib/stores/nuc-store';
import MediaBackground from '@/components/shared/media-background';

export default function QuizBackground() {
  const mediaUrl = useNucStore((s) => s.quizBackgroundMediaUrl);
  const mediaType = useNucStore((s) => s.quizBackgroundMediaType);
  const overlayOpacity = useNucStore((s) => s.quizBackgroundOverlayOpacity);

  return (
    <MediaBackground mediaUrl={mediaUrl} mediaType={mediaType} overlayOpacity={overlayOpacity} />
  );
}
