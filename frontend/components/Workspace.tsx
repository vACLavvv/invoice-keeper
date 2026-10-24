import type { Occurrence, Totals } from '@/lib/api';
import { date, money, symbols, type Currency, type Frequency, type Status } from '@/lib/format';
import { t, tp } from '@/lib/i18n';
import { ws } from './icons';

// Pieces of the main-branch workspace shared by the overview, payments and history pages.

export const statusLabel = (s: Status) => ({ paid: t('Оплачено'), unpaid: t('К оплате'), overdue: t('Просрочено') })[s];

export const currencyTitle = (c: Currency) => ({ RUB: t('Российский рубль'), USD: t('Доллар США'), EUR: t('Евро') })[c];

export const kindLabel = (f: Frequency) =>
  ({ once: t('Разовый'), monthly: t('Ежемесячный'), quarterly: t('Ежеквартальный'), yearly: t('Ежегодный') })[f];

export const repeatLabel = (f: Frequency) =>
  ({ once: t('Разовый платёж'), monthly: t('Ежемесячно'), quarterly: t('Ежеквартально'), yearly: t('Ежегодно') })[f];

/** «Сегодня», «Завтра», «Через 5 дн.», «4 дн. задержки», «В срок». */
export function dueHint(o: Occurrence, today: string): string {
  if (o.is_late) return t('{n} дн. задержки', { n: o.days_overdue });
  if (o.status === 'paid') return t('В срок');
  const days = Math.round((Date.parse(o.due_date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  return days === 0 ? t('Сегодня') : days === 1 ? t('Завтра') : days > 1 ? t('Через {n} дн.', { n: days }) : '';
}

export const addDays = (day: string, n: number) => {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Rows of the overview panels: icon, title, kind and date, amount with status. */
export function WorkRows({ items, empty, onOpen }: { items: Occurrence[]; empty: string; onOpen: (o: Occurrence) => void }) {
  if (!items.length) return <p className="work-empty">{empty}</p>;
  return (
    <>
      {items.map((o) => (
        <button key={o.id} type="button" className="work-item" onClick={() => onOpen(o)}>
          <span className={`work-item-icon ${o.status}`}>{o.status === 'paid' ? ws.check : ws.receipt}</span>
          <span className="work-item-copy">
            <b>{o.title}{o.wallet?.sanctioned ? ' ⛔' : ''}</b>
            <small>{kindLabel(o.frequency)} · {o.paid_at ? t('Оплачено {date}', { date: date(o.paid_at) }) : date(o.due_date)}</small>
          </span>
          <span className="work-item-money">
            {money(o.amount)} <small>{symbols[o.currency]}</small>
            <span className={`work-item-state ${o.status}`}>{statusLabel(o.status)}</span>
          </span>
          <span className="work-item-arrow" aria-hidden="true">›</span>
        </button>
      ))}
    </>
  );
}

function moneySize(value: string) {
  const length = money(value).length;
  return length > 17 ? 'amount-giant' : length > 15 ? 'amount-extra-long' : length > 11 ? 'amount-long' : '';
}

/** «Осталось оплатить» card for one currency, with the paid share as a progress bar. */
export function SummaryCard({ currency, totals, onClick }: { currency: Currency; totals?: Totals; onClick?: () => void }) {
  const total = Number(totals?.total ?? 0);
  const paid = Number(totals?.paid ?? 0);
  const ratio = total ? Math.min(paid < total ? 99 : 100, Math.round((paid / total) * 100)) : 0;
  return (
    <article className={`summary-card currency-${currency.toLowerCase()}`} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="summary-top">
        <span className="currency-label">
          <span className="currency-symbol">{symbols[currency]}</span>
          <span>{currency}<small>{currencyTitle(currency)}</small></span>
        </span>
        <span className="currency-code" title={t('Оплачено {n}% суммы плана', { n: ratio })}>{ratio}%</span>
      </div>
      <p className="summary-caption">{t('Осталось оплатить')}</p>
      <div className={`summary-amount ${moneySize(totals?.unpaid ?? '0')}`}>{money(totals?.unpaid ?? 0)}<small>{symbols[currency]}</small></div>
      <progress className="summary-track" value={paid} max={total || 1} aria-label={t('Оплачено {n}%', { n: ratio })}>{ratio}%</progress>
      <div className="summary-bottom">
        <span>{t('Оплачено')} <b>{money(totals?.paid ?? 0)} {symbols[currency]}</b></span>
        <span>{t('План')} <b>{money(totals?.total ?? 0)} {symbols[currency]}</b></span>
      </div>
    </article>
  );
}

/** «3 / 7 задач месяца закрыто» ring next to the overview heading. */
export function MonthHealth({ paid, total }: { paid: number; total: number }) {
  const percent = total ? Math.round((paid / total) * 100) : 0;
  return (
    <div className="month-health" aria-live="polite">
      <svg className="health-ring" viewBox="0 0 56 56" aria-hidden="true">
        <circle className="health-track" cx="28" cy="28" r="23" fill="none" strokeWidth="3" />
        <circle className="health-value" cx="28" cy="28" r="23" fill="none" strokeWidth="3" pathLength="100" strokeDasharray={`${percent} 100`} transform="rotate(-90 28 28)" />
        <path className="health-check" d="m20 28 5 5 11-12" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div>
        <strong>{paid}<span> / {total}</span></strong>
        <small>{total ? t('задач месяца закрыто') : t('периодов в месяце')}</small>
      </div>
    </div>
  );
}

export const paymentsWord = (n: number) => tp(n, ['платёж', 'платежа', 'платежей'], ['payment', 'payments']);
