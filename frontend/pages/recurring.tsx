import { DeletePaymentModal } from '@/components/DeletePaymentModal';
import { useState } from 'react';
import { ws } from '@/components/icons';
import { ArchiveModal, EditPaymentModal, ImportModal, PauseModal } from '@/components/PaymentModals';
import { ScreeningPill, shortAddress } from '@/components/Wallet';
import { Shell } from '@/components/Shell';
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
  const { isAdmin, refresh } = useSession();
  const toast = useToast();
  const [modal, setModal] = useState<{ kind: 'edit' | 'pause' | 'archive' | 'delete'; payment: Recurring } | 'import' | null>(null);
  const { data, error } = useLoad(() => api<Recurring[]>('/recurring-payments'), []);

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
      <div className="notice">
        <span>{t('Каждый период — отдельная отметка оплаты. Повтор ежемесячно, раз в квартал или раз в год; если нужного числа нет, срок переносится на последний день месяца.')}</span>
        {isAdmin && <button type="button" className="text-button notice-detail" onClick={() => setModal('import')}>{t('Импорт из CSV ↗')}</button>}
      </div>
      <div id="recurring-table" className="ledger table-wrap cards">
        {!data ? <div className="empty-state">{t('Загружаем…')}</div> : data.length === 0 ? (
          <div className="empty-state"><b>{t('Начните с регулярного платежа')}</b>{t('Добавьте аренду, сервер или подписку.')}</div>
        ) : (
          <table>
            <thead><tr><th>{t('ПЛАТЁЖ')}</th><th>{t('СУММА')}</th><th>{t('ПОВТОРЕНИЕ')}</th><th>{t('БЛИЖАЙШИЙ СРОК')}</th><th>{t('СОСТОЯНИЕ')}</th>{isAdmin && <th />}</tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
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
                    <td>
                      {r.active ? (
                        <div className="row-action-group">
                          {r.payment_url && !r.wallet?.sanctioned && <a className="row-action edit" href={r.payment_url} target="_blank" rel="noopener noreferrer">{t('Оплатить ↗')}</a>}
                          <button type="button" className="row-action edit" onClick={() => setModal({ kind: 'edit', payment: r })}>{t('Изменить')}</button>
                          {r.frequency !== 'once' && (r.paused
                            ? <button type="button" className="row-action" onClick={() => resume(r)}>{t('Возобновить')}</button>
                            : <button type="button" className="row-action edit" onClick={() => setModal({ kind: 'pause', payment: r })}>{t('Пауза')}</button>)}
                          <button type="button" className="row-action delete" onClick={() => setModal({ kind: 'archive', payment: r })}>{t('Прекратить ↗')}</button>
                        </div>
                      ) : null}
                      <button type="button" className="row-action delete" onClick={() => setModal({ kind: 'delete', payment: r })}>{t('Удалить')}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {modal && modal !== 'import' && modal.kind === 'delete' && <DeletePaymentModal payment={modal.payment} onClose={() => setModal(null)} />}
      {modal === 'import' && <ImportModal onClose={() => setModal(null)} />}
      {modal && modal !== 'import' && modal.kind === 'edit' && <EditPaymentModal payment={modal.payment} onClose={() => setModal(null)} />}
      {modal && modal !== 'import' && modal.kind === 'pause' && <PauseModal payment={modal.payment} onClose={() => setModal(null)} />}
      {modal && modal !== 'import' && modal.kind === 'archive' && <ArchiveModal payment={modal.payment} onClose={() => setModal(null)} />}
    </Shell>
  );
}
