'use client';

import { useNucStore } from '@/lib/stores/nuc-store';
import QrCode from '@/components/shared/qr-code';
import PlayerPill from '@/components/shared/player-pill';

const MOBILE_URL =
  process.env.NEXT_PUBLIC_MOBILE_URL || process.env.NEXT_PUBLIC_PLAY_URL || 'http://localhost:3002';
const mobileHost = MOBILE_URL.replace(/^https?:\/\//, '');

const RANK_META = [
  { key: 'rank1' as const, medal: '🥇' },
  { key: 'rank2' as const, medal: '🥈' },
  { key: 'rank3' as const, medal: '🥉' },
];

export default function LobbyState() {
  const slugShort = useNucStore((s) => s.slugShort);
  const players = useNucStore((s) => s.players);
  const totalPlayers = useNucStore((s) => s.totalPlayers);
  const cinemaLogoUrl = useNucStore((s) => s.cinemaLogoUrl);
  const cinemaName = useNucStore((s) => s.cinemaName);
  const prizes = useNucStore((s) => s.prizes);

  const hasPrizes = !!(prizes?.rank1 || prizes?.rank2 || prizes?.rank3);
  const superPrize = prizes?.rank1?.isSuperPrize ? prizes.rank1 : null;

  return (
    <div className="flex h-full flex-col px-16 py-12">
      {prizes?.all && (
        <div className="animate-cascade-in mb-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-8 py-3 text-center opacity-0">
          <div className="text-base font-semibold text-emerald-200">
            🎁 Ce soir, tous les joueurs gagnent : {prizes.all.label}
          </div>
        </div>
      )}

      {superPrize && (
        <div
          className="animate-scale-up mb-6 rounded-2xl border border-yellow-400/40 bg-gradient-to-r from-yellow-500/20 to-amber-600/10 px-8 py-4 text-center opacity-0"
          style={{ animationDelay: '0.3s' }}
        >
          <div className="text-lg font-bold tracking-wide text-yellow-300">
            🎰 SUPER LOT EN JEU CE SOIR : {superPrize.label}
          </div>
        </div>
      )}

      <h1 className="mb-8 text-center text-[clamp(36px,4vw,72px)] font-bold">
        Rejoignez le quiz !
      </h1>

      <div className="flex flex-1 items-start justify-center gap-16">
        <div className="flex flex-col items-center gap-6">
          <QrCode value={`${MOBILE_URL}/?s=${slugShort}`} size={320} />
          <div className="text-xl text-gray-400">
            Scannez le QR ou tapez le code sur{' '}
            <span className="font-semibold text-white">{mobileHost}</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="text-2xl text-gray-400">Code session</div>
          <div className="rounded-2xl bg-white/10 px-12 py-6 text-[clamp(80px,14vw,200px)] font-black tabular-nums tracking-widest">
            {slugShort}
          </div>

          {hasPrizes && (
            <div className="mt-4 w-full max-w-md rounded-xl bg-white/5 px-6 py-4">
              <div className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-gray-400">
                À gagner ce soir
              </div>
              <ul className="space-y-2 text-center text-lg">
                {RANK_META.map(({ key, medal }) => {
                  const prize = prizes?.[key];
                  if (!prize) return null;
                  return (
                    <li key={key} className="text-gray-200">
                      {medal} {prize.label}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
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
