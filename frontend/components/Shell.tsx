import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type NotificationFeed, type Suggestion } from '@/lib/api';
import { t } from '@/lib/i18n';
import { usePreferences } from '@/lib/preferences';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { useBrowserNoticeDelivery } from '@/lib/use-browser-notices';
import { ws } from './icons';
import { CreatePaymentModal } from './PaymentModals';
import { Modal } from './Modal';

type NavItem = { href: string; label: string; icon: ReactNode; count?: 'open' | 'unread' | 'inbox' };
type NavSection = { title: string; admin?: boolean; items: NavItem[] };

// The workspace navigation of the main branch, plus our own sections (suggestions, extension, account).
const sections = (isAdmin: boolean): NavSection[] => [
  { title: t('Работа'), items: [
    { href: '/', label: t('Обзор'), icon: ws.overview },
    { href: '/payments', label: t('К оплате'), icon: ws.payments, count: 'open' },
    { href: '/history', label: t('История'), icon: ws.history },
    { href: '/calendar', label: t('Календарь'), icon: ws.calendar },
    { href: '/budget', label: t('Бюджет'), icon: ws.budget },
  ] },
  { title: t('Организация'), items: [
    { href: '/recurring', label: t('Регулярные'), icon: ws.recurring },
    { href: '/notifications', label: t('Уведомления'), icon: ws.bell, count: 'unread' },
    ...(isAdmin ? [{ href: '/suggestions', label: t('Предложения'), icon: ws.inbox, count: 'inbox' as const }] : []),
    { href: '/extension', label: t('Расширение'), icon: ws.extension },
  ] },
  { title: t('Управление'), admin: true, items: [
    { href: '/team', label: t('Команда'), icon: ws.users },
    { href: '/activity', label: t('Журнал'), icon: ws.activity },
    { href: '/webhook', label: t('Вебхук'), icon: ws.webhook },
  ] },
  { title: t('Учётная запись'), items: [
    { href: '/account', label: t('Аккаунт'), icon: ws.account },
    { href: '/help', label: t('Помощь'), icon: ws.help },
  ] },
];

type Props = {
  /** Section name: browser tab and breadcrumb. */
  title: string;
  heading: string;
  subtitle?: string;
  /** Replaces the «Добавить платёж» button in the heading. */
  action?: ReactNode;
  /** Shown between the heading text and the button (e.g. the month progress on the overview). */
  extra?: ReactNode;
  children: ReactNode;
};

