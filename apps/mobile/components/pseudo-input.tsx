'use client';

import { useState } from 'react';

interface PseudoInputProps {
  onSubmit: (pseudo: string) => void;
  disabled?: boolean;
}

export default function PseudoInput({ onSubmit, disabled }: PseudoInputProps) {
  const [pseudo, setPseudo] = useState('');

  return (
    <div className="flex flex-col gap-4">
      <label className="text-center text-lg text-gray-400">Choisis un pseudo</label>
      <input
        type="text"
        value={pseudo}
        onChange={(e) => setPseudo(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={30}
        placeholder="Ex: Bob_42"
        disabled={disabled}
        className="focus:ring-brand-500 rounded-xl bg-white/10 px-4 py-4 text-center text-xl font-medium text-white placeholder-gray-600 outline-none ring-2 ring-white/20 transition-all"
        style={{ fontSize: '18px' }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && pseudo.length >= 2) onSubmit(pseudo);
        }}
      />
      <button
        onClick={() => onSubmit(pseudo)}
        disabled={disabled || pseudo.length < 2}
        className="bg-brand-600 hover:bg-brand-700 rounded-xl py-4 text-lg font-semibold text-white transition-colors disabled:opacity-40"
      >
        C&apos;est parti !
      </button>
    </div>
  );
}
