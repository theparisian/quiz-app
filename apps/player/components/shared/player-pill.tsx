'use client';

interface PlayerPillProps {
  pseudo: string;
  index: number;
}

export default function PlayerPill({ pseudo, index }: PlayerPillProps) {
  return (
    <div
      className="rounded-full bg-white/10 px-5 py-2 text-lg font-medium opacity-0"
      style={{ animation: `cascade-in 0.3s ease-out ${index * 0.05}s forwards` }}
    >
      {pseudo}
    </div>
  );
}
