import { locale, t, tp } from './i18n';

export type Currency = 'RUB' | 'USD' | 'EUR';
export type Status = 'paid' | 'unpaid' | 'overdue';
export type Frequency = 'monthly' | 'quarterly' | 'yearly';

export const currencies: Currency[] = ['RUB', 'USD', 'EUR'];
export const frequencies: Frequency[] = ['monthly', 'quarterly', 'yearly'];
export const symbols: Record<Currency, string> = { RUB: '₽', USD: '$', EUR: '€' };

export const currencyName = (c: Currency) => ({ RUB: t('рубли'), USD: t('доллары'), EUR: t('евро') })[c];
export const statusName = (s: Status) => ({ paid: t('оплачено'), unpaid: t('к оплате'), overdue: t('просрочено') })[s];
export const frequencyName = (f: Frequency) => ({ monthly: t('ежемесячно'), quarterly: t('ежеквартально'), yearly: t('ежегодно') })[f];
export const perPeriod = (f: Frequency) => ({ monthly: t('/ месяц'), quarterly: t('/ квартал'), yearly: t('/ год') })[f];

export function money(value: string | number): string {
  const n = Number(value);
  return new Intl.NumberFormat(locale(), { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
}

export function moneyWith(value: string | number, currency: Currency): string {
  return `${money(value)} ${symbols[currency]}`;
}

// Dates are calendar days (YYYY-MM-DD); noon avoids shifting the day in any browser timezone.
export function date(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return value ? new Intl.DateTimeFormat(locale(), options).format(new Date(value.slice(0, 10) + 'T12:00:00')) : '—';
}

export const longDate = (value: string | null | undefined) => date(value, { day: 'numeric', month: 'long', year: 'numeric' });
export const numericDate = (value: string | null | undefined) => date(value, { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Kept for existing callers: picks the Russian or English plural form. */
export function plural(n: number, one: string, few: string, many: string, english?: [string, string]): string {
  return tp(n, [one, few, many], english ?? [t(one), t(many)]);
}

export function monthLabel(month: string): string {
  const label = date(month + '-01', { month: 'long', year: 'numeric' }).replace(/ г\.$/, ''); // i18n-ignore: strips Russian «г.»
  return label[0].toUpperCase() + label.slice(1);
}

export function monthRange(month: string): { from_date: string; to_date: string } {
  const [y, m] = month.split('-').map(Number);
  return { from_date: `${month}-01`, to_date: `${month}-${new Date(y, m, 0).getDate()}` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  if (d.getFullYear() < 2000 || d.getFullYear() > 2100) return month;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
