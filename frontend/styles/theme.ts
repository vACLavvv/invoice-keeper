import { createGlobalStyle, css } from 'styled-components';

// Root font-size is 10px, so 1rem = 10px: 1.4rem is 14px.
// Two palettes of the ui-ux-pro-max design system (Swiss minimal, navy + amber): light and dark.
// The sign-in page always uses the light landing palette (`light`).

const shared = {
  accent: '#1e40af',
  accentDeep: '#1e3a8a',
  accentSoft: 'rgba(30, 64, 175, 0.08)',
};

const light = {
  page: '#f4f5f6',
  panel: '#ffffff',
  tile: '#f2f3f4',
  ink: '#111214',
  muted: '#7b7f86',
  line: '#e7e9ec',
};

const base = {
  light,
  radius: { sm: '0.8rem', md: '1.2rem', lg: '1.6rem', xl: '2.4rem', sheet: '4.8rem', pill: '99rem' },
  font: `'Fira Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  mobile: '@media (max-width: 720px)',
};

export const darkTheme = {
  ...base,
  name: 'dark' as 'dark' | 'light',
  color: {
    ...shared,
    page: '#0b1120',
    surface: '#111a2e',
    tile: '#172238',
    tileHover: '#1d2a44',
    inset: '#0d1526',
    hover: 'rgba(255, 255, 255, 0.03)',
    line: '#24324d',
    text: '#e2e8f0',
    strong: '#f8fafc',
    muted: '#94a3b8',
    faint: '#64748b',
    ghost: '#24324d',
    chevron: '#000000',
    chevronText: '#ffffff',
    shadow: 'rgba(0, 0, 0, 0.6)',
    paid: '#34d399',
    unpaid: '#fbbf24',
    overdue: '#f87171',
    overdueSoft: 'rgba(248, 113, 113, 0.12)',
    unpaidSoft: 'rgba(251, 191, 36, 0.12)',
  },
};

export const lightTheme: typeof darkTheme = {
  ...base,
  name: 'light',
  color: {
    ...shared,
    page: '#f8fafc',
    surface: '#ffffff',
    tile: '#f1f5f9',
    tileHover: '#e2e8f0',
    inset: '#ffffff',
    hover: 'rgba(17, 18, 20, 0.025)',
    line: '#e2e8f0',
    text: '#0f172a',
    strong: '#0f172a',
    muted: '#475569',
    faint: '#94a3b8',
    ghost: '#e2e8f0',
    chevron: '#0f172a',
    chevronText: '#ffffff',
    shadow: 'rgba(17, 18, 20, 0.18)',
    paid: '#047857',
    unpaid: '#b45309',
    overdue: '#dc2626',
    overdueSoft: 'rgba(220, 38, 38, 0.08)',
    unpaidSoft: 'rgba(180, 83, 9, 0.1)',
  },
};

export const theme = darkTheme;
export type Theme = typeof darkTheme;

declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefaultTheme extends Theme {}
}

/** Glass globe drawn with gradients: a pale cyan sphere, highlights and orbit lines. */
export const globe = css`
  background:
    radial-gradient(circle at 42% 34%, rgba(255, 255, 255, 0.95) 0 5%, transparent 20%),
    radial-gradient(ellipse 34% 22% at 50% 52%, rgba(255, 255, 255, 0.55), transparent 70%),
    radial-gradient(circle at 58% 66%, rgba(92, 205, 226, 0.6) 0 8%, transparent 30%),
    radial-gradient(circle at 50% 62%, rgba(160, 228, 241, 0.95) 0 26%, rgba(200, 240, 248, 0.75) 38%, transparent 56%),
    linear-gradient(180deg, #f6f8f9 0%, #eef3f5 100%);
  &::before, &::after {
    content: '';
    position: absolute;
    left: 50%;
    aspect-ratio: 1;
    transform: translateX(-50%);
    border-radius: 50%;
    border: 1px solid rgba(34, 182, 202, 0.55);
    pointer-events: none;
  }
  &::before { top: 8%; width: min(110rem, 120%); }
  &::after { top: -6%; width: min(150rem, 170%); border-color: rgba(34, 182, 202, 0.35); }
`;

export const GlobalStyle = createGlobalStyle`
  html { font-size: 10px; -webkit-text-size-adjust: 100%; }
  *, *::before, *::after { box-sizing: border-box; }
  /* Base styles come from styles/workspace; rem stays 10px for the styled components. */
  body { color-scheme: ${({ theme }) => theme.name}; }
`;
