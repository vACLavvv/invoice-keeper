import { createGlobalStyle, css } from 'styled-components';

// Root font-size is 10px, so 1rem = 10px: 1.4rem is 14px.
// Two palettes in the spirit of a hosting control panel: dark (default for dark systems) and light.
// The sign-in page always uses the light landing palette (`light`).

const shared = {
  accent: '#22b6ca',
  accentDeep: '#1595a8',
  accentSoft: 'rgba(34, 182, 202, 0.14)',
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
  font: `'Inter Variable', 'Segoe UI', system-ui, -apple-system, sans-serif`,
  mobile: '@media (max-width: 960px)',
};

export const darkTheme = {
  ...base,
  name: 'dark' as 'dark' | 'light',
  color: {
    ...shared,
    page: '#000000',
    surface: '#161616',
    tile: '#232323',
    tileHover: '#2b2b2b',
    inset: '#000000',
    hover: 'rgba(255, 255, 255, 0.025)',
    line: '#2c2c2c',
    text: '#ececec',
    strong: '#ffffff',
    muted: '#8b8b8b',
    faint: '#5c5c5c',
    ghost: '#343434',
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
    page: '#eef0f2',
    surface: '#ffffff',
    tile: '#f2f3f4',
    tileHover: '#e8eaed',
    inset: '#ffffff',
    hover: 'rgba(17, 18, 20, 0.025)',
    line: '#e5e7ea',
    text: '#26282c',
    strong: '#111214',
    muted: '#70757d',
    faint: '#a5aab2',
    ghost: '#e2e4e8',
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
  body {
    margin: 0;
    font-family: ${({ theme }) => theme.font};
    font-size: 1.4rem;
    line-height: 1.5;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.page};
    font-feature-settings: 'tnum' 1, 'cv11' 1;
    -webkit-font-smoothing: antialiased;
    color-scheme: ${({ theme }) => theme.name};
    transition: background 0.2s, color 0.2s;
  }
  h1, h2, h3, p { margin: 0; }
  a { color: inherit; text-decoration: none; }
  button, input, select { font: inherit; color: inherit; }
  button { cursor: pointer; border: 0; background: none; padding: 0; }
  button:disabled { cursor: wait; opacity: 0.6; }
  :focus-visible { outline: 0.2rem solid ${({ theme }) => theme.color.accent}; outline-offset: 0.2rem; }
  [hidden] { display: none !important; }
  ::selection { background: ${({ theme }) => theme.color.accent}; color: #fff; }
`;
