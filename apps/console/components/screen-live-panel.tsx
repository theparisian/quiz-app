'use client';

import { useEffect, useState } from 'react';
import { SessionLauncher } from '@/components/session-launcher';
import { LiveConsole } from '@/components/live-console/live-console';

interface ScreenLivePanelProps {
  screenId: string;
  liveSessionId: string | null;
}

export function ScreenLivePanel({ screenId, liveSessionId }: ScreenLivePanelProps) {
  const [sessionId, setSessionId] = useState<string | null>(liveSessionId);

  useEffect(() => {
    if (liveSessionId) setSessionId(liveSessionId);
  }, [liveSessionId]);

  if (!sessionId) {
    return <SessionLauncher screenId={screenId} onLaunched={setSessionId} />;
  }

  return (
    <LiveConsole
      key={sessionId}
      sessionId={sessionId}
      screenId={screenId}
      onExit={() => setSessionId(null)}
      exitLabel="Nouvelle session"
    />
  );
}
