'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getProfile, login as loginRequest, logout as logoutRequest } from './api';
import type { LoggedUser } from './types';

/**
 * Session state. The JWT itself lives only in an httpOnly cookie (set by
 * `/api/auth/login`, read by `/api/*` route handlers and the backend's WS
 * gateway) — it never reaches this state or `localStorage`.
 */
type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; notice: string | null }
  | { status: 'signed-in'; user: LoggedUser };

/** Shape exposed by {@link useAuth}. */
type AuthContextValue = {
  state: AuthState;
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => void;
  /** Called on 401/WS-Unauthorized — there's no refresh token, so this just signs out with a notice. */
  expireSession: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Provides the session (see {@link AuthState}) via {@link useAuth}. Wraps the whole app in `layout.tsx`. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getProfile().then(
      (user) => {
        if (!cancelled) setState({ status: 'signed-in', user });
      },
      () => {
        if (!cancelled) setState({ status: 'signed-out', notice: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (loginValue: string, password: string) => {
    await loginRequest(loginValue, password);
    const user = await getProfile();
    setState({ status: 'signed-in', user });
  }, []);

  const signOut = useCallback(() => {
    logoutRequest().finally(() => setState({ status: 'signed-out', notice: null }));
  }, []);

  const expireSession = useCallback(() => {
    logoutRequest().finally(() =>
      setState({
        status: 'signed-out',
        notice: 'Sua sessão expirou. Faça login novamente.',
      }),
    );
  }, []);

  const value = useMemo(
    () => ({ state, signIn, signOut, expireSession }),
    [state, signIn, signOut, expireSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Reads the current {@link AuthState} and session actions. Must be called under {@link AuthProvider}. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
