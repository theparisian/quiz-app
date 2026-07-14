'use client';

import BreedingRhombusSpinner from '@/components/breeding-rhombus-spinner';
import WaitingLabel from '@/components/waiting-label';
import { usePlayerStore } from '@/lib/stores/player-store';
import { resolveMediaUrl } from '@/lib/media-url';

export default function LobbyWaiting() {
  const pseudo = usePlayerStore((s) => s.pseudo);
  const avatarUrl = usePlayerStore((s) => s.avatarUrl);
  const myAvatar = resolveMediaUrl(avatarUrl);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="flex flex-col items-center gap-2">
        {myAvatar && <img src={myAvatar} alt="" className="h-40 w-40 rounded-full object-cover" />}

        <div className="text-2xl font-black">{pseudo}</div>
      </div>

      <div className="my-20 flex flex-col items-center">
        <BreedingRhombusSpinner />
        <WaitingLabel className="mt-10 text-gray-400">En attente des joueurs</WaitingLabel>
      </div>
    </div>
  );
}
