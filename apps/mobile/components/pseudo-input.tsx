'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface PseudoInputProps {
  sessionCode: string;
  onSubmit: (pseudo: string, pseudoSource: 'SUGGESTED' | 'CUSTOM') => void;
  disabled?: boolean;
}

const REGEN_THROTTLE_MS = 2000;
const LOAD_TIMEOUT_MS = 2000;

export default function PseudoInput({ sessionCode, onSubmit, disabled }: PseudoInputProps) {
  const [pseudo, setPseudo] = useState('');
  const [pseudoSource, setPseudoSource] = useState<'SUGGESTED' | 'CUSTOM'>('CUSTOM');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const lastRegenAt = useRef(0);

  const loadSuggestions = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
      const data = await api.get<{ suggestions: [string, string, string] }>(
        `/api/sessions/by-code/${sessionCode}/pseudo-suggestions`,
        { signal: controller.signal },
      );
      clearTimeout(timer);
      setSuggestions(data.suggestions);
      setShowSuggestions(true);
    } catch {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  }, [sessionCode]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  function handleRegen() {
    const now = Date.now();
    if (now - lastRegenAt.current < REGEN_THROTTLE_MS) return;
    lastRegenAt.current = now;
    void loadSuggestions();
  }

  function handleSuggestionTap(value: string) {
    setPseudo(value);
    setPseudoSource('SUGGESTED');
  }

  function handlePseudoChange(value: string) {
    setPseudo(value);
    setPseudoSource('CUSTOM');
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="text-center text-lg text-gray-400">Choisis un pseudo</label>

      {showSuggestions && suggestions.length === 3 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestionTap(s)}
                disabled={disabled}
                className="min-h-[44px] rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleRegen}
            disabled={disabled}
            className="mx-auto min-h-[44px] min-w-[44px] text-xl text-gray-400 hover:text-white disabled:opacity-40"
            aria-label="Régénérer les suggestions"
          >
            ↻
          </button>
        </div>
      )}

      <input
        type="text"
        value={pseudo}
        onChange={(e) => handlePseudoChange(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={30}
        placeholder="Ex: Bob_42"
        disabled={disabled}
        className="focus:ring-brand-500 rounded-xl bg-white/10 px-4 py-4 text-center text-xl font-medium text-white placeholder-gray-600 outline-none ring-2 ring-white/20 transition-all"
        style={{ fontSize: '18px' }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && pseudo.length >= 2) onSubmit(pseudo, pseudoSource);
        }}
      />
      <button
        onClick={() => onSubmit(pseudo, pseudoSource)}
        disabled={disabled || pseudo.length < 2}
        className="bg-brand-600 hover:bg-brand-700 rounded-xl py-4 text-lg font-semibold text-white transition-colors disabled:opacity-40"
      >
        C&apos;est parti !
      </button>
    </div>
  );
}
