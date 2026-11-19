'use client';

import { useParams } from 'next/navigation';
import { usePlayerSession } from '@/hooks/use-player-session';
import { ConnectionBanner } from '@/components/connection-banner';
import PlayerScreen from '@/components/player-screen';

export default function PlayPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { socket } = usePlayerSession(sessionId);

  return (
    <div className="flex min-h-screen flex-col">
      <ConnectionBanner />
      <PlayerScreen socket={socket} />
    </div>
  );
}
