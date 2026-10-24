import { createGlobalStyle, css } from 'styled-components';

// Root font-size is 10px, so 1rem = 10px: 1.4rem is 14px.
// Two palettes in the spirit of a hosting control panel: dark (default for dark systems) and light.
// The sign-in page always uses the light landing palette (`light`).

const shared = {
  accent: '#0071e3',
  accentDeep: '#005bbb',
  accentSoft: 'rgba(0, 113, 227, 0.1)',
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
  font: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  mobile: '@media (max-width: 720px)',
};

export const darkTheme = {
  ...base,
  name: 'dark' as 'dark' | 'light',
  color: {
    ...shared,
    page: '#0b0b0d',
    surface: '#18181b',
    tile: '#202024',
    tileHover: '#26262b',
    inset: '#111113',
    hover: 'rgba(255, 255, 255, 0.03)',
    line: '#303035',
    text: '#e4e4e7',
    strong: '#f5f5f7',
    muted: '#a1a1aa',
    faint: '#6b6b73',
    ghost: '#303035',
    chevron: '#000000',
    chevronText: '#ffffff',
    shadow: 'rgba(0, 0, 0, 0.6)',
    paid: '#4ed36b',
    unpaid: '#f2c94c',
    overdue: '#ff6150',
    overdueSoft: 'rgba(255, 97, 80, 0.12)',
    unpaidSoft: 'rgba(242, 201, 76, 0.12)',
  },
};

export const lightTheme: typeof darkTheme = {
  ...base,
  name: 'light',
  color: {
    ...shared,
    page: '#f5f5f7',
    surface: '#ffffff',
    tile: '#f5f5f7',
    tileHover: '#ececf0',
    inset: '#ffffff',
    hover: 'rgba(17, 18, 20, 0.025)',
    line: '#e5e5e9',
    text: '#1d1d1f',
    strong: '#1d1d1f',
    muted: '#6e6e73',
    faint: '#a1a1a6',
    ghost: '#e5e5e9',
    chevron: '#111214',
    chevronText: '#ffffff',
    shadow: 'rgba(17, 18, 20, 0.18)',
    paid: '#1f9d55',
    unpaid: '#b7791f',
    overdue: '#d9412b',
    overdueSoft: 'rgba(217, 65, 43, 0.1)',
    unpaidSoft: 'rgba(183, 121, 31, 0.12)',
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
