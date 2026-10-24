import { en } from './en';

// Texts are written in Russian; `t` returns the English version from lib/en.ts when English is on.
// A missing translation falls back to Russian, and scripts/i18n-check.mjs lists such strings.
export type Language = 'ru' | 'en';

let current: Language = 'ru';

export const setLanguage = (language: Language) => { current = language; };
export const language = () => current;
export const locale = () => (current === 'en' ? 'en-GB' : 'ru-RU');

/** t('Привет, {name}', { name }) */
export function t(text: string, vars?: Record<string, string | number>): string {
  let out = current === 'en' ? en[text] ?? text : text;
  if (vars) for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, String(value));
  return out;
}

/** Plural forms: Russian one/few/many, English one/other. */
export function tp(n: number, ru: [string, string, string], english: [string, string]): string {
  if (current === 'en') return n === 1 ? english[0] : english[1];
  if (n % 10 === 1 && n % 100 !== 11) return ru[0];
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return ru[1];
  return ru[2];
}
