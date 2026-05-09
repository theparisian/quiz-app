'use client';

export default function PausedOverlay() {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="rounded-3xl bg-gray-900/90 px-16 py-12 text-center">
        <div className="mb-4 text-6xl">⏸</div>
        <div className="text-4xl font-bold">En pause</div>
        <div className="mt-4 text-xl text-gray-400">
          Le projectionniste a interrompu la session.
          <br />
          Reprise imminente.
        </div>
      </div>
    </div>
  );
}
