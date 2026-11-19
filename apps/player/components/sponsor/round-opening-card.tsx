'use client';

import { useEffect, useState } from 'react';
import { displayedRoundSponsor } from '@quiz-app/validation';
import { selectScreenDisplay, useNucStore } from '@/lib/stores/nuc-store';
import { resolveMediaUrl } from '@/lib/media-url';
import { OPENING_CARD_MS, borderColorOf, isOpeningCardVisible } from '@/lib/sponsor-display';

/**
 * Carton d'ouverture d'une manche sponsorisée (C4), 3 s après `round:started` :
 * « <titre du jeu> — présenté par <sponsor> ». Couleur de marque : liseré seulement.
 */
export default function RoundOpeningCard() {
  const round = useNucStore((s) => s.round);
  const display = useNucStore(selectScreenDisplay);
  const isPaused = useNucStore((s) => s.isPaused);
  const [openRoundId, setOpenRoundId] = useState<string | null>(null);

  const sponsor = displayedRoundSponsor(round);
  const roundId = round?.roundId ?? null;
  const hasSponsor = sponsor !== null;

  useEffect(() => {
    if (!roundId || !hasSponsor) return;
    setOpenRoundId(roundId);
    const timer = setTimeout(
      () => setOpenRoundId((current) => (current === roundId ? null : current)),
      OPENING_CARD_MS,
    );
    return () => clearTimeout(timer);
  }, [roundId, hasSponsor]);

  const visible = isOpeningCardVisible({
    display,
    isPaused,
    withinWindow: roundId !== null && openRoundId === roundId,
    hasSponsor,
  });
  if (!visible || !sponsor || !round) return null;

  const logo = resolveMediaUrl(sponsor.logoUrl);
  const border = borderColorOf(sponsor.brandColorPrimary);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-gray-950/85 backdrop-blur-sm">
      <div
        className="animate-scale-up flex min-w-[40vw] max-w-[70vw] flex-col items-center gap-8 rounded-[2rem] border-4 bg-gray-900/90 px-20 py-16 text-center shadow-2xl"
        style={{ borderColor: border ?? 'rgba(255,255,255,0.2)' }}
      >
        <h2 className="text-[clamp(32px,4vw,64px)] font-black leading-tight text-white">
          {round.game.title}
        </h2>
        <div className="flex flex-col items-center gap-4">
          <span className="text-lg font-semibold uppercase tracking-[0.2em] text-white/70">
            présenté par
          </span>
          {logo ? (
            <span className="flex items-center rounded-2xl bg-white/95 px-6 py-4">
              <img
                src={logo}
                alt={sponsor.name}
                className="h-24 w-auto max-w-[30vw] object-contain"
              />
            </span>
          ) : (
            <span className="text-[clamp(28px,3vw,48px)] font-bold text-white">{sponsor.name}</span>
          )}
        </div>
      </div>
    </div>
  );
}
