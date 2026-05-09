'use client';

export default function PausedScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
      <div className="text-5xl">⏸</div>
      <div className="text-2xl font-bold">En pause</div>
      <div className="text-center text-gray-400">
        Le projectionniste a mis en pause.
        <br />
        Reprise imminente.
      </div>
    </div>
  );
}
