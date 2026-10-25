import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, setCsrfToken, type Settings, type User, type Overview } from './api';
import { startLiveUpdates } from './live-updates';
import { createLatestLoader } from './async-load';

type Session = {
  user: User;
  settings: Settings;
  isAdmin: boolean;
  /** Selected month (YYYY-MM), shared by the payments and calendar pages. */
  month: string;
  setMonth: (month: string) => void;
  /** Increments on every change and on the minute timer; data hooks reload when it changes. */
  version: number;
  overview: Overview | null;
  overviewError: string | null;
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

  const { data: overview, error: overviewError } = useAsyncLoad(() => authenticated ? api<Overview>('/payments/overview') : Promise.resolve(null), [authenticated], version);

  useEffect(() => {
    if (authenticated) return startLiveUpdates(refresh);
  }, [authenticated, refresh]);

  if (!state || !month) return <>{fallback(error)}</>;
  return (
    <SessionContext.Provider value={{ ...state, isAdmin: state.user.role === 'admin', month, setMonth, version, refresh, overview, overviewError }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside SessionProvider');
  return session;
}

/** Live invalidations queue one follow-up; changing filters discards old-query results. */
function useAsyncLoad<T>(load: () => Promise<T>, deps: unknown[], version: number): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load); loadRef.current = load;
  const runner = useRef<ReturnType<typeof createLatestLoader<T>> | null>(null);
  const seenVersion = useRef(version);
  useEffect(() => {
    const lifecycle = createLatestLoader(() => loadRef.current(), (value) => { setData(value); setError(null); }, (e) => setError(e.message));
    runner.current = lifecycle;
    void lifecycle.request();
    return () => { lifecycle.dispose(); if (runner.current === lifecycle) runner.current = null; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (seenVersion.current !== version) { seenVersion.current = version; void runner.current?.request(); }
  }, [version]);
  return { data, error };
}
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null } {
  const { version } = useSession();
  return useAsyncLoad(load, deps, version);
}
