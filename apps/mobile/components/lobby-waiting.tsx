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
        {myAvatar && <img src={myAvatar} alt="" className="h-32 w-32 rounded-full object-cover" />}

        <div className="text-2xl font-black">{pseudo}</div>
      </div>

      <div className="my-12 flex flex-col items-center gap-4">
        <BreedingRhombusSpinner />
        <WaitingLabel>En attente des autres joueurs</WaitingLabel>
      </div>
    </div>
  );
}
