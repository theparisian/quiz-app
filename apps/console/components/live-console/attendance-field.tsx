'use client';

import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MAX_SESSION_ATTENDANCE } from '@quiz-app/validation';
import { api } from '@/lib/api';

interface AttendanceFieldProps {
  sessionId: string;
}

function errorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'ATTENDANCE_WINDOW_CLOSED':
      return 'Les entrées ne peuvent plus être saisies (séance terminée depuis plus de 7 jours).';
    case 'SESSION_NOT_ENDED':
      return 'Les entrées se saisissent une fois la séance terminée.';
    case 'VALIDATION_ERROR':
      return `Indiquez un nombre entre 0 et ${MAX_SESSION_ATTENDANCE}.`;
    default:
      return 'Enregistrement impossible pour le moment. Réessayez.';
  }
}

/** Entrées de la séance (C3), saisies par le cinéma sur l'écran de fin de séance. */
export function AttendanceField({ sessionId }: AttendanceFieldProps) {
  const inputId = useId();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['session', sessionId, 'attendance'],
    queryFn: () => api.get<{ attendance: number | null }>(`/api/sessions/${sessionId}`),
    staleTime: 60_000,
  });
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched && data?.attendance != null) setValue(String(data.attendance));
  }, [data?.attendance, touched]);

  const save = useMutation({
    mutationFn: (attendance: number) =>
      api.patch<{ attendance: number }>(`/api/sessions/${sessionId}/attendance`, { attendance }),
    onSuccess: (res) => {
      qc.setQueryData(['session', sessionId, 'attendance'], { attendance: res.attendance });
      setTouched(false);
    },
  });

  const parsed = value.trim() === '' ? null : Number(value);
  const valid =
    parsed !== null && Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_SESSION_ATTENDANCE;

  return (
    <form
      className="w-full max-w-lg rounded-lg border bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate(parsed);
      }}
    >
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
        Entrées de la séance
      </label>
      <p className="text-xs text-gray-500">Sert à calculer votre taux de participation</p>
      <div className="mt-2 flex gap-2">
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_SESSION_ATTENDANCE}
          step={1}
          value={value}
          onChange={(e) => {
            setTouched(true);
            setValue(e.target.value);
          }}
          className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!valid || save.isPending}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
      {save.isSuccess && !touched && (
        <p className="mt-2 text-xs text-green-700">Entrées enregistrées.</p>
      )}
      {save.isError && <p className="mt-2 text-xs text-red-600">{errorMessage(save.error)}</p>}
    </form>
  );
}
