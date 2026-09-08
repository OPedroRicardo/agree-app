import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  checkHealth,
  getProfile,
  login as loginRequest,
  logout as logoutRequest,
} from './api';
import type { LoggedUser } from './types';

/** How often to poll `GET /health` while `unreachable`. */
const RECONNECT_POLL_MS = 3000;

/**
 * Session state. The JWT itself lives only in an httpOnly cookie (set by the
 * backend's `POST /auth/login`, read by its HTTP guard and WS gateway) — it
 * never reaches this state or `localStorage`. `unreachable` means the
 * backend didn't respond at all (network/connection failure), as opposed to
 * `signed-out`, which means it responded and said "no session".
 */
type AuthState =
  | { status: 'loading' }
  | { status: 'unreachable' }
  | { status: 'signed-out'; notice: string | null }
  | { status: 'signed-in'; user: LoggedUser };

/** Shape exposed by {@link useAuth}. */
type AuthContextValue = {
  state: AuthState;
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => void;
  /** Called on 401/WS-Unauthorized — there's no refresh token, so this just signs out with a notice. */
  expireSession: () => void;
  /** Called wherever an `ApiError` with `status === 0` surfaces — the backend stopped responding mid-session. */
  markUnreachable: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Provides the session (see {@link AuthState}) via {@link useAuth}. Wraps the whole app in `layout.tsx`. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const stateRef = useRef(state);
  stateRef.current = state;

  /** Resolves the session from scratch — used both on mount and after `unreachable` recovers. */
  const resolveSession = useCallback(() => {
    getProfile().then(
      (user) => setState({ status: 'signed-in', user }),
      (err) => {
        if (err instanceof ApiError && err.status === 0) {
          setState({ status: 'unreachable' });
          return;
        }
        setState({ status: 'signed-out', notice: null });
      },
    );
  }, []);

  useEffect(resolveSession, [resolveSession]);

  // While unreachable, poll `/health` and re-resolve the session as soon as
  // the backend answers again — no user action needed to recover.
  useEffect(() => {
    if (state.status !== 'unreachable') return;
    const id = setInterval(() => {
      checkHealth().then((healthy) => {
        if (healthy && stateRef.current.status === 'unreachable') resolveSession();
      });
    }, RECONNECT_POLL_MS);
    return () => clearInterval(id);
  }, [state.status, resolveSession]);

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

  const markUnreachable = useCallback(() => {
    setState((current) => (current.status === 'unreachable' ? current : { status: 'unreachable' }));
  }, []);

  const value = useMemo(
    () => ({ state, signIn, signOut, expireSession, markUnreachable }),
    [state, signIn, signOut, expireSession, markUnreachable],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Reads the current {@link AuthState} and session actions. Must be called under {@link AuthProvider}. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
