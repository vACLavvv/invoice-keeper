import { useState } from 'react';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { PayModal } from '@/components/PaymentModals';
import { Shell } from '@/components/Shell';
import { api, type Forecast, type Occurrence } from '@/lib/api';
import { money, symbols, type Currency } from '@/lib/format';
import { locale, t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';

// Monday-first short weekday names in the current language (5 Jan 2026 is a Monday).
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
  const forecast = useLoad(() => api<Forecast[]>(`/payment-forecast?from_date=${month}-01&to_date=${month}-${days}`), [month]).data ?? [];

  return (
    <Shell title={t('Календарь')} heading={t('Календарь оплат')} subtitle={t('Посмотрите, как распределяются расходы в течение месяца.')}>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <div className="period-heading">
        <MonthSwitcher />
        <span className="muted">{forecast.length > 0 ? t('Пунктиром — будущие сроки по графику. Нажмите, чтобы оплатить заранее.') : t('План расходов по датам и валютам')}</span>
      </div>
      <div className="calendar">
        {weekdays().map((d) => <div key={d} className="calendar-weekday">{d}</div>)}
        {Array.from({ length: leading }, (_, i) => <div key={'lead' + i} className="calendar-day blank" aria-hidden="true" />)}
        {Array.from({ length: days }, (_, i) => {
          const day = `${month}-${String(i + 1).padStart(2, '0')}`;
          const daily = items.filter((o) => o.due_date === day);
          const planned = forecast.filter((f) => f.due_date === day);
          const totals = new Map<Currency, number>();
          for (const x of [...daily, ...planned]) totals.set(x.currency, (totals.get(x.currency) ?? 0) + Number(x.amount));
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
              {totals.size > 0 && (
                <span className="calendar-day-total">{[...totals].map(([c, n]) => `${money(n)} ${symbols[c]}`).join(' · ')}</span>
              )}
            </div>
          );
        })}
        {Array.from({ length: trailing }, (_, i) => <div key={'tail' + i} className="calendar-day blank" aria-hidden="true" />)}
      </div>
      {paying && <PayModal occurrence={paying} onClose={() => setPaying(null)} />}
    </Shell>
  );
}
