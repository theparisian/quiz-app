'use client';

import { useEffect, useState } from 'react';
import { useNucStore } from '@/lib/stores/nuc-store';
import { preloadBackground, playBackground } from '@/lib/audio';

export default function IdleState() {
  const cinemaName = useNucStore((s) => s.cinemaName);
  const cinemaLogoUrl = useNucStore((s) => s.cinemaLogoUrl);
  const backgroundMusicUrl = useNucStore((s) => s.backgroundMusicUrl);
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setTime(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      setDate(
        now.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (backgroundMusicUrl) {
      preloadBackground(backgroundMusicUrl);
      playBackground();
    }
  }, [backgroundMusicUrl]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      {cinemaLogoUrl ? (
        <img
          src={cinemaLogoUrl}
          alt={cinemaName ?? 'Cinéma'}
          className="max-h-[30vh] max-w-[60vw] object-contain"
        />
      ) : (
        <div className="font-title text-[clamp(48px,8vw,120px)] tracking-tight">
          {cinemaName ?? 'Cinéma'}
        </div>
      )}

      <div className="text-2xl text-gray-400">En attente de la prochaine session</div>

      <div className="mt-8 text-center">
        <div className="text-[clamp(48px,6vw,96px)] font-light tabular-nums">{time}</div>
        <div className="text-2xl capitalize text-gray-500">{date}</div>
      </div>
    </div>
  );
}
