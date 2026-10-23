import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght-italic.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import styled, { ThemeProvider } from 'styled-components';
import { Notice } from '@/components/ui';
import { SessionProvider } from '@/lib/session';
import { ToastProvider } from '@/lib/toast';
import { GlobalStyle, theme } from '@/styles/theme';

// Every page except /login lives inside the signed-in panel.
const publicPages = ['/login', '/404'];

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();
  const page = <Component {...pageProps} />;
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <Head><meta name="viewport" content="width=device-width,initial-scale=1" /></Head>
      <ToastProvider>
        {publicPages.includes(pathname) ? page : (
          <SessionProvider fallback={(error) => (
            <Loading>{error ? <Notice $tone="error" role="alert">{error}</Notice> : 'Загружаем панель…'}</Loading>
          )}>
            {page}
          </SessionProvider>
        )}
      </ToastProvider>
    </ThemeProvider>
  );
}

const Loading = styled.div`
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.6rem;
  color: ${({ theme }) => theme.color.muted};
  font-weight: 700;
`;
