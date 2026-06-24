'use client';

import { useNucStore } from '@/lib/stores/nuc-store';
import QrCode from '@/components/shared/qr-code';
import PlayerPill from '@/components/shared/player-pill';

const MOBILE_URL =
  process.env.NEXT_PUBLIC_MOBILE_URL || process.env.NEXT_PUBLIC_PLAY_URL || 'http://localhost:3002';
const mobileHost = MOBILE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

// Plafond de pseudos animés simultanément (perf NUC sur grosses salles).
const MAX_FLOATING_PSEUDOS = 48;

const RANK_META = [
  { key: 'rank1' as const, medal: '🥇' },
  { key: 'rank2' as const, medal: '🥈' },
  { key: 'rank3' as const, medal: '🥉' },
];

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function LobbyState() {
  const slugShort = useNucStore((s) => s.slugShort);
  const players = useNucStore((s) => s.players);
  const totalPlayers = useNucStore((s) => s.totalPlayers);
  const cinemaLogoUrl = useNucStore((s) => s.cinemaLogoUrl);
  const cinemaName = useNucStore((s) => s.cinemaName);
  const prizes = useNucStore((s) => s.prizes);
  const lobbyRemainingMs = useNucStore((s) => s.lobbyRemainingMs);
  const lobbyPrizesEnabled = useNucStore((s) => s.lobbyPrizesEnabled);

  const hasPrizes = !!(prizes?.rank1 || prizes?.rank2 || prizes?.rank3);
  const superPrize = prizes?.rank1?.isSuperPrize ? prizes.rank1 : null;

  // On affiche les derniers connectés en priorité (ils poppent depuis le bas).
  const visiblePlayers =
    players.length > MAX_FLOATING_PSEUDOS ? players.slice(-MAX_FLOATING_PSEUDOS) : players;
  const overflow = players.length - visiblePlayers.length;

  return (
    <div className="relative z-10 flex h-full">
      {/* Partie gauche : réservée à l'image de fond de l'annonceur. On y fait juste flotter les pseudos. */}
      <div className="relative flex-1 overflow-hidden">
        {(cinemaLogoUrl || cinemaName) && (
          <div className="absolute left-10 top-10">
            {cinemaLogoUrl ? (
              <img src={cinemaLogoUrl} alt="" className="h-12 opacity-70" />
            ) : (
              <span className="text-sm text-white/70 drop-shadow">{cinemaName}</span>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-12 pb-12">
          <div className="flex flex-wrap content-end items-end gap-x-5 gap-y-4">
            {visiblePlayers.map((p, i) => (
              <PlayerPill key={p.playerId} pseudo={p.pseudo} index={i} seed={p.playerId} />
            ))}
            {overflow > 0 && (
              <span className="inline-block rounded-full bg-white/15 px-6 py-2.5 text-2xl font-semibold text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm">
                +{overflow}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Partie droite : panneau verre dépoli, neutre, qui s'adapte à n'importe quel fond. */}
      <aside className="m-8 flex w-[34vw] min-w-[440px] max-w-[640px] flex-col items-center justify-center gap-8 rounded-[2.5rem] border border-white/20 bg-white/[0.07] px-12 py-12 text-center shadow-2xl ring-1 ring-inset ring-white/10 backdrop-blur-2xl">
        <div>
          <h1 className="text-[clamp(40px,3.4vw,68px)] font-black leading-none tracking-tight drop-shadow">
            C&apos;est l&apos;heure du quiz !
          </h1>
          <p className="mt-4 text-2xl text-white/80">
            Connectez-vous sur <span className="font-semibold text-white">{mobileHost}</span>
          </p>
        </div>

        <div className="rounded-2xl bg-white/10 px-10 py-4 text-[clamp(56px,9vw,120px)] font-black tabular-nums leading-none tracking-[0.15em] shadow-inner">
          {slugShort}
        </div>

        <div className="flex flex-col items-center gap-3">
          <QrCode value={`${MOBILE_URL}/?s=${slugShort}`} size={260} />
          <span className="text-base text-white/60">Scannez le QR pour rejoindre</span>
        </div>

        {lobbyPrizesEnabled && superPrize && (
          <div className="w-full rounded-2xl border border-yellow-400/40 bg-gradient-to-r from-yellow-500/20 to-amber-600/10 px-6 py-3">
            <div className="text-lg font-bold tracking-wide text-yellow-300">
              🎰 Super lot ce soir : {superPrize.label}
            </div>
          </div>
        )}

        {lobbyPrizesEnabled && prizes?.all && (
          <div className="w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-6 py-3 text-base font-semibold text-emerald-200">
            🎁 Tous les joueurs gagnent : {prizes.all.label}
          </div>
        )}

        {lobbyPrizesEnabled && !superPrize && hasPrizes && (
          <div className="w-full rounded-2xl bg-white/5 px-6 py-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
              À gagner ce soir
            </div>
            <ul className="space-y-1 text-base text-white/85">
              {RANK_META.map(({ key, medal }) => {
                const prize = prizes?.[key];
                if (!prize) return null;
                return (
                  <li key={key}>
                    {medal} {prize.label}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-2 flex w-full items-center justify-between text-white/70">
          <span className="text-lg">Joueurs connectés</span>
          <span className="text-2xl font-bold tabular-nums text-white">{totalPlayers}</span>
        </div>

        {lobbyRemainingMs !== null && (
          <div className="w-full rounded-full bg-black/40 px-8 py-4 ring-1 ring-white/15">
            <div className="text-sm uppercase tracking-wide text-white/60">Début de la partie</div>
            <div className="text-4xl font-black tabular-nums">
              {formatCountdown(lobbyRemainingMs)}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
