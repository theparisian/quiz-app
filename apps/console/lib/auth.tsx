'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api } from './api';

export interface User {
  id: string;
  email: string | null;
  displayName: string | null;
  role: string;
  cinemaId: string | null;
  cinemaSlug: string | null;
  cinemaName: string | null;
  /** Rôle sponsor (C4) : sponsor dont l'utilisateur consulte le portail. */
  sponsorId?: string | null;
  sponsorSlug?: string | null;
  sponsorName?: string | null;
}

/** Rôle sponsor (C4) : portail /sponsor seulement, aucune page cinéma. */
export function isSponsorRole(role: string | undefined | null): boolean {
  return role === 'sponsor';
}

/** Page d'accueil après connexion selon le rôle. */
export function homePathFor(role: string): string {
  if (role === 'player') return '/access-denied';
  if (role === 'sponsor') return '/sponsor';
  return '/dashboard';
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  logout: async () => {},
  refetch: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const u = await api.get<User>('/api/users/me');
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    setUser(null);
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refetch: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
