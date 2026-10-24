import { useState } from 'react';
import styled, { css } from 'styled-components';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { PayModal } from '@/components/PaymentModals';
import { Shell } from '@/components/Shell';
import { Muted, Notice } from '@/components/ui';
import { api, type Forecast, type Occurrence } from '@/lib/api';
import { moneyWith, statusName, type Status } from '@/lib/format';
import { locale, t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';

// Monday-first short weekday names in the current language (5 Jan 2026 is a Monday).
const weekdays = () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(2026, 0, 5 + i)));

export default function CalendarPage() {
  const { month, settings } = useSession();
  const [paying, setPaying] = useState<Occurrence | Forecast | null>(null);
  const { data, error } = useLoad(() => api<Occurrence[]>('/payment-occurrences'), []);

  const [year, m] = month.split('-').map(Number);
  const leading = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  const days = new Date(year, m, 0).getDate();
  // Periods exist only through next month; later dates come from the schedule and can be paid ahead.
  const forecast = useLoad(() => api<Forecast[]>(`/payment-forecast?from_date=${month}-01&to_date=${month}-${days}`), [month]).data ?? [];
  const trailing = (7 - ((leading + days) % 7)) % 7;
  const items = (data ?? []).filter((o) => o.due_date.startsWith(month));

  return (
    <Shell title={t('Календарь')} heading={t('календарь оплат')} subtitle={t('Как распределяются расходы в течение месяца.')}>
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      <MonthSwitcher hint={t('план расходов по датам')} />
      {forecast.length > 0 && <Muted as="p">{t('Пунктиром — будущие сроки по графику. Нажмите, чтобы оплатить заранее.')}</Muted>}
      <Grid>
        {weekdays().map((d) => <Weekday key={d}>{d}</Weekday>)}
        {Array.from({ length: leading }, (_, i) => <Day key={'lead' + i} $blank aria-hidden="true" />)}
        {Array.from({ length: days }, (_, i) => {
          const day = `${month}-${String(i + 1).padStart(2, '0')}`;
          return (
            <Day key={day} $today={day === settings.today}>
              <DayNumber>{i + 1}</DayNumber>
              {items.filter((o) => o.due_date === day).map((o) => (
                <Item key={o.id} type="button" $status={o.status} onClick={() => setPaying(o)}
                  title={`${o.title} · ${moneyWith(o.amount, o.currency)} · ${statusName(o.status)}`}>
                  <span>{o.title}</span>
                  <b>{moneyWith(o.amount, o.currency)}</b>
                </Item>
              ))}
              {forecast.filter((f) => f.due_date === day).map((f) => (
                <Item key={`plan-${f.recurring_payment_id}`} type="button" $status="planned" onClick={() => setPaying(f)}
                  title={`${f.title} · ${moneyWith(f.amount, f.currency)} · ${t('по графику, можно оплатить заранее')}`}>
                  <span>{f.title}</span>
                  <b>{moneyWith(f.amount, f.currency)}</b>
                </Item>
              ))}
            </Day>
          );
        })}
        {Array.from({ length: trailing }, (_, i) => <Day key={'tail' + i} $blank aria-hidden="true" />)}
      </Grid>
      {paying && <PayModal occurrence={paying} onClose={() => setPaying(null)} />}
    </Shell>
  );
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.6rem;
  ${({ theme }) => theme.mobile} { grid-template-columns: 1fr; }
`;

const Weekday = styled.div`
  padding: 0 0.4rem 0.4rem;
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.muted};
  text-transform: lowercase;
  ${({ theme }) => theme.mobile} { display: none; }
`;

const Day = styled.div<{ $blank?: boolean; $today?: boolean }>`
  min-height: 11.6rem;
  padding: 0.8rem;
  display: grid;
  align-content: start;
  gap: 0.6rem;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.tile};
  ${({ $blank, theme }) => $blank && css`background: none; border: 1px dashed ${theme.color.line}; ${theme.mobile} { display: none; }`}
  ${({ $today, theme }) => $today && css`
    box-shadow: inset 0 0 0 1px ${theme.color.accent};
    ${DayNumber} { background: ${theme.color.accent}; color: #fff; }
  `}
  ${({ theme }) => theme.mobile} { min-height: auto; }
`;

const DayNumber = styled.span`
  justify-self: start;
  min-width: 2.6rem;
  padding: 0.1rem 0.7rem;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.strong};
  text-align: center;
`;

const Item = styled.button<{ $status: Status | 'planned' }>`
  display: grid;
  gap: 0.2rem;
  padding: 0.6rem 0.8rem;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.inset};
  color: ${({ theme }) => theme.color.text};
  text-align: left;
  font-size: 1.2rem;
  border-left: 0.3rem solid ${({ theme, $status }) => ({ paid: theme.color.paid, unpaid: theme.color.unpaid, overdue: theme.color.overdue, planned: theme.color.line })[$status]};
  ${({ $status, theme }) => $status === 'planned' && css`
    background: none;
    border: 1px dashed ${theme.color.line};
    border-left-width: 0.3rem;
  `}
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${({ theme }) => theme.color.muted}; }
  b { font-weight: 500; color: ${({ theme }) => theme.color.strong}; }
  &:hover { background: ${({ theme }) => theme.color.surface}; }
`;
