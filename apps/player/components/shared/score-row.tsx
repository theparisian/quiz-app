'use client';

interface ScoreRowProps {
  rank: number;
  pseudo: string;
  scoreTotal: number;
  scoreDiff: number;
  index: number;
}

export default function ScoreRow({ rank, pseudo, scoreTotal, scoreDiff, index }: ScoreRowProps) {
  return (
    <div
      className="animate-cascade-in flex items-center justify-between rounded-xl bg-white/5 px-6 py-4 opacity-0"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div className="flex items-center gap-4">
        <span className="w-10 text-right text-xl font-bold text-gray-400">#{rank}</span>
        <span className="text-xl font-semibold">{pseudo}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xl font-bold">{scoreTotal} pts</span>
        {scoreDiff > 0 && (
          <span className="text-lg font-semibold text-green-400">+{scoreDiff}</span>
        )}
      </div>
    </div>
  );
}
