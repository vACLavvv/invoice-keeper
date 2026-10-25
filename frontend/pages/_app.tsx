// Base workspace styles, then visual refinement and the shared responsive layout contract.
import '@/styles/workspace/styles.css';
import '@/styles/workspace/themes.css';
import '@/styles/workspace/workspace.css';
import '@/styles/workspace/apple.css';
import '@/styles/workspace/extras.css';
import '@/styles/workspace/typography.css';
import '@/styles/workspace/taste.css';
import '@/styles/workspace/refinement.css';
import '@/styles/workspace/responsive.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import styled from 'styled-components';
import { Notice } from '@/components/ui';
import { t } from '@/lib/i18n';
import { PreferencesProvider } from '@/lib/preferences';
import { SessionProvider } from '@/lib/session';
import { ToastProvider } from '@/lib/toast';
import { GlobalStyle } from '@/styles/theme';

// Every page except /login lives inside the signed-in panel.
const publicPages = ['/login', '/confirm-email', '/404'];

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();
  const page = <Component {...pageProps} />;
  return (
    <PreferencesProvider>
      <GlobalStyle />
      <Head><meta name="viewport" content="width=device-width,initial-scale=1" /></Head>
      <ToastProvider>
        {publicPages.includes(pathname) ? page : (
          <SessionProvider fallback={(error) => (
            <Loading>{error ? <Notice $tone="error" role="alert">{error}</Notice> : t('Загружаем панель…')}</Loading>
          )}>
            {page}
          </SessionProvider>
        )}
      </ToastProvider>
    </PreferencesProvider>
  );
}

const Loading = styled.div`
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 16px;
  color: var(--apple-secondary);
`;
