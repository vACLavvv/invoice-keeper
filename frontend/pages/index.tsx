import Link from 'next/link';
import { useState } from 'react';
import { PayModal } from '@/components/PaymentModals';
import { Shell } from '@/components/Shell';
import { Notice } from '@/components/ui';
import { addDays, dueHint, kindLabel, WorkRows } from '@/components/Workspace';
import { api, query, type Occurrence, type Summary } from '@/lib/api';
import { currencies, date, money, monthLabel, monthRange, symbols } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';

type Queue = 'week' | 'all' | 'once';

/** A deadline queue and a separate ledger for each currency; all figures use the live API. */
export default function Overview() {
  const { settings } = useSession();
  const [paying, setPaying] = useState<Occurrence | null>(null);
  const [queue, setQueue] = useState<Queue>('week');
  const month = settings.today.slice(0, 7);
  const { data, error } = useLoad(() => api<Occurrence[]>('/payment-occurrences'), []);
  const summary = useLoad(() => api<Summary>('/payments/summary' + query(monthRange(month))), [month]);
  const all = data ?? [];
  const open = all.filter((o) => o.active && o.status !== 'paid').sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id);
  const overdue = open.filter((o) => o.status === 'overdue');
  const edge = addDays(settings.today, 7);
  const soon = open.filter((o) => o.due_date >= settings.today && o.due_date <= edge);
  const once = open.filter((o) => o.frequency === 'once');
  const urgent = open.filter((o) => o.due_date <= edge);
  const selected = queue === 'week' ? urgent : queue === 'once' ? once : open;
  const later = open.filter((o) => o.due_date > edge);
  const recent = all.filter((o) => o.paid_at).sort((a, b) => b.paid_at!.localeCompare(a.paid_at!) || b.id - a.id).slice(0, 3);
  const thisMonth = all.filter((o) => o.due_date.startsWith(month));
  const paidCount = thisMonth.filter((o) => o.status === 'paid').length;
  const counts = [
    { view: '', label: t('К оплате'), count: open.length },
    { view: 'overdue', label: t('Просрочено'), count: overdue.length },
    { view: 'week', label: t('В ближайшие 7 дней'), count: soon.length },
    { view: 'once', label: t('Разовые'), count: once.length },
  ];
  return (
    <Shell title={t('Обзор')} heading={t('Обзор платежей')}
      subtitle={data ? (overdue.length ? t('Платежей с истёкшим сроком: {n}.', { n: overdue.length }) : t('Просроченных платежей нет. Всё идёт по плану.')) : t('Загружаем платежи…')}>
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      <div className="overview-counts" aria-label={t('Задачи команды')}>
        {counts.map((item) => <Link href={'/payments' + (item.view ? '?view=' + item.view : '')} key={item.label}>
          <span>{item.label}</span><strong>{data ? item.count : '—'}</strong>
        </Link>)}
      </div>
      <div className="overview-desk">
        <section className="desk-panel deadline-panel" aria-labelledby="queue-title">
          <div className="desk-panel-heading">
            <div><h2 id="queue-title">{t('Очередь платежей')}</h2><p>{queue === 'week' ? t('До {date} и все просроченные', { date: date(edge) }) : queue === 'once' ? t('Разовые задачи и работы') : t('Все неоплаченные платежи')}</p></div>
            <Link className="desk-link" href="/payments">{t('Все платежи')} <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="queue-tabs" role="group" aria-label={t('Показать платежи')}>
            {([{ key: 'week', label: t('Ближайшие'), count: urgent.length }, { key: 'all', label: t('Все'), count: open.length }, { key: 'once', label: t('Разовые'), count: once.length }] as const).map((item) => (
              <button type="button" key={item.key} aria-pressed={queue === item.key} onClick={() => setQueue(item.key)}>
                {item.label}<span>{data ? item.count : '—'}</span>
              </button>
            ))}
          </div>
          <div className="deadline-rows" aria-live="polite" aria-busy={!data}>
            {!data ? <div className="desk-empty">{t('Загружаем платежи…')}</div> : selected.length ? selected.slice(0, 5).map((o) => (
              <button type="button" className="deadline-row" key={o.id} onClick={() => setPaying(o)}>
                <time className="deadline-date" dateTime={o.due_date}><b>{o.due_date.slice(-2)}</b><span>{date(o.due_date, { month: 'short' }).replace('.', '')}</span></time>
                <span className="deadline-copy"><b>{o.title}</b><small>{kindLabel(o.frequency)}{o.assignee ? ' · ' + o.assignee.display_name : ''}</small></span>
                <span className="deadline-amount">{money(o.amount)} <small>{symbols[o.currency]}</small>
                  <span className={o.status === 'overdue' ? 'deadline-late' : 'deadline-hint'}>{dueHint(o, settings.today)}</span>
                </span>
                <span className="deadline-open" aria-hidden="true">↗</span>
              </button>
            )) : <div className="desk-empty"><b>{t('Всё спокойно')}</b><p>{t('В этой очереди нет неоплаченных задач.')}</p><Link href="/calendar">{t('Открыть календарь')}</Link></div>}
          </div>
          <div className="desk-panel-footer"><span>{t('Показано {n} из {total}', { n: Math.min(selected.length, 5), total: selected.length })}</span><Link className="desk-link" href={'/payments' + (queue === 'once' ? '?view=once' : '')}>{t('Перейти к платежам')} <span aria-hidden="true">→</span></Link></div>
        </section>
        <section className="desk-panel month-ledger" aria-labelledby="plan-title">
          <div className="desk-panel-heading"><div><h2 id="plan-title">{t('План месяца')}</h2><p>{monthLabel(month)}</p></div><Link className="desk-link" href="/budget" aria-label={t('Открыть бюджет')}>↗</Link></div>
          <p className="ledger-explanation">{t('Осталось оплатить')}</p>
          {summary.error ? <div className="desk-empty" role="alert">{summary.error}</div> : currencies.map((c) => {
            const totals = summary.data?.currencies[c];
            const total = Number(totals?.total ?? 0), paid = Number(totals?.paid ?? 0);
            return <Link href={'/payments?currency=' + c} className="currency-ledger-row" key={c}>
              <div className="currency-ledger-heading"><span>{c}</span><strong>{totals ? money(totals.unpaid) : '—'} <small>{symbols[c]}</small></strong></div>
              <progress value={paid} max={total || 1} aria-label={t('План оплат в {currency}', { currency: c })} />
              <div className="currency-ledger-caption"><span>{t('Оплачено')} {totals ? money(totals.paid) : '—'} {symbols[c]}</span><span>{t('из')} {totals ? money(totals.total) : '—'} {symbols[c]}</span></div>
            </Link>;
          })}
          <div className="desk-panel-footer"><span>{t('Валюты считаем отдельно')}</span></div>
        </section>
      </div>
      <div className="overview-secondary">
        <section className="desk-panel">
          <div className="desk-panel-heading"><div><h2>{t('Дальше по плану')}</h2><p>{t('После {date}', { date: date(edge) })}</p></div><Link className="desk-link" href="/calendar">{t('Календарь')} <span aria-hidden="true">↗</span></Link></div>
          <WorkRows items={later.slice(0, 3)} empty={t('Других запланированных платежей пока нет.')} onOpen={setPaying} />
        </section>
        <section className="desk-panel">
          <div className="desk-panel-heading"><div><h2>{t('Недавно оплачено')}</h2><p>{t('Закрыто {paid} из {total} за месяц', { paid: paidCount, total: thisMonth.length })}</p></div><Link className="desk-link" href="/history">{t('История')} <span aria-hidden="true">↗</span></Link></div>
          <WorkRows items={recent} empty={t('Здесь появятся оплаченные задачи и прикреплённые чеки.')} onOpen={setPaying} />
        </section>
      </div>
      {paying && <PayModal occurrence={paying} onClose={() => setPaying(null)} />}
    </Shell>
  );
}
