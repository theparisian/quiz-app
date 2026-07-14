'use client';

import type { ReactNode } from 'react';

export const SCREEN_EXIT_MS = 300;

interface ScreenTransitionProps {
  screenKey: string;
  children: ReactNode;
  className?: string;
}

export function ScreenTransition({ screenKey, children, className = '' }: ScreenTransitionProps) {
  return (
    <div
      key={screenKey}
      className={`animate-mobile-screen-enter flex flex-1 flex-col ${className}`}
    >
      {children}
    </div>
  );
}

interface ScreenExitWrapperProps {
  exiting: boolean;
  children: ReactNode;
  className?: string;
}

export function ScreenExitWrapper({ exiting, children, className = '' }: ScreenExitWrapperProps) {
  return (
    <div
      className={`${exiting ? 'animate-mobile-screen-exit pointer-events-none' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
