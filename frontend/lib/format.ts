export type Currency = 'RUB' | 'USD' | 'EUR';
export type Status = 'paid' | 'unpaid' | 'overdue';

export const currencies: Currency[] = ['RUB', 'USD', 'EUR'];
export const symbols: Record<Currency, string> = { RUB: '₽', USD: '$', EUR: '€' };
export const currencyNames: Record<Currency, string> = { RUB: 'Российский рубль', USD: 'Доллар США', EUR: 'Евро' };
export const statusNames: Record<Status, string> = { paid: 'Оплачено', unpaid: 'К оплате', overdue: 'Просрочено' };

export function money(value: string | number): string {
  const n = Number(value);
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
}

export function moneyWith(value: string | number, currency: Currency): string {
  return `${money(value)} ${symbols[currency]}`;
}

// Dates are calendar days (YYYY-MM-DD); noon avoids shifting the day in any browser timezone.
export function date(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return value ? new Intl.DateTimeFormat('ru-RU', options).format(new Date(value.slice(0, 10) + 'T12:00:00')) : '—';
}

export const longDate = (value: string | null | undefined) => date(value, { day: 'numeric', month: 'long', year: 'numeric' });

export function plural(n: number, one: string, few: string, many: string): string {
  if (n % 10 === 1 && n % 100 !== 11) return one;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return few;
  return many;
}

export function monthLabel(month: string): string {
  const label = date(month + '-01', { month: 'long', year: 'numeric' }).replace(/ г\.$/, '');
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
