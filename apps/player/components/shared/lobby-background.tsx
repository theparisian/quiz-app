'use client';

import { useNucStore } from '@/lib/stores/nuc-store';
import MediaBackground from '@/components/shared/media-background';

export default function LobbyBackground() {
  const mediaUrl = useNucStore((s) => s.lobbyBackgroundMediaUrl);
  const mediaType = useNucStore((s) => s.lobbyBackgroundMediaType);
  const overlayOpacity = useNucStore((s) => s.lobbyBackgroundOverlayOpacity);

  return (
    <MediaBackground mediaUrl={mediaUrl} mediaType={mediaType} overlayOpacity={overlayOpacity} />
  );
}
