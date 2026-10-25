import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import styled from 'styled-components';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { PayModal } from '@/components/PaymentModals';
import { Pagination } from '@/components/Pagination';
import { Shell } from '@/components/Shell';
import { statusLabel } from '@/components/Workspace';
import { api, type CalendarView, type CalendarDay, type Forecast, type Occurrence } from '@/lib/api';
import { currencies, date, money, symbols, type Currency } from '@/lib/format';
import { locale, t } from '@/lib/i18n';
import { usePage } from '@/lib/pagination';
import { useLoad, useSession } from '@/lib/session';

const isOccurrence = (item: Occurrence | Forecast): item is Occurrence => 'id' in item;
const itemKey = (item: Occurrence | Forecast) => isOccurrence(item) ? `period-${item.id}` : `plan-${item.recurring_payment_id}-${item.due_date}`;
const totalText = (totals: Partial<Record<Currency, string>>) => currencies.filter((c) => totals[c] !== undefined).map((c) => `${money(totals[c]!)} ${symbols[c]}`).join(' · ');
const weekdays = () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(2026, 0, 5 + i)).toUpperCase());

export default function CalendarPage() {
  const { month, setMonth, settings } = useSession();
  const router = useRouter();
  const linkedMonth = router.query.month;
  useEffect(() => {
    if (typeof linkedMonth === 'string' && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(linkedMonth)) setMonth(linkedMonth);
  }, [linkedMonth, setMonth]);
  const [paying, setPaying] = useState<Occurrence | Forecast | null>(null);
  const [selectedDay, setSelectedDay] = useState('');
  const loaded = useLoad(() => api<CalendarView>(`/payments/calendar?month=${month}`), [month]);
  const data = loaded.data?.month === month ? loaded.data : null;
  const [year, m] = month.split('-').map(Number);
  const leading = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  const days = new Date(year, m, 0).getDate();
  const trailing = (7 - ((leading + days) % 7)) % 7;
  const byDate = new Map((data?.days ?? []).map((day) => [day.date, day]));
  const hasForecast = data?.days.some((day) => day.items.some((item) => !isOccurrence(item)));
  const showDay = (day: string) => { setSelectedDay(day); requestAnimationFrame(() => document.getElementById('calendar-selected-day')?.scrollIntoView({ block: 'start', behavior: 'smooth' })); };
  const more = (day: CalendarDay) => day.count > day.items.length && <button type="button" className="text-button" onClick={() => showDay(day.date)}>{t('Все платежи')} · {day.count} →</button>;
  return (
    <Shell title={t('Календарь')} heading={t('Календарь оплат')} subtitle={t('Посмотрите, как распределяются расходы в течение месяца.')}>
      {loaded.error && <div className="notice notice-error" role="alert">{loaded.error}</div>}
      <CalendarToolbar>
        <MonthSwitcher />
        <MonthlyTotal aria-live="polite" aria-busy={!data && !loaded.error}>
          <span className="month-total-label">{t('Итого за месяц')}</span>
          <div className="month-total-values">{loaded.error ? <span>{t('Не удалось рассчитать итог')}</span> : !data ? <span>{t('Загружаем…')}</span>
            : Object.keys(data.totals).length ? currencies.filter((c) => data.totals[c] !== undefined).map((c) => <strong key={c}>{money(data.totals[c]!)} {symbols[c]}</strong>) : <strong>0</strong>}</div>
        </MonthlyTotal>
      </CalendarToolbar>
      {hasForecast && <ForecastNote>{t('Пунктиром — будущие сроки по графику. Нажмите, чтобы оплатить заранее.')}</ForecastNote>}
      <CalendarViewport role="region" aria-label={t('Календарь оплат')} tabIndex={0}>
        <div className="calendar">
          {weekdays().map((day) => <div key={day} className="calendar-weekday">{day}</div>)}
          {Array.from({ length: leading }, (_, i) => <div key={'lead' + i} className="calendar-day blank" aria-hidden="true" />)}
          {Array.from({ length: days }, (_, i) => {
            const day = `${month}-${String(i + 1).padStart(2, '0')}`, entry = byDate.get(day);
            return <div key={day} className={`calendar-day${day === settings.today ? ' today' : ''}`}>
              <span className="calendar-number">{i + 1}</span>
              {entry?.items.map((item) => <button key={itemKey(item)} type="button" className={`calendar-item ${isOccurrence(item) ? item.status : 'unpaid projection'}`} onClick={() => setPaying(item)} title={`${item.title} · ${money(item.amount)} ${symbols[item.currency]}`}>{item.title}</button>)}
              {entry && <>{more(entry)}<strong className="calendar-day-total">{t('Итого:')} {totalText(entry.totals)}</strong></>}
            </div>;
          })}
          {Array.from({ length: trailing }, (_, i) => <div key={'tail' + i} className="calendar-day blank" aria-hidden="true" />)}
        </div>
      </CalendarViewport>
      <Agenda aria-label={t('Платежи по датам')}>
        {!data ? <div className="empty-state">{loaded.error ?? t('Загружаем…')}</div> : !data.days.length ? <div className="ledger empty-state"><b>{t('На этот месяц платежей нет')}</b>{t('Выберите другой месяц или добавьте платёж.')}</div> : data.days.map((day) => <section className="agenda-day" key={day.date}>
          <h2><time dateTime={day.date}>{date(day.date, { day: 'numeric', month: 'long', weekday: 'short' })}</time>{day.date === settings.today && <span>{t('Сегодня')}</span>}</h2>
          {day.items.map((item) => <PaymentButton key={itemKey(item)} item={item} onOpen={setPaying} />)}
          {more(day)}
          <p className="agenda-day-total"><strong>{t('Итого:')} {totalText(day.totals)}</strong></p>
        </section>)}
      </Agenda>
      {selectedDay.startsWith(month) && <DayPayments key={selectedDay} day={selectedDay} onOpen={setPaying} onClose={() => setSelectedDay('')} />}
      {paying && <PayModal occurrence={paying} onClose={() => setPaying(null)} />}
    </Shell>
  );
}

