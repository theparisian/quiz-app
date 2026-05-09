'use client';

import { useNucStore } from '@/lib/stores/nuc-store';
import QrCode from '@/components/shared/qr-code';
import PlayerPill from '@/components/shared/player-pill';

const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL || 'https://play.demo.uxii.fr';

export default function LobbyState() {
  const slugShort = useNucStore((s) => s.slugShort);
  const players = useNucStore((s) => s.players);
  const totalPlayers = useNucStore((s) => s.totalPlayers);
  const cinemaLogoUrl = useNucStore((s) => s.cinemaLogoUrl);
  const cinemaName = useNucStore((s) => s.cinemaName);

  return (
    <div className="flex h-full flex-col px-16 py-12">
      <h1 className="mb-8 text-center text-[clamp(36px,4vw,72px)] font-bold">
        Rejoignez le quiz !
      </h1>

      <div className="flex flex-1 items-start justify-center gap-16">
        <div className="flex flex-col items-center gap-6">
          <QrCode value={`${PLAY_URL}/?s=${slugShort}`} size={320} />
          <div className="text-xl text-gray-400">
            Scannez le QR ou tapez le code sur{' '}
            <span className="font-semibold text-white">play.demo.uxii.fr</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="text-2xl text-gray-400">Code session</div>
          <div className="rounded-2xl bg-white/10 px-12 py-6 text-[clamp(80px,14vw,200px)] font-black tabular-nums tracking-widest">
            {slugShort}
          </div>
        </div>
      </div>

      <div className="mt-auto">
        <div className="mb-4 text-xl text-gray-400">Joueurs ({totalPlayers})</div>
        <div className="flex flex-wrap gap-3">
          {players.map((p, i) => (
            <PlayerPill key={p.playerId} pseudo={p.pseudo} index={i} />
          ))}
        </div>
      </div>

      {(cinemaLogoUrl || cinemaName) && (
        <div className="absolute bottom-8 right-8">
          {cinemaLogoUrl ? (
            <img src={cinemaLogoUrl} alt="" className="h-12 opacity-60" />
          ) : (
            <span className="text-sm text-gray-600">{cinemaName}</span>
          )}
        </div>
      )}
    </div>
  );
}
