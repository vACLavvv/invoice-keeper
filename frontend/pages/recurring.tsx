import { SkeletonRows } from '@/components/Skeleton';
import { DeletePaymentModal } from '@/components/DeletePaymentModal';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import styled from 'styled-components';
import { ws } from '@/components/icons';
import { ArchiveModal, EditPaymentModal, ImportModal, PauseModal } from '@/components/PaymentModals';
import { ScreeningPill, shortAddress } from '@/components/Wallet';
import { Shell } from '@/components/Shell';
import { Pagination } from '@/components/Pagination';
import { useDebounced, usePage } from '@/lib/pagination';
import { api, type Recurring } from '@/lib/api';
import { date, money, symbols } from '@/lib/format';
import { t, tp } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';

const repeat = (r: Recurring) => ({
  once: t('Один раз'),
  monthly: t('{n}-го числа ежемесячно', { n: r.anchor_day }),
  quarterly: t('{n}-го числа раз в квартал', { n: r.anchor_day }),
  yearly: t('Раз в год, {date}', { date: date(r.first_due_date, { day: 'numeric', month: 'long' }) }),
})[r.frequency];

export default function RecurringPage() {
  const router = useRouter();
  const { isAdmin, refresh } = useSession();
  const toast = useToast();
  const [modal, setModal] = useState<{ kind: 'edit' | 'pause' | 'archive' | 'delete'; payment: Recurring } | 'import' | null>(null);
  const [search, setSearch] = useState('');
  const settledSearch = useDebounced(search.trim());
  const linkedID = typeof router.query.payment === 'string' && /^[1-9]\d*$/.test(router.query.payment) ? router.query.payment : '';
  const { data, error, setPage } = usePage<Recurring>('/recurring-payments/page', { search: settledSearch, payment_id: linkedID });
  const linkedPayment = data?.items.find((payment) => String(payment.id) === linkedID);
  const linkedRow = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (!linkedPayment) return;
    linkedRow.current?.scrollIntoView({ block: 'center' });
    linkedRow.current?.focus({ preventScroll: true });
  }, [linkedID, linkedPayment?.id]);

  async function resume(r: Recurring) {
    try {
      await api(`/recurring-payments/${r.id}/resume`, { method: 'POST' });
      refresh();
      toast(t('Платёж возобновлён: периоды снова создаются с сегодняшнего дня'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <Shell title={t('Регулярные')} heading={t('Регулярные платежи')} subtitle={t('Один раз настройте расход — система создаст следующие периоды.')}>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {linkedID && data && !linkedPayment && <div className="notice notice-warning" role="status">{t('Платёж не найден')}</div>}
      <div className="notice">
        <span>{t('Каждый период — отдельная отметка оплаты. Повтор ежемесячно, раз в квартал или раз в год; если нужного числа нет, срок переносится на последний день месяца.')}</span>
        {isAdmin && <button type="button" className="text-button notice-detail" onClick={() => setModal('import')}>{t('Импорт из CSV ↗')}</button>}
      </div>
      {isAdmin && <p><Link className="text-button" href="/trash">{t('Удалённые платежи')} ↗</Link></p>}
      <div className="ledger-toolbar">
        <label className="search-field"><span aria-hidden="true">{ws.search}</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Поиск')} aria-label={t('Найти платёж')} />
        </label>
        {linkedID && <Link className="text-button" href="/recurring">{t('Все платежи')} →</Link>}
      </div>
      <div id="recurring-table" className="ledger table-wrap cards">
        {!data ? <SkeletonRows /> : data.items.length === 0 ? (
          <div className="empty-state"><b>{t('Начните с регулярного платежа')}</b>{t('Добавьте аренду, сервер или подписку.')}</div>
        ) : (
          <table>
            <thead><tr><th>{t('Платёж')}</th><th>{t('Сумма')}</th><th>{t('Повторение')}</th><th>{t('Ближайший срок')}</th><th>{t('Состояние')}</th>{isAdmin && <th className="recurring-actions-heading">{t('Действия')}</th>}</tr></thead>
            <tbody>
              {data.items.map((r) => (
                <RecurringRow key={r.id} $highlighted={String(r.id) === linkedID} ref={String(r.id) === linkedID ? linkedRow : undefined} tabIndex={String(r.id) === linkedID ? -1 : undefined}>
                  <td>
                    <div className="payment-name">
                      <span className={`payment-icon ${r.currency.toLowerCase()}`}>{r.frequency === 'once' ? ws.receipt : ws.recurring}</span>
                      <span>
                        <b>{r.title}</b>
                        <small>
                          {[
                            r.frequency === 'once' ? (r.description ?? t('Разовый платёж')) : `${r.unpaid_count} ${tp(r.unpaid_count, ['неоплаченный период', 'неоплаченных периода', 'неоплаченных периодов'], ['unpaid period', 'unpaid periods'])}`,
                            r.category, r.assignee && '@' + r.assignee.username, r.payment_details,
                          ].filter(Boolean).join(' · ')}
                        </small>
                        {r.wallet && (
                          <small className="wallet-line" title={r.wallet.address}>
                            {r.wallet.network} · {shortAddress(r.wallet.address)} <ScreeningPill wallet={r.wallet} compact />
                          </small>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="amount-cell" data-label={t('Сумма')}>{money(r.amount)}<small>{symbols[r.currency]}</small></td>
                  <td className="date-cell" data-label={t('Повторение')}>{repeat(r)}</td>
                  <td className="date-cell" data-label={t('Срок')}>{r.next_due_date ? date(r.next_due_date, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td data-label={t('Состояние')}>
                    <span className={`pill ${!r.active ? 'archived' : r.paused ? 'unpaid' : 'paid'}`}>
                      {!r.active ? t('Архив') : r.paused ? (r.paused.until ? t('Пауза до {date}', { date: date(r.paused.until) }) : t('На паузе')) : t('Активен')}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="recurring-actions-cell">
                      <div className="recurring-actions">
                        {r.active && <>
                          <button type="button" className="row-action edit" onClick={() => setModal({ kind: 'edit', payment: r })}>{t('Изменить')}</button>
                          {r.frequency !== 'once' && (r.paused
                            ? <button type="button" className="row-action" onClick={() => resume(r)}>{t('Возобновить')}</button>
                            : <button type="button" className="row-action edit" onClick={() => setModal({ kind: 'pause', payment: r })}>{t('Пауза')}</button>)}
                          <button type="button" className="row-action edit" onClick={() => setModal({ kind: 'archive', payment: r })}>{r.frequency === 'once' ? t('В архив') : t('Прекратить повторение')}</button>
                        </>}
                        <button type="button" className="row-action delete" onClick={() => setModal({ kind: 'delete', payment: r })}>{t('Удалить')}</button>
                        {r.active && r.payment_url && !r.wallet?.sanctioned && <a className="row-action recurring-payment-link" href={r.payment_url} target="_blank" rel="noopener noreferrer">{t('Оплатить ↗')}</a>}
                      </div>
                    </td>
                  )}
                </RecurringRow>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination data={data} onChange={setPage} />
      {modal && modal !== 'import' && modal.kind === 'delete' && <DeletePaymentModal payment={modal.payment} onClose={() => setModal(null)} />}
      {modal === 'import' && <ImportModal onClose={() => setModal(null)} />}
      {modal && modal !== 'import' && modal.kind === 'edit' && <EditPaymentModal payment={modal.payment} onClose={() => setModal(null)} />}
      {modal && modal !== 'import' && modal.kind === 'pause' && <PauseModal payment={modal.payment} onClose={() => setModal(null)} />}
      {modal && modal !== 'import' && modal.kind === 'archive' && <ArchiveModal payment={modal.payment} onClose={() => setModal(null)} />}
    </Shell>
  );
}

const RecurringRow = styled.tr<{ $highlighted: boolean }>`
  scroll-margin-top: 100px;
  ${({ $highlighted }) => $highlighted && `
    outline: 2px solid var(--apple-blue);
    outline-offset: -2px;
    > td { background: var(--focus-ring); }
  `}
`;
