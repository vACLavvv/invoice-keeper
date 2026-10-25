import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setCsrfToken, type Settings, type User } from './api';
import { startLiveUpdates } from './live-updates';

type Session = {
  user: User;
  settings: Settings;
  isAdmin: boolean;
  /** Selected month (YYYY-MM), shared by the payments and calendar pages. */
  month: string;
  setMonth: (month: string) => void;
  /** Increments on every change and on the minute timer; data hooks reload when it changes. */
  version: number;
  refresh: () => void;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: (error: string | null) => ReactNode }) {
  const [state, setState] = useState<{ user: User; settings: Settings } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState('');
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const authenticated = state !== null;

  useEffect(() => {
    Promise.all([api<User>('/auth/me'), api<Settings>('/settings')])
      .then(([user, settings]) => {
        setCsrfToken(user.csrf_token);
        setState({ user, settings });
        setMonth(settings.today.slice(0, 7));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // The settings carry "today": keep them fresh so a panel left open over midnight stays correct.
  useEffect(() => {
    if (!state || version === 0) return;
    api<Settings>('/settings').then((settings) => setState((s) => (s ? { ...s, settings } : s))).catch(() => {});
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (authenticated) return startLiveUpdates(refresh);
  }, [authenticated, refresh]);

  if (!state || !month) return <>{fallback(error)}</>;
  return (
    <SessionContext.Provider value={{ ...state, isAdmin: state.user.role === 'admin', month, setMonth, version, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside SessionProvider');
  return session;
}

/** Loads data whenever deps or the session version change; stale responses are dropped. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null } {
  const { version } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    load().then((value) => { if (current) { setData(value); setError(null); } })
      .catch((e: Error) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [...deps, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error };
}
