'use client';

import BreedingRhombusSpinner from '@/components/breeding-rhombus-spinner';
import { usePlayerStore } from '@/lib/stores/player-store';
import { resolveMediaUrl } from '@/lib/media-url';

export default function LobbyWaiting() {
  const pseudo = usePlayerStore((s) => s.pseudo);
  const avatarUrl = usePlayerStore((s) => s.avatarUrl);
  const myAvatar = resolveMediaUrl(avatarUrl);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
      {myAvatar && (
        <img
          src={myAvatar}
          alt=""
          className="ring-brand-500/50 h-24 w-24 rounded-full object-cover ring-4"
        />
      )}

      <div className="text-xl font-bold">{pseudo}</div>

      <div className="flex flex-col items-center gap-4">
        <BreedingRhombusSpinner />
        <div className="text-gray-400">En attente des autres joueurs</div>
      </div>
    </div>
  );
}
