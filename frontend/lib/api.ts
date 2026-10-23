import type { Currency, Status } from './format';

export type User = { id: number; username: string; display_name: string; role: 'admin' | 'user'; csrf_token: string };
export type Settings = { timezone: string; today: string; telegram_enabled: boolean; reminder_days: number; reminder_interval_seconds: number };
export type Occurrence = {
  id: number; recurring_payment_id: number; title: string; amount: string; currency: Currency; due_date: string;
  paid_at: string | null; status: Status; days_overdue: number; is_late: boolean; active: boolean; updated_by: string | null;
};
export type Recurring = {
  id: number; title: string; amount: string; currency: Currency; first_due_date: string; anchor_day: number;
  frequency: 'monthly'; active: boolean; unpaid_count: number; created_at: string; deleted_at: string | null;
};
export type Totals = { total: string; paid: string; unpaid: string; overdue: string; count: number };
export type Summary = { from_date: string | null; to_date: string | null; currencies: Record<Currency, Totals> };
export type TeamUser = { id: number; username: string; display_name: string; role: 'user'; created_at: string };
export type Reminder = {
  occurrence_id: number; state: 'pending' | 'sending' | 'sent' | 'uncertain' | 'cancelled'; attempts: number;
  attempted_at: number | null; sent_at: string | null; message_id: string | null; error: string | null; title: string; due_date: string;
};
export type AuditEntry = { id: number; actor: string; action: string; entity: string; created_at: string };

type FieldError = { loc?: (string | number)[]; msg: string };

const fieldNames: Record<string, string> = {
  title: 'Название', amount: 'Сумма', currency: 'Валюта', first_due_date: 'Дата первого платежа',
  username: 'Логин', display_name: 'Имя', password: 'Пароль', paid_at: 'Дата оплаты',
};

let csrfToken = '';
export const setCsrfToken = (token: string) => { csrfToken = token; };

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, {
      method: options.method ?? 'GET', headers, credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('Нет связи с сервером. Проверьте соединение и повторите действие.', 0);
  }
  if (response.status === 401 && path !== '/auth/login') {
    window.location.assign('/login');
    throw new ApiError('Сессия завершена', 401);
  }
  if (response.status === 204) return null as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.detail;
    const message = typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map((e: FieldError) => {
        const field = e.loc?.length && e.loc.length > 1 ? String(e.loc[e.loc.length - 1]) : '';
        return field ? `${fieldNames[field] ?? field}: ${e.msg}` : e.msg;
      }).join('. ')
      : '';
    throw new ApiError(message || 'Не удалось выполнить действие', response.status);
  }
  return data as T;
}
