import { createContext, Fragment, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ThemeProvider } from 'styled-components';
import { darkTheme, lightTheme } from '@/styles/theme';
import { setLanguage, type Language } from './i18n';

export type ThemeMode = 'system' | 'light' | 'dark';

type Preferences = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  language: Language;
  setLanguage: (language: Language) => void;
};

const PreferencesContext = createContext<Preferences>({ mode: 'system', setMode: () => {}, language: 'ru', setLanguage: () => {} });

// Browser storage can be unavailable (private mode, blocked site data): preferences then simply don't persist.
function read(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* not persisted */ }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [systemDark, setSystemDark] = useState(true);
  const [language, setLanguageState] = useState<Language>('ru');

  useEffect(() => {
    const storedMode = read('ik-theme');
    if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') setModeState(storedMode);
    const storedLanguage = read('ik-language');
    const initial: Language = storedLanguage === 'en' || storedLanguage === 'ru'
      ? storedLanguage : navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
    setLanguage(initial);
    setLanguageState(initial);
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(query.matches);
    const change = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  const setMode = useCallback((next: ThemeMode) => { setModeState(next); write('ik-theme', next); }, []);
  const chooseLanguage = useCallback((next: Language) => {
    setLanguage(next);
    setLanguageState(next);
    write('ik-language', next);
  }, []);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  // The workspace stylesheets switch palettes by html[data-theme].
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  return (
    <PreferencesContext.Provider value={{ mode, setMode, language, setLanguage: chooseLanguage }}>
      <ThemeProvider theme={dark ? darkTheme : lightTheme}>
        {/* Texts are read at render time; remounting on a language switch refreshes all of them. */}
        <Fragment key={language}>{children}</Fragment>
      </ThemeProvider>
    </PreferencesContext.Provider>
  );
}

export const usePreferences = () => useContext(PreferencesContext);
