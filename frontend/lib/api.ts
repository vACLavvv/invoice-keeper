import type { Currency, Frequency, Status } from './format';
import { t } from './i18n';

export type User = { id: number; username: string; display_name: string; role: 'admin' | 'user'; csrf_token: string };
export type Settings = {
  timezone: string; today: string; telegram_enabled: boolean; team_chat: boolean; bot_username: string;
  reminder_days: number; reminder_interval_seconds: number; support_telegram: string; support_email: string;
};
export type Person = { id: number; display_name: string; username: string };
export type Occurrence = {
  id: number; recurring_payment_id: number; title: string; amount: string; currency: Currency; due_date: string;
  paid_at: string | null; status: Status; days_overdue: number; is_late: boolean; active: boolean; updated_by: string | null;
  frequency: Frequency; category: string | null; assignee: Person | null; receipts: number;
};
export type Recurring = {
  id: number; title: string; amount: string; currency: Currency; first_due_date: string; anchor_day: number;
  frequency: Frequency; category: string | null; assignee: Person | null; active: boolean;
  paused: { from: string; until: string | null } | null; next_due_date: string | null;
  unpaid_count: number; created_at: string; deleted_at: string | null;
};
export type Totals = { total: string; paid: string; unpaid: string; overdue: string; count: number };
export type Summary = { from_date: string | null; to_date: string | null; currencies: Record<Currency, Totals> };
export type TeamUser = { id: number; username: string; display_name: string; role: 'user'; created_at: string };
export type Reminder = {
  occurrence_id: number; state: 'pending' | 'sending' | 'sent' | 'uncertain' | 'cancelled'; attempts: number;
  attempted_at: number | null; sent_at: string | null; message_id: string | null; error: string | null; title: string; due_date: string;
};
export type AuditEntry = { id: number; actor: string; action: string; entity: string; created_at: string };
export type ApiKey = { id: number; name: string; prefix: string; created_at: string; last_used_at: string | null };
export type Suggestion = {
  id: number; source_key: string; source_url: string | null; title: string; amount: string; currency: Currency; next_due_date: string;
  status: 'pending' | 'accepted' | 'rejected'; submitted_by: string; recurring_payment_id: number | null; created_at: string; updated_at: string;
};
export type Receipt = {
  id: number; kind: 'link' | 'file'; url: string | null; file_name: string | null; content_type: string | null;
  size: number | null; created_by: string; created_at: string; download_url: string | null;
};
export type BudgetLine = { planned: string; paid: string; remaining: string };
export type Budget = {
  year: number; currencies: Record<Currency, BudgetLine>;
  months: { month: string; currencies: Record<Currency, BudgetLine> }[];
  categories: { category: string | null; currencies: Record<Currency, BudgetLine> }[];
};
export type TelegramLink = { linked: boolean; username: string | null; linked_at: string | null; bot_username: string; available: boolean };
export type ImportRow = {
  line: number; title: string; amount: string; currency: string; first_due_date: string; frequency: string; category: string;
  errors: string[]; warnings: string[];
};
export type ImportResult = { dry_run: boolean; rows: ImportRow[]; errors: number; created: number };

type FieldError = { loc?: (string | number)[]; msg: string };

const fieldName = (field: string) => ({
  title: t('Название'), amount: t('Сумма'), currency: t('Валюта'), first_due_date: t('Дата первого платежа'),
  username: t('Логин'), display_name: t('Имя'), password: t('Пароль'), paid_at: t('Дата оплаты'),
  current_password: t('Текущий пароль'), new_password: t('Новый пароль'), code: t('Код'), url: t('Ссылка'),
  file: t('Файл'), category: t('Категория'), assignee_id: t('Ответственный'), until: t('Дата окончания'), frequency: t('Периодичность'),
} as Record<string, string>)[field] ?? field;

let csrfToken = '';
export const setCsrfToken = (token: string) => { csrfToken = token; };

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

/** JSON by default; a FormData body is sent as multipart (file uploads). */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isForm) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, {
      method: options.method ?? 'GET', headers, credentials: 'same-origin',
      body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(t('Нет связи с сервером. Проверьте соединение и повторите действие.'), 0);
  }
  if (response.status === 401 && path !== '/auth/login') {
    window.location.assign('/login');
    throw new ApiError(t('Сессия завершена'), 401);
  }
  if (response.status === 204) return null as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.detail;
    const message = typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map((e: FieldError) => {
        const field = e.loc?.length && e.loc.length > 1 ? String(e.loc[e.loc.length - 1]) : '';
        return field ? `${fieldName(field)}: ${e.msg}` : e.msg;
      }).join('. ')
      : '';
    throw new ApiError(message || t('Не удалось выполнить действие'), response.status, data?.code);
  }
  return data as T;
}

/** Query string for the payments list and its CSV export. */
export function query(params: Record<string, string | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) q.set(key, value);
  const s = q.toString();
  return s ? '?' + s : '';
}
