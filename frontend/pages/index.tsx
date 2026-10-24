import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { PayModal } from '@/components/PaymentModals';
import { Shell } from '@/components/Shell';
import { Notice } from '@/components/ui';
import { addDays, MonthHealth, paymentsWord, SummaryCard, WorkRows } from '@/components/Workspace';
import { api, query, type Occurrence, type Summary } from '@/lib/api';
import { currencies, monthLabel, monthRange } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';

/** «Рабочий обзор»: open tasks first, then the month plan by currency and recent payments. */
export default function Overview() {
  const router = useRouter();
  const { settings } = useSession();
  const [paying, setPaying] = useState<Occurrence | null>(null);
  const month = settings.today.slice(0, 7);
  const { data, error } = useLoad(() => api<Occurrence[]>('/payment-occurrences'), []);
  const summary = useLoad(() => api<Summary>('/payments/summary' + query(monthRange(month))), [month]).data;

  const all = data ?? [];
  const open = all.filter((o) => o.active && o.status !== 'paid');
  const overdue = open.filter((o) => o.status === 'overdue');
  const edge = addDays(settings.today, 7);
  const soon = open.filter((o) => o.due_date >= settings.today && o.due_date <= edge);
  const once = open.filter((o) => o.frequency === 'once');
  const later = open.filter((o) => o.due_date > edge);
  const recent = all.filter((o) => o.paid_at).sort((a, b) => b.paid_at!.localeCompare(a.paid_at!) || b.id - a.id).slice(0, 4);
  const thisMonth = all.filter((o) => o.due_date.startsWith(month));

  const tile = (view: string, label: string, value: number, caption: string, urgent = false) => (
    <Link className={`workflow-tile${urgent ? ' urgent' : ''}`} href={`/payments${view === 'all' ? '' : '?view=' + view}`}>
      <span>{label}</span>
      <strong>{data ? value : '—'}<span aria-hidden="true">↗</span></strong>
      <small>{caption}</small>
    </Link>
  );

  return (
    <Shell title={t('Обзор')} heading={t('Рабочий обзор')} subtitle={t('Текущие задачи, ближайшие сроки и история оплат.')}
      extra={<MonthHealth paid={thisMonth.filter((o) => o.status === 'paid').length} total={thisMonth.length} />}>
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      <div className="workflow-summary">
        {tile('all', t('К оплате'), open.length, t('Все открытые задачи'))}
        {tile('overdue', t('Просрочено'), overdue.length, t('Требуют внимания'), true)}
        {tile('week', t('На этой неделе'), soon.length, t('В ближайшие 7 дней'))}
        {tile('once', t('Разовые'), once.length, t('Работы, услуги и покупки'))}
      </div>
      <div className="work-columns">
        <section className="work-panel">
          <div className="work-panel-heading"><h2>{t('В первую очередь')}</h2><span className="section-caption">{t('Просрочено и ближайшие 7 дней')}</span></div>
          <WorkRows items={open.filter((o) => o.due_date <= edge).slice(0, 4)} empty={t('Срочных платежей нет. Можно заняться другими задачами.')} onOpen={setPaying} />
        </section>
        <section className="work-panel">
          <div className="work-panel-heading"><h2>{t('Дальше по плану')}</h2><Link className="text-button" href="/calendar">{t('Календарь →')}</Link></div>
          <WorkRows items={later.slice(0, 4)} empty={t('Других запланированных платежей пока нет.')} onOpen={setPaying} />
          {later.length > 4 && (
            <Link className="work-more text-button" href="/payments">{t('Ещё {n} {word} →', { n: later.length - 4, word: paymentsWord(later.length - 4) })}</Link>
          )}
        </section>
      </div>
      <div className="section-heading">
        <div><h2>{t('План месяца')}</h2><p className="muted">{monthLabel(month)} · {t('по сроку оплаты')}</p></div>
        <Link className="text-button" href="/payments">{t('Все задачи →')}</Link>
      </div>
      <div className="summary-grid">
        {currencies.map((c) => <SummaryCard key={c} currency={c} totals={summary?.currencies[c]} onClick={() => router.push('/payments?currency=' + c)} />)}
      </div>
      <section className="work-panel recent-panel">
        <div className="work-panel-heading"><h2>{t('Недавно оплачено')}</h2><Link className="text-button" href="/history">{t('История →')}</Link></div>
        <div id="recent-list"><WorkRows items={recent} empty={t('Здесь появятся оплаченные задачи и прикреплённые чеки.')} onOpen={setPaying} /></div>
      </section>
      {paying && <PayModal occurrence={paying} onClose={() => setPaying(null)} />}
    </Shell>
  );
}
