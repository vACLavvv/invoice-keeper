import { DeletePaymentModal } from '@/components/DeletePaymentModal';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { MonthSwitcher } from './MonthSwitcher';
import { PayModal, ReceiptsModal } from './PaymentModals';
import { ws } from './icons';
import { addDays, dueHint, paymentsWord, repeatLabel, statusLabel } from './Workspace';
import { api, query, type Occurrence, type TeamUser } from '@/lib/api';
import { currencies, date, money, monthRange, symbols, type Currency, type Frequency } from '@/lib/format';
import { t, tp } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';

type Mode = 'payments' | 'history';
type Range = 'all' | 'week' | 'month';
type Kind = '' | 'once' | 'repeat';
type HistoryFilter = 'all' | 'paid' | 'archived';

/** «К оплате» (open periods) and «История» (paid and archived) in the ledger of the main branch. */
export function Ledger({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { settings, month, setMonth, isAdmin, user } = useSession();
  const history = mode === 'history';
  const [range, setRange] = useState<Range>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [kind, setKind] = useState<Kind>('');
  const [currency, setCurrency] = useState<Currency | ''>('');
  const [category, setCategory] = useState('');
  const [assignee, setAssignee] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [deleting, setDeleting] = useState<Occurrence | null>(null);
  const [paying, setPaying] = useState<Occurrence | null>(null);
  const [receipts, setReceipts] = useState<Occurrence | null>(null);
  const [opening, setOpening] = useState(false);
  const [linkedError, setLinkedError] = useState<string | null>(null);
  const linkedOccurrence = typeof router.query.occurrence === 'string' && /^[1-9]\d*$/.test(router.query.occurrence)
    ? router.query.occurrence : '';

  // Journal links identify an exact period, including one outside the visible
  // history filters. A stale link receives the same access checks as any period.
  useEffect(() => {
    let current = true;
    setLinkedError(null);
    if (!linkedOccurrence) { setOpening(false); return; }
    setPaying(null);
    setOpening(true);
    api<Occurrence>(`/payment-occurrences/${linkedOccurrence}`)
      .then((occurrence) => { if (current) setPaying(occurrence); })
      .catch((e: Error) => { if (current) setLinkedError(e.message); })
      .finally(() => { if (current) setOpening(false); });
    return () => { current = false; };
  }, [linkedOccurrence]);

  function closePayment() {
    setPaying(null);
    if (linkedOccurrence) {
      const { occurrence: _occurrence, ...rest } = router.query;
      void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true, scroll: false });
    }
  }

  // Links from the overview tiles: ?view=overdue|week|once, ?currency=USD.
  useEffect(() => {
    const { view, currency: c } = router.query;
    if (view === 'overdue') setOverdueOnly(true);
    if (view === 'week') setRange('week');
    if (view === 'once') setKind('once');
    if (c === 'RUB' || c === 'USD' || c === 'EUR') setCurrency(c);
  }, [router.query]);

  const { data, error } = useLoad(() => api<Occurrence[]>('/payment-occurrences' + query({ category, assignee })), [category, assignee]);
  const everything = useLoad(() => api<Occurrence[]>('/payment-occurrences'), []).data;
  const users = useLoad(() => (isAdmin ? api<TeamUser[]>('/users') : Promise.resolve([])), [isAdmin]).data ?? [];
  const categories = useMemo(() => [...new Set((everything ?? []).map((o) => o.category).filter(Boolean) as string[])].sort(), [everything]);

  const weekEnd = addDays(settings.today, 7);
  const base = (data ?? []).filter((o) => (history
    ? (o.status === 'paid' || !o.active) && (historyFilter === 'all' || (historyFilter === 'paid' ? o.status === 'paid' : !o.active))
    : o.active && o.status !== 'paid'));
  const q = search.trim().toLocaleLowerCase();
  const filtered = base.filter((o) => (range === 'all'
      || (range === 'month' ? ((history && o.paid_at) || o.due_date).startsWith(month) : o.due_date >= settings.today && o.due_date <= weekEnd))
    && (!kind || (kind === 'once') === (o.frequency === 'once'))
    && (!currency || o.currency === currency)
    && (!q || o.title.toLocaleLowerCase().includes(q) || (o.description ?? '').toLocaleLowerCase().includes(q)));
  const overdue = filtered.filter((o) => o.status === 'overdue');
  const items = (overdueOnly && !history ? overdue : filtered).slice();
  if (history) items.sort((a, b) => (b.paid_at ?? '').localeCompare(a.paid_at ?? '') || b.id - a.id);
  const filterCount = [kind, currency, category, assignee, history && historyFilter !== 'all'].filter(Boolean).length;
  const anyFilter = !!(q || currency || kind || category || assignee || range !== 'all' || overdueOnly || (history && historyFilter !== 'all'));
  const allOverdue = (data ?? []).filter((o) => o.active && o.status === 'overdue');
  const exportUrl = '/api/v1/payment-occurrences/export' + query({
    ...(range === 'month' ? monthRange(month) : {}), currency, category, assignee, search: search.trim(),
    status: history ? (historyFilter === 'paid' ? 'paid' : '') : overdueOnly ? 'overdue' : '',
  });

  function reset() {
    setRange('all'); setOverdueOnly(false); setKind(''); setCurrency(''); setCategory(''); setAssignee(''); setSearch(''); setHistoryFilter('all');
    router.replace(router.pathname, undefined, { shallow: true });
  }

  return (
    <>
      <div className="period-heading">
        <label className="payment-range-label">{t('Период')}
          <select value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label={t('Период списка')}>
            <option value="all">{history ? t('Всё время') : t('Все сроки')}</option>
            {!history && <option value="week">{t('Ближайшие 7 дней')}</option>}
            <option value="month">{t('Выбранный месяц')}</option>
          </select>
        </label>
        {range === 'month' && <MonthSwitcher />}
        <span className="row-action-group">
          <a className="text-button" href={exportUrl}>{t('Скачать CSV ↓')}</a>
          <button type="button" className="text-button" onClick={() => { setRange('month'); setMonth(settings.today.slice(0, 7)); }}>{t('Текущий месяц ↗')}</button>
        </span>
      </div>
      {history && range === 'month' && <p className="history-date-note muted">{t('История отобрана по фактической дате оплаты. Для неоплаченных архивных записей используется срок.')}</p>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {opening && <div className="notice" role="status">{t('Загружаем…')}</div>}
      {linkedError && <div className="notice notice-error" role="alert">{linkedError}</div>}
      {allOverdue.length > 0 && (
        <div id="due-notice" className="notice">
          <span className="notice-symbol" aria-hidden="true">{ws.clock}</span>
          <div className="attention-copy">
            <b>{allOverdue.length} {tp(allOverdue.length, ['просроченный платёж', 'просроченных платежа', 'просроченных платежей'], ['overdue payment', 'overdue payments'])}</b>
            <span>{allOverdue[0].title} · {t('срок {date}', { date: date(allOverdue[0].due_date) })}{allOverdue.length > 1 ? t(' и другие') : ''}</span>
          </div>
          <button type="button" className="text-button notice-detail" onClick={() => { router.push('/payments?view=overdue'); setOverdueOnly(true); setRange('all'); }}>
            {t('Показать')} <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}
      <section className="ledger">
        <div className="ledger-toolbar">
          {!history ? (
            <div className="status-tabs" role="group" aria-label={t('Статус платежа')}>
              <button type="button" className={`status-tab${!overdueOnly ? ' selected' : ''}`} aria-pressed={!overdueOnly} onClick={() => setOverdueOnly(false)}>
                {t('Все')} <span>{filtered.length}</span>
              </button>
              <button type="button" className={`status-tab${overdueOnly ? ' selected' : ''}`} aria-pressed={overdueOnly} onClick={() => setOverdueOnly(true)}>
                {t('Просрочено')} <span>{overdue.length}</span>
              </button>
              {!isAdmin && (
                <button type="button" className={`status-tab${assignee === 'me' ? ' selected' : ''}`} aria-pressed={assignee === 'me'} onClick={() => setAssignee(assignee === 'me' ? '' : 'me')}>
                  {t('Только мои')}
                </button>
              )}
            </div>
          ) : <span />}
          <div className="ledger-search-tools">
            <label className="search-field">
              <span aria-hidden="true">{ws.search}</span>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Поиск')} aria-label={t('Найти платёж')} />
            </label>
            <button type="button" className="button secondary ledger-filter-toggle" aria-expanded={filtersOpen} aria-controls="payment-filters" onClick={() => setFiltersOpen((v) => !v)}>
              {t('Фильтры')}{filterCount > 0 && <span className="filter-count">{filterCount}</span>}
            </button>
          </div>
        </div>
        <div className="ledger-filter-panel" id="payment-filters" data-open={filtersOpen}>
            {history && (
              <label>{t('Записи истории')}<select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as HistoryFilter)} aria-label={t('Записи истории')}>
                <option value="all">{t('Все записи')}</option>
                <option value="paid">{t('Оплаченные')}</option>
                <option value="archived">{t('Архивные')}</option>
              </select></label>
            )}
            <label>{t('Тип платежа')}<select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label={t('Тип платежа')}>
              <option value="">{t('Все типы')}</option>
              <option value="repeat">{t('Регулярные')}</option>
              <option value="once">{t('Разовые')}</option>
            </select></label>
            <label>{t('Валюта')}<select value={currency} onChange={(e) => setCurrency(e.target.value as Currency | '')} aria-label={t('Валюта')}>
              <option value="">{t('Все валюты')}</option>
              {currencies.map((c) => <option key={c}>{c}</option>)}
            </select></label>
            {categories.length > 0 && (
              <label>{t('Категория')}<select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('Категория')}>
                <option value="">{t('Все категории')}</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="-">{t('Без категории')}</option>
              </select></label>
            )}
            {isAdmin && users.length > 0 && (
              <label>{t('Ответственный')}<select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label={t('Ответственный')}>
                <option value="">{t('Все ответственные')}</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                <option value="-">{t('Без ответственного')}</option>
              </select></label>
            )}
            {filterCount > 0 && <button type="button" className="text-button filter-reset" onClick={() => { setKind(''); setCurrency(''); setCategory(''); setAssignee(''); setHistoryFilter('all'); }}>{t('Сбросить фильтры')}</button>}
        </div>
        <div id="occurrence-table" className="table-wrap" aria-live="polite">
          {!data ? <div className="empty-state">{t('Загружаем платежи…')}</div> : items.length === 0 ? (
            <div className="empty-state">
              <b>{anyFilter ? t('Подходящих платежей нет') : history ? t('История пока пуста') : t('Открытых задач нет')}</b>
              {anyFilter ? t('Измените поиск, тип, валюту или период.') : history ? t('Здесь появятся оплаченные и архивные задачи.') : t('Все текущие задачи закрыты. Новые платежи появятся здесь.')}
              {anyFilter && <><br /><button type="button" className="button secondary" onClick={reset}>{t('Сбросить фильтры')}</button></>}
            </div>
          ) : (
            <table>
              <thead><tr><th>{t('Платёж')}</th><th className="amount-heading">{t('Сумма')}</th><th>{t('Срок оплаты')}</th><th>{t('Статус')}</th><th>{t('Дата оплаты')}</th><th /></tr></thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id} className={`payment-row ${o.status}`}>
                    <td className="payment-title-cell">
                      <div className="payment-name">
                        <span className={`payment-icon ${o.currency.toLowerCase()}`} aria-hidden="true">{ws.receipt}</span>
                        <span>
                          <b>{o.title}</b>
                          <small>{details(o, isAdmin, user.id).join(' · ')}</small>
                        </span>
                      </div>
                    </td>
                    <td className="amount-cell payment-amount-cell" data-label={t('Сумма')}>{money(o.amount)}<small>{symbols[o.currency]}</small></td>
                    <td className={`date-cell payment-due-cell${o.is_late ? ' late' : ''}`} data-label={t('Срок оплаты')}>{date(o.due_date)}<small className="due-hint">{dueHint(o, settings.today)}</small></td>
                    <td className="payment-status-cell"><span className={`pill ${o.status}`}>{statusLabel(o.status)}</span></td>
                    <td className="date-cell payment-paid-cell" data-label={t('Дата оплаты')} data-empty={!o.paid_at}>{date(o.paid_at)}</td>
                    <td className="payment-actions-cell">
                      <div className="row-action-group">
                        {o.payment_url && o.status !== 'paid' && !o.wallet?.sanctioned && (
                          <a className="row-action edit" href={o.payment_url} target="_blank" rel="noopener noreferrer"
                            title={o.payment_details ? t('Оплатить · {details}', { details: o.payment_details }) : t('Открыть ссылку на оплату')}>{t('Оплатить ↗')}</a>
                        )}
                        {isAdmin && <button type="button" className="row-action delete" onClick={() => setDeleting(o)}>{t('Удалить')}</button>}
                        {(o.status === 'paid' || !o.active) && <button type="button" className="row-action edit" onClick={() => setReceipts(o)} title={t('Чеки и ссылки')}>
                          {t('Чеки')}{o.receipts > 0 ? ` · ${o.receipts}` : ''}
                        </button>}
                        <button type="button" className={`row-action payment-primary-action${o.status === 'paid' || !o.active ? ' edit' : ''}`} onClick={() => setPaying(o)}>
                          {!o.active ? t('Открыть запись') : o.status === 'paid' ? t('Изменить ↗') : t('Отметить оплату')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="ledger-footer">
          <span>{items.length} {paymentsWord(items.length)}</span>
          <span>{t('Каждый платёж сохраняет свою историю')}</span>
        </div>
      </section>
      <div className="bottom-caption">
        <span><span className="small-dot" /> {t('Изменения сохраняются автоматически')}</span>
        <span>{settings.telegram_enabled ? t('Напоминания за 3 дня до срока') : t('Telegram выключен · настройте в .env')}</span>
      </div>
      {deleting && <DeletePaymentModal payment={deleting} onClose={() => setDeleting(null)} />}
      {paying && <PayModal occurrence={paying} onClose={closePayment} />}
      {receipts && <ReceiptsModal occurrence={receipts} onClose={() => setReceipts(null)} />}
    </>
  );
}

/** Second line of a row: kind, archive, description, category, assignee, OFAC. */
function details(o: Occurrence, isAdmin: boolean, me: number): string[] {
  return [
    o.wallet?.sanctioned && t('⛔ санкции OFAC'),
    o.active ? repeatLabel(o.frequency as Frequency) : t('В архиве · история сохранена'),
    o.description,
    o.category,
    o.assignee && (o.assignee.id === me && !isAdmin ? t('вы') : '@' + o.assignee.username),
    o.wallet && !o.wallet.sanctioned && t('крипта · {network}', { network: o.wallet.network }),
    o.receipts > 0 && `${o.receipts} ${tp(o.receipts, ['вложение', 'вложения', 'вложений'], ['attachment', 'attachments'])}`,
  ].filter(Boolean) as string[];
}
