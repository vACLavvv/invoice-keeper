import Head from 'next/head';
import Link from 'next/link';
import { t } from '@/lib/i18n';

export default function NotFound() {
  return (
    <main className="empty-state" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center' }}>
      <Head><title>{`${t('Страница не найдена')} · Invoice Keeper`}</title></Head>
      <b style={{ fontSize: 64 }}>404</b>
      <b>{t('Такой страницы нет')}</b>
      {t('Возможно, ссылка устарела. Вернитесь к платежам.')}
      <br />
      <Link className="button primary" href="/">{t('На главную →')}</Link>
    </main>
  );
}
