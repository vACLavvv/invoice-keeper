import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, type ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { api, type Occurrence } from '@/lib/api';
import { date } from '@/lib/format';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { icons } from './icons';
import { CreatePaymentModal } from './PaymentModals';
import { Sticker } from './ui';

const nav = [
  { href: '/', label: 'Платежи', icon: icons.payments },
  { href: '/recurring', label: 'Регулярные', icon: icons.recurring },
  { href: '/calendar', label: 'Календарь', icon: icons.calendar },
  { href: '/team', label: 'Команда', icon: icons.team, admin: true },
  { href: '/activity', label: 'Журнал', icon: icons.activity, admin: true },
];

type Props = {
  /** Huge faded word above the heading, e.g. «ПЛАТЕЖИ». */
  title: string;
  heading: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
};

export function Shell({ title, heading, subtitle, action, children }: Props) {
  const router = useRouter();
  const { user, settings, isAdmin } = useSession();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  // Periods that are due today or late: what needs attention right now.
  const { data: open } = useLoad(() => api<Occurrence[]>('/payment-occurrences?include_archived=false'), []);
  const due = open?.filter((o) => o.status !== 'paid' && o.due_date <= settings.today).length ?? 0;

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      window.location.assign('/login');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <Layout>
      <Head><title>{`${title} · Invoice Keeper`}</title></Head>
      <Sidebar>
        <Account>
          <AccountRow>
            <span title={user.display_name}>@{user.username}</span>
            <Bell href="/" aria-label={due ? `${due} к оплате сегодня или просрочено` : 'Нет срочных платежей'}>
              {icons.bell}
              {due > 0 && <BellBadge>{due}</BellBadge>}
            </Bell>
          </AccountRow>
          <AccountRow>
            <Today>{date(settings.today, { day: 'numeric', month: 'short' }).replace('.', '')}</Today>
            <Sticker $tilt={-8} title={settings.telegram_enabled ? 'Напоминания в Telegram включены' : 'Telegram не подключён'}>
              {settings.telegram_enabled ? 'tg ✓' : 'tg off'}
            </Sticker>
          </AccountRow>
        </Account>
        <Nav aria-label="Разделы">
          {nav.filter((item) => !item.admin || isAdmin).map((item) => {
            const active = router.pathname === item.href;
            return (
              <NavItem key={item.href} href={item.href} $active={active} aria-current={active ? 'page' : undefined}>
                {item.label}{item.icon}
              </NavItem>
            );
          })}
        </Nav>
        <Bottom>
          {isAdmin && (
            <AddButton type="button" onClick={() => setCreating(true)}>
              Добавить платёж <Plus aria-hidden="true">+</Plus>
            </AddButton>
          )}
          <NavItem href="/api/v1/docs" target="_blank" rel="noopener" $active={false}>Документация API{icons.docs}</NavItem>
          <NavButton type="button" onClick={logout}>Выйти{icons.logout}</NavButton>
          <LogoLink href="/" aria-label="Invoice Keeper — на главную"><Logo /></LogoLink>
        </Bottom>
      </Sidebar>
      <Surface>
        <Header>
          <div>
            <Ghost aria-hidden="true">{title}</Ghost>
            <h1>{heading}</h1>
            {subtitle && <Subtitle>{subtitle}</Subtitle>}
          </div>
          <HeaderSide>
            <Meta>{date(settings.today, { day: 'numeric', month: 'long', year: 'numeric' })} · {settings.timezone}</Meta>
            {action}
          </HeaderSide>
        </Header>
        <Content>{children}</Content>
      </Surface>
      {creating && <CreatePaymentModal onClose={() => setCreating(false)} />}
    </Layout>
  );
}

/** Black receipt mark on a white tile; inverted for light pages. */
export function Logo({ dark = false, size = 36 }: { dark?: boolean; size?: number }) {
  const [tile, mark] = dark ? ['#111214', '#fff'] : ['#fff', '#111214'];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="11" fill={tile} />
      <path d="M15 12h18v25l-4-3-5 3-5-3-4 3V12Z" fill={mark} />
      <path d="m20 23 3 3 6-7" fill="none" stroke={tile} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const sidebarWidth = '23.6rem';

const Layout = styled.div`
  min-height: 100vh;
  display: grid;
  grid-template-columns: ${sidebarWidth} minmax(0, 1fr);
  ${({ theme }) => theme.mobile} { grid-template-columns: minmax(0, 1fr); }
`;

const Sidebar = styled.aside`
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 2.4rem;
  padding: 4.8rem 2rem 2rem;
  ${({ theme }) => theme.mobile} {
    position: static;
    height: auto;
    padding: 1.6rem 1.6rem 0;
    gap: 1.2rem;
  }
`;

const Account = styled.div`
  border: 1px solid ${({ theme }) => theme.color.line};
  border-radius: ${({ theme }) => theme.radius.lg};
`;

const AccountRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.2rem 1.4rem;
  color: ${({ theme }) => theme.color.strong};
  & + & { border-top: 1px solid ${({ theme }) => theme.color.line}; }
  > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1.6rem; }
