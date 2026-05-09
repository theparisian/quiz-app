'use client';

import { useRef, useState, useCallback } from 'react';

interface CodeInputProps {
  onSubmit: (code: string) => void;
  disabled?: boolean;
}

export default function CodeInput({ onSubmit, disabled }: CodeInputProps) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = useCallback(
    (index: number, value: string) => {
      const digit = value.replace(/\D/g, '').slice(-1);
      const newDigits = [...digits];
      newDigits[index] = digit;
      setDigits(newDigits);

      if (digit && index < 3) {
        inputRefs.current[index + 1]?.focus();
      }

      if (newDigits.every((d) => d !== '')) {
        onSubmit(newDigits.join(''));
      }
    },
    [digits, onSubmit],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
      if (pasted.length === 4) {
        setDigits(pasted.split(''));
        onSubmit(pasted);
      }
    },
    [onSubmit],
  );

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-3" onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={1}
            value={digit}
            disabled={disabled}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="focus:ring-brand-500 h-16 w-14 rounded-xl bg-white/10 text-center text-3xl font-bold text-white outline-none ring-2 ring-white/20 transition-all"
            style={{ fontSize: '24px' }}
          />
        ))}
      </div>
      <button
        onClick={() => {
          const code = digits.join('');
          if (code.length === 4) onSubmit(code);
        }}
        disabled={disabled || digits.some((d) => !d)}
        className="bg-brand-600 hover:bg-brand-700 w-full rounded-xl py-4 text-lg font-semibold text-white transition-colors disabled:opacity-40"
      >
        Rejoindre
      </button>
    </div>
  );
}