export function Shell({ title, heading, subtitle, action, extra, children }: Props) {
  const { pathname } = useRouter();
  const { user, isAdmin, overview } = useSession();
  const { mode, setMode, language, setLanguage } = usePreferences();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const feed = useLoad(() => api<NotificationFeed>('/notifications?limit=50'), []).data;
  useBrowserNoticeDelivery(user, feed);
  const inbox = useLoad(() => (isAdmin ? api<Suggestion[]>('/payment-suggestions?status=pending') : Promise.resolve([])), [isAdmin]).data;
  const counts = { open: overview?.counts.open, unread: feed?.unread_count, inbox: inbox?.length };
  const dark = mode === 'dark';
  useEffect(() => { setMenuOpen(false); setAccountOpen(false); }, [pathname]);
  useEffect(() => {
    if (!accountOpen) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) setAccountOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setAccountOpen(false); accountButtonRef.current?.focus(); }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [accountOpen]);
  // The workspace stylesheets lay out some pages by body[data-page] (as in the main branch).
  useEffect(() => { document.body.dataset.page = pathname === '/' ? 'overview' : pathname.slice(1); }, [pathname]);

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      window.location.assign('/login');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  const navigation = sections(isAdmin).filter((s) => !s.admin || isAdmin).map((section) => (
    <div key={section.title}>
      <span className="nav-section">{section.title}</span>
      {section.items.map((item) => {
        const active = pathname === item.href;
        const count = item.count ? counts[item.count] : undefined;
        return (
          <Link key={item.href} href={item.href} className={`nav-item${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined} title={item.label} onClick={() => setMenuOpen(false)}>
            <span className="nav-icon" aria-hidden="true">{item.icon}</span> {item.label}
            {count ? <span className="nav-count">{count}</span> : null}
          </Link>
        );
      })}
    </div>
  ));

  return (
    <div className="app-layout">
      <Head><title>{`${title} · Invoice Keeper`}</title></Head>
      <a className="skip-link" href="#main-content">{t('К содержимому')}</a>
      <aside className="sidebar">
        <Link className="brand" href="/"><img src="/favicon.svg" alt="" width={36} height={36} /><span>invoice<span className="brand-light">keeper</span></span></Link>
        <nav aria-label={t('Разделы')}>
          {navigation}
        </nav>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <button type="button" className="menu-toggle" aria-label={t('Открыть меню')} aria-expanded={menuOpen} onClick={() => { setAccountOpen(false); setMenuOpen(true); }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
            <Link href="/">invoicekeeper</Link>
          </div>
          <span className="workspace-breadcrumb">{t('Рабочее пространство')} <span className="breadcrumb">/</span> <b>{title}</b></span>
          <div className="topbar-right">
            <button type="button" className="theme-toggle lang-toggle" onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}
              aria-label={language === 'ru' ? 'Switch to English' : 'Переключить на русский'} title={language === 'ru' ? 'English' : 'Русский'}> {/* i18n-ignore: language names */}
              {language === 'ru' ? 'EN' : 'RU'}
            </button>
            <button type="button" className="theme-toggle" onClick={() => setMode(dark ? 'light' : 'dark')}
              aria-label={dark ? t('Включить светлую тему') : t('Включить тёмную тему')} title={dark ? t('Включить светлую тему') : t('Включить тёмную тему')}>
              {dark ? ws.sun : ws.moon}
            </button>
            <div className="account-control" ref={accountRef} onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false);
            }}>
              <button ref={accountButtonRef} type="button" className="account-trigger" aria-label={t('Меню аккаунта')}
                aria-expanded={accountOpen} aria-controls={accountOpen ? 'account-dropdown' : undefined}
                title={`${user.display_name || user.username} · ${t('Аккаунт')}`} onClick={() => setAccountOpen((open) => !open)}>
                <span aria-hidden="true">{Array.from(user.display_name || user.username)[0]?.toUpperCase()}</span>
              </button>
              {accountOpen && <div className="account-dropdown" id="account-dropdown">
                <div className="account-identity"><strong>{user.display_name || user.username}</strong><span>@{user.username}</span></div>
                <Link href="/account" onClick={() => setAccountOpen(false)}>{t('Аккаунт')}</Link>
                <button type="button" onClick={logout}>{t('Выйти')}</button>
              </div>}
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <section className="page-heading">
            <div>
              <h1>{heading}</h1>
              {subtitle && <p className="muted">{subtitle}</p>}
            </div>
            {extra}
            {action ?? (isAdmin && (
              <button className="button primary" type="button" onClick={() => setCreating(true)}>
                <span className="button-icon" aria-hidden="true">{ws.plus}</span> {t('Добавить платёж')}
              </button>
            ))}
          </section>
          {children}
        </main>
        <footer className="app-footer">
          <span>invoicekeeper <span className="footer-dot">·</span> {t('один платёж — одной заботой меньше')}</span>
          <span>{t('Сделано для спокойной работы')} ↗</span>
        </footer>
      </div>
      {menuOpen && <Modal title={t('Разделы')} eyebrow="" onClose={() => setMenuOpen(false)}>
        <nav className="mobile-navigation" aria-label={t('Разделы')}>{navigation}</nav>
        <div className="mobile-account"><Link href="/account" onClick={() => setMenuOpen(false)}>{user.display_name} · {t('Аккаунт')}</Link>
          <button className="text-button" type="button" onClick={logout}>{t('Выйти')}</button></div>
        <div className="mobile-preferences"><Switches /></div>
      </Modal>}
      {creating && <CreatePaymentModal onClose={() => setCreating(false)} />}
    </div>
  );
}

/** The brand mark (login page and extension pages). */
export function Logo({ size = 36 }: { dark?: boolean; size?: number }) {
  return <img src="/favicon.svg" alt="" width={size} height={size} />;
}

/** Theme and language toggles for pages outside the panel (sign-in). */
export function Switches({ compact = false }: { compact?: boolean }) {
  const { mode, setMode, language, setLanguage } = usePreferences();
  const dark = mode === 'dark';
  return (
    <span className="topbar-right">
      <button type="button" className="theme-toggle lang-toggle" onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}>{language === 'ru' ? 'EN' : 'RU'}</button>
      {!compact && (
        <button type="button" className="theme-toggle" onClick={() => setMode(dark ? 'light' : 'dark')} aria-label={dark ? t('Включить светлую тему') : t('Включить тёмную тему')}>
          {dark ? ws.sun : ws.moon}
        </button>
      )}
    </span>
  );
}
