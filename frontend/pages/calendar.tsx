import { useState } from 'react';
import styled from 'styled-components';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { PayModal } from '@/components/PaymentModals';
import { Shell } from '@/components/Shell';
import { statusLabel } from '@/components/Workspace';
import { api, type Forecast, type Occurrence } from '@/lib/api';
import { currencies, money, symbols, type Currency } from '@/lib/format';
import { locale, t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';

// Monday-first short weekday names in the current language (5 Jan 2026 is a Monday).
const isOccurrence = (item: Occurrence | Forecast): item is Occurrence => 'id' in item;

function totalsByCurrency(items: Pick<Occurrence, 'amount' | 'currency'>[]): [Currency, number][] {
  const cents = new Map<Currency, number>();
  for (const item of items) cents.set(item.currency, (cents.get(item.currency) ?? 0) + Math.round(Number(item.amount) * 100));
  return currencies.filter((currency) => cents.has(currency)).map((currency) => [currency, cents.get(currency)! / 100]);
}

const weekdays = () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(2026, 0, 5 + i)).toUpperCase());

export default function CalendarPage() {
  const { month, settings } = useSession();
  const [paying, setPaying] = useState<Occurrence | Forecast | null>(null);
  const { data, error } = useLoad(() => api<Occurrence[]>('/payment-occurrences'), []);

  const [year, m] = month.split('-').map(Number);
  const leading = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  const days = new Date(year, m, 0).getDate();
  const trailing = (7 - ((leading + days) % 7)) % 7;
  const items = (data ?? []).filter((o) => o.due_date.startsWith(month));
  // Periods exist only through next month; later dates come from the schedule and can be paid ahead.
  const plannedPeriods = useLoad(async () => ({
    month,
    items: await api<Forecast[]>(`/payment-forecast?from_date=${month}-01&to_date=${month}-${days}`),
  }), [month]);
  const forecastData = plannedPeriods.data?.month === month ? plannedPeriods.data.items : null;
  // A paid-ahead period can arrive before the forecast refresh completes.
  const recorded = new Set(items.map((item) => `${item.recurring_payment_id}:${item.due_date}`));
  const forecast = (forecastData ?? []).filter((item) => !recorded.has(`${item.recurring_payment_id}:${item.due_date}`));
  const totalsReady = data !== null && forecastData !== null;
  const monthlyTotals = totalsByCurrency([...items, ...forecast]);
  const agendaDays = Array.from(new Set([...items, ...forecast].map((item) => item.due_date))).sort();

  return (
    <Shell title={t('Календарь')} heading={t('Календарь оплат')} subtitle={t('Посмотрите, как распределяются расходы в течение месяца.')}>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {plannedPeriods.error && <div className="notice notice-error" role="alert">{plannedPeriods.error}</div>}
      <CalendarToolbar>
        <MonthSwitcher />
        <MonthlyTotal aria-live="polite" aria-busy={!totalsReady && !error && !plannedPeriods.error}>
          <span className="month-total-label">{t('Итого за месяц')}</span>
          <div className="month-total-values">
            {error || plannedPeriods.error ? <span>{t('Не удалось рассчитать итог')}</span>
              : !totalsReady ? <span>{t('Загружаем…')}</span>
              : monthlyTotals.length ? monthlyTotals.map(([currency, amount]) => (
                <strong key={currency}>{money(amount)} {symbols[currency]}</strong>
              )) : <strong>0</strong>}
          </div>
        </MonthlyTotal>
      </CalendarToolbar>
      {forecast.length > 0 && <ForecastNote>{t('Пунктиром — будущие сроки по графику. Нажмите, чтобы оплатить заранее.')}</ForecastNote>}
      <CalendarViewport role="region" aria-label={t('Календарь оплат')} tabIndex={0}>
      <div className="calendar">
        {weekdays().map((d) => <div key={d} className="calendar-weekday">{d}</div>)}
        {Array.from({ length: leading }, (_, i) => <div key={'lead' + i} className="calendar-day blank" aria-hidden="true" />)}
        {Array.from({ length: days }, (_, i) => {
          const day = `${month}-${String(i + 1).padStart(2, '0')}`;
          const daily = items.filter((o) => o.due_date === day);
          const planned = forecast.filter((f) => f.due_date === day);
          const totals = totalsByCurrency([...daily, ...planned]);
          return (
            <div key={day} className={`calendar-day${day === settings.today ? ' today' : ''}`}>
              <span className="calendar-number">{i + 1}</span>
              {daily.map((o) => (
                <button key={o.id} type="button" className={`calendar-item ${o.status}`} onClick={() => setPaying(o)}
                  title={`${o.title} · ${money(o.amount)} ${symbols[o.currency]}`}>
                  {o.title}<strong>{money(o.amount)} {symbols[o.currency]}</strong>
                </button>
              ))}
              {planned.map((f) => (
                <button key={'plan-' + f.recurring_payment_id} type="button" className="calendar-item unpaid projection" onClick={() => setPaying(f)}
                  title={`${f.title} · ${money(f.amount)} ${symbols[f.currency]} · ${t('по графику, можно оплатить заранее')}`}>
                  {f.title}<strong>{money(f.amount)} {symbols[f.currency]} *</strong>
                </button>
              ))}
              {totals.length > 0 && (
                <strong className="calendar-day-total">{t('Итого:')} {totals.map(([c, n]) => `${money(n)} ${symbols[c]}`).join(' · ')}</strong>
              )}
            </div>
          );
        })}
        {Array.from({ length: trailing }, (_, i) => <div key={'tail' + i} className="calendar-day blank" aria-hidden="true" />)}
      </div>
      </CalendarViewport>
      <Agenda aria-label={t('Платежи по датам')}>
        {!totalsReady ? <div className="empty-state">{t('Загружаем…')}</div> : agendaDays.length === 0 ? (
          <div className="ledger empty-state"><b>{t('На этот месяц платежей нет')}</b>{t('Выберите другой месяц или добавьте платёж.')}</div>
        ) : agendaDays.map((day) => (
          <section className="agenda-day" key={day}>
            <h2><time dateTime={day}>{new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', weekday: 'short' }).format(new Date(day + 'T12:00:00'))}</time>{day === settings.today && <span>{t('Сегодня')}</span>}</h2>
            {[...items.filter((item) => item.due_date === day), ...forecast.filter((item) => item.due_date === day)].map((item) => (
              <button type="button" className="agenda-payment" key={'id' in item ? `period-${item.id}` : `plan-${item.recurring_payment_id}-${day}`} onClick={() => setPaying(item)}>
                <b>{item.title}</b>
                <strong>{money(item.amount)} <small>{symbols[item.currency]}</small></strong>
                <span className={`pill ${isOccurrence(item) ? item.status : 'archived'}`}>{isOccurrence(item) ? statusLabel(item.status) : t('По графику')}</span>
                <span className="agenda-open" aria-hidden="true">›</span>
              </button>
            ))}
          </section>
        ))}
      </Agenda>
      {paying && <PayModal occurrence={paying} onClose={() => setPaying(null)} />}
    </Shell>
  );
}

const CalendarToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px 24px;
  margin-bottom: 20px;
  > .period-switcher { min-width: 0; }
  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
`;

const MonthlyTotal = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 20px;
  min-width: 0;
  max-width: 100%;
  margin-left: auto;
  padding: 14px 18px;
  border: 1px solid #202126;
  border-radius: 12px;
  background: #202126;
  color: #ffffff;
  line-height: 1.4;
  .month-total-label { font-size: 14px; font-weight: 600; }
  .month-total-values { display: flex; flex-wrap: wrap; gap: 8px 20px; min-width: 0; font-size: 14px; }
  strong { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  @media (max-width: 720px) {
    margin-left: 0;
    padding: 14px 16px;
    flex-direction: column;
    gap: 6px;
    .month-total-values { max-width: 100%; }
  }
`;

const ForecastNote = styled.p`
  margin: -6px 0 18px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--desk-muted);
`;

const Agenda = styled.div`
  display: none;
  @media (max-width: 720px) {
    display: grid;
    gap: 24px;
    min-width: 0;
  }
  h2 { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 0 0 10px; font-size: 16px; font-weight: 600; }
  h2 > span { color: var(--desk-accent); font-size: 14px; }
  .agenda-payment { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; padding: 16px; background: var(--desk-surface); border: 1px solid var(--desk-border); border-radius: 12px; text-align: left; color: var(--desk-ink); }
  .agenda-payment + .agenda-payment { margin-top: 8px; }
  b { grid-column: 1 / -1; overflow-wrap: anywhere; font-size: 16px; font-weight: 550; }
  strong { grid-column: 1; font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  small { font-size: 14px; font-weight: 400; }
  .pill { grid-column: 1; justify-self: start; }
  .agenda-open { grid-column: 2; grid-row: 2 / 4; align-self: center; font-size: 24px; color: var(--desk-muted); }
`;

const CalendarViewport = styled.div`
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  border-radius: var(--desk-radius);
  &:focus-visible {
    outline: 2px solid var(--apple-blue);
    outline-offset: 3px;
  }
  .calendar { min-width: 700px; }
  && .calendar-day-total {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.5;
    color: var(--desk-ink);
    font-variant-numeric: tabular-nums;
    text-decoration: none;
  }
  @media (max-width: 720px) {
    display: none;
  }
`;
