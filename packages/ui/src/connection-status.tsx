'use client';

import React from 'react';

interface ConnectionStatusProps {
  connected: boolean;
}

export function ConnectionStatus({ connected }: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          connected ? 'bg-success' : 'bg-danger'
        }`}
      />
      <span className="text-gray-600">
        {connected ? 'Connecté' : 'Déconnecté'}
      </span>
    </div>
  );
}
