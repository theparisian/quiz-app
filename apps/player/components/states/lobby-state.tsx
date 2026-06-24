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

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 32" fill="none" className={className} aria-hidden>
      <rect x="4" y="1" width="16" height="30" rx="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="26" r="1.5" fill="currentColor" />
    </svg>
  );
}

export default function LobbyState() {
  const slugShort = useNucStore((s) => s.slugShort);
  const players = useNucStore((s) => s.players);
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
      {/* Partie gauche : réservée à l'image de fond de l'annonceur. */}
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
      </div>

      {/* Pseudos connectés — fixés en bas à gauche de l'écran. */}
      <div className="pointer-events-none fixed bottom-10 left-10 z-20 max-w-[55vw]">
        <div className="flex flex-wrap content-end items-end gap-x-4 gap-y-3">
          {visiblePlayers.map((p, i) => (
            <PlayerPill key={p.playerId} pseudo={p.pseudo} index={i} seed={p.playerId} />
          ))}
          {overflow > 0 && (
            <span className="inline-block rounded-full bg-white/15 px-5 py-2 text-xl font-semibold text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm">
              +{overflow}
            </span>
          )}
        </div>
      </div>

      {/* Partie droite : panneau verre dépoli, neutre, qui s'adapte à n'importe quel fond. */}
      <aside className="m-16 flex w-[26vw] min-w-[320px] max-w-[440px] flex-col items-center rounded-[2rem] border border-white/20 bg-white/[0.07] px-8 py-10 text-center shadow-2xl ring-1 ring-inset ring-white/10 backdrop-blur-2xl lg:m-24">
        <div className="flex w-full flex-col items-center gap-7">
          <div>
            <h1 className="text-[clamp(28px,2.6vw,48px)] font-black leading-none tracking-tight drop-shadow">
              C&apos;est l&apos;heure du quiz !
            </h1>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-4">
              <PhoneIcon className="h-12 w-9 shrink-0 text-white/80" />
              <div className="text-left leading-snug">
                <p className="text-base text-white/80">Connectez-vous sur</p>
                <p className="text-lg font-bold text-white">{mobileHost}</p>
              </div>
            </div>

            <div className="text-[clamp(36px,5vw,64px)] font-black tabular-nums leading-none tracking-[0.1em]">
              {slugShort}
            </div>
          </div>

          <QrCode
            value={`${MOBILE_URL}/?s=${slugShort}`}
            size={160}
            caption="Scannez le QR Code et rejoignez la partie"
          />

          {lobbyPrizesEnabled && superPrize && (
            <div className="w-full rounded-xl border border-yellow-400/40 bg-gradient-to-r from-yellow-500/20 to-amber-600/10 px-4 py-2.5">
              <div className="text-sm font-bold tracking-wide text-yellow-300">
                🎰 Super lot ce soir : {superPrize.label}
              </div>
            </div>
          )}

          {lobbyPrizesEnabled && prizes?.all && (
            <div className="w-full rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-200">
              🎁 Tous les joueurs gagnent : {prizes.all.label}
            </div>
          )}

          {lobbyPrizesEnabled && !superPrize && hasPrizes && (
            <div className="w-full rounded-xl bg-white/5 px-4 py-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">
                À gagner ce soir
              </div>
              <ul className="space-y-0.5 text-sm text-white/85">
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
        </div>

        {lobbyRemainingMs !== null && (
          <div className="mt-8 rounded-full bg-black px-8 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-white/55">Début partie</div>
            <div className="text-xl font-black tabular-nums leading-tight">
              {formatCountdown(lobbyRemainingMs)}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
