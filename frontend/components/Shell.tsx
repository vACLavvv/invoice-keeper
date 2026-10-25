import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState, type ReactNode } from 'react';
import { api, type NotificationFeed, type Occurrence, type Suggestion } from '@/lib/api';
import { date } from '@/lib/format';
import { t } from '@/lib/i18n';
import { usePreferences } from '@/lib/preferences';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
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
  const { user, settings, isAdmin } = useSession();
  const { mode, setMode, language, setLanguage } = usePreferences();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const open = useLoad(() => api<Occurrence[]>('/payment-occurrences?include_archived=false'), []).data;
  const feed = useLoad(() => api<NotificationFeed>('/notifications'), []).data;
  const inbox = useLoad(() => (isAdmin ? api<Suggestion[]>('/payment-suggestions?status=pending') : Promise.resolve([])), [isAdmin]).data;
  const counts = { open: open?.filter((o) => o.status !== 'paid').length, unread: feed?.unread_count, inbox: inbox?.length };
  const dark = mode === 'dark';
  useEffect(() => { setMenuOpen(false); }, [pathname]);
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
        <div className="workspace-label">
          <span className="workspace-avatar">IK</span>
          <span>{t('Финансы команды')}<small>{t('Рабочее пространство')}</small></span>
          <span className="small-dot" title={settings.telegram_enabled ? t('Напоминания в Telegram включены') : t('Telegram не подключён')} />
        </div>
        <nav aria-label={t('Разделы')}>
          {navigation}
        </nav>
        <div className="sidebar-bottom">
          <button className="profile" type="button" onClick={logout} title={t('Выйти из учётной записи')}>
            <span className="profile-avatar">{(user.display_name || user.username).slice(0, 1).toUpperCase()}</span>
            <span>{user.display_name}<small>{isAdmin ? t('Администратор') : '@' + user.username}</small></span>
            <span className="logout-icon" aria-hidden="true">⇥</span>
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <button type="button" className="menu-toggle" aria-label={t('Открыть меню')} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
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
            <Link className="bell-button" href="/notifications" aria-label={t('Уведомления: {n} непрочитанных', { n: counts.unread ?? 0 })}>
              {ws.bell} <span>{counts.unread ?? 0}</span>
            </Link>
            <time className="workspace-date" dateTime={settings.today} title={settings.timezone}>{date(settings.today, { day: 'numeric', month: 'long', year: 'numeric' })}</time>
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