function PaymentButton({ item, onOpen }: { item: Occurrence | Forecast; onOpen: (item: Occurrence | Forecast) => void }) {
  return <button type="button" className="agenda-payment" onClick={() => onOpen(item)}>
    <b>{item.title}</b><strong>{money(item.amount)} <small>{symbols[item.currency]}</small></strong>
    <span className={`pill ${isOccurrence(item) ? item.status : 'archived'}`}>{isOccurrence(item) ? statusLabel(item.status) : t('По графику')}</span><span className="agenda-open" aria-hidden="true">›</span>
  </button>;
}
function DayPayments({ day, onOpen, onClose }: { day: string; onOpen: (item: Occurrence | Forecast) => void; onClose: () => void }) {
  const { data, error, setPage } = usePage<Occurrence | Forecast>('/payments/calendar/day', { date: day });
  return <SelectedDay id="calendar-selected-day" className="ledger">
    <div className="desk-panel-heading"><h2>{date(day, { day: 'numeric', month: 'long', year: 'numeric' })}</h2><button type="button" className="text-button" onClick={onClose}>{t('Закрыть')}</button></div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {!data ? <p>{t('Загружаем…')}</p> : data.items.map((item) => <PaymentButton key={itemKey(item)} item={item} onOpen={onOpen} />)}
    <Pagination data={data} onChange={setPage} />
  </SelectedDay>;
}
const SelectedDay = styled.section`
  margin-top: 24px; padding: 20px; scroll-margin-top: 90px;
  .agenda-payment { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; width: 100%; padding: 16px 0; border: 0; border-bottom: 1px solid var(--desk-border); background: transparent; color: var(--desk-ink); text-align: left; }
  .agenda-payment b { flex: 1 1 200px; overflow-wrap: anywhere; }
  .agenda-payment strong { white-space: nowrap; }
`;

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
  border: 1px solid var(--desk-border);
  border-radius: 12px;
  background: var(--desk-surface);
  color: var(--desk-ink);
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
  .agenda-payment b { grid-column: 1 / -1; overflow-wrap: anywhere; font-size: 16px; font-weight: 550; }
  .agenda-payment strong { grid-column: 1; font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .agenda-payment small { font-size: 14px; font-weight: 400; }
  .pill { grid-column: 1; justify-self: start; }
  .agenda-open { grid-column: 2; grid-row: 2 / 4; align-self: center; font-size: 24px; color: var(--desk-muted); }
  .agenda-day-total { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; margin: 12px 0 0; padding: 10px 16px 0; border-top: 1px solid var(--desk-border); color: var(--desk-ink); line-height: 1.5; }
  .agenda-day-total strong { min-width: 0; font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
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