`;

const Bell = styled(Link)`
  position: relative;
  display: inline-grid;
  color: ${({ theme }) => theme.color.strong};
`;

const BellBadge = styled.span`
  position: absolute;
  top: -0.7rem;
  right: -0.8rem;
  min-width: 1.6rem;
  height: 1.6rem;
  padding: 0 0.4rem;
  display: grid;
  place-items: center;
  border-radius: 0.4rem;
  background: ${({ theme }) => theme.color.accent};
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  transform: rotate(8deg);
`;

const Today = styled.span`
  font-size: 2.4rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  white-space: nowrap;
`;

const Nav = styled.nav`
  display: grid;
  gap: 0.2rem;
  ${({ theme }) => theme.mobile} { display: flex; overflow-x: auto; padding-bottom: 0.4rem; }
`;

const navItem = css<{ $active?: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.6rem;
  width: 100%;
  padding: 1rem 1rem;
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.text};
  font-size: 1.5rem;
  text-align: left;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
  svg { color: ${({ theme }) => theme.color.muted}; flex-shrink: 0; }
  &:hover { background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.strong}; }
  ${({ $active, theme }) => $active && css`
    background: ${theme.color.tile};
    color: ${theme.color.strong};
    svg { color: ${theme.color.accent}; }
    &:hover { background: ${theme.color.tile}; }
  `}
  ${({ theme }) => theme.mobile} { width: auto; svg { display: none; } }
`;

const NavItem = styled(Link)<{ $active: boolean }>`${navItem}`;
const NavButton = styled.button<{ $active?: boolean }>`${navItem}`;

const Bottom = styled.div`
  margin-top: auto;
  display: grid;
  gap: 0.2rem;
  ${({ theme }) => theme.mobile} { display: flex; overflow-x: auto; margin-top: 0; > * { margin: 0; } }
`;

const AddButton = styled.button`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.6rem;
  padding: 1.1rem 1.2rem;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.tile};
  color: ${({ theme }) => theme.color.strong};
  font-size: 1.5rem;
  transition: background 0.15s;
  &:hover { background: ${({ theme }) => theme.color.tileHover}; }
`;

const Plus = styled.span`
  color: ${({ theme }) => theme.color.accent};
  font-size: 2.2rem;
  line-height: 1;
`;

const LogoLink = styled(Link)`
  margin: 2rem 0 0 1rem;
  justify-self: start;
  ${({ theme }) => theme.mobile} { display: none; }
`;

const Surface = styled.main`
  min-width: 0;
  margin: 4.8rem 1.2rem 1.2rem 0;
  padding: 6.4rem 4.8rem 4.8rem;
  border-radius: ${({ theme }) => theme.radius.xl};
  background: ${({ theme }) => theme.color.surface};
  ${({ theme }) => theme.mobile} { margin: 1.6rem 0 0; padding: 3.2rem 1.6rem; border-radius: ${({ theme }) => theme.radius.xl} ${({ theme }) => theme.radius.xl} 0 0; }
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 2.4rem;
  flex-wrap: wrap;
  margin-bottom: 3.2rem;
  h1 {
    font-size: 2.6rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: ${({ theme }) => theme.color.strong};
    text-transform: lowercase;
  }
`;

const Ghost = styled.div`
  font-size: 5.6rem;
  line-height: 0.9;
  font-weight: 900;
  font-style: italic;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.ghost};
  user-select: none;
  ${({ theme }) => theme.mobile} { font-size: 4rem; }
`;

const Subtitle = styled.p`
  margin-top: 0.6rem;
  color: ${({ theme }) => theme.color.muted};
`;

const HeaderSide = styled.div`
  display: grid;
  justify-items: end;
  gap: 1.2rem;
  ${({ theme }) => theme.mobile} { justify-items: start; }
`;

const Meta = styled.span`
  color: ${({ theme }) => theme.color.muted};
  font-size: 1.3rem;
`;

const Content = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2.4rem;
  ${({ theme }) => theme.mobile} { gap: 1.6rem; }
`;
