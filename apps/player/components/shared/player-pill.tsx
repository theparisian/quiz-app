'use client';

interface PlayerPillProps {
  pseudo: string;
  index: number;
}

export default function PlayerPill({ pseudo, index }: PlayerPillProps) {
  return (
    <div
      className="animate-cascade-in rounded-full bg-white/10 px-5 py-2 text-lg font-medium opacity-0"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      {pseudo}
    </div>
  );
}
