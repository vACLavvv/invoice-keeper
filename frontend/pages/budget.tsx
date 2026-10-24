import { useState } from 'react';
import { CategoryChart, Legend, MonthChart } from '@/components/BudgetCharts';
import { Shell } from '@/components/Shell';
import { currencyTitle } from '@/components/Workspace';
import { api, type Budget, type BudgetLine } from '@/lib/api';
import { currencies, date, money, symbols, type Currency } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';

export default function BudgetPage() {
  const { settings } = useSession();
  const [year, setYear] = useState(Number(settings.today.slice(0, 4)));
  const { data, error } = useLoad(() => api<Budget>(`/budget?year=${year}`), [year]);
  const used = currencies.filter((c) => data && Number(data.currencies[c].planned) > 0);
  const shown = used.length ? used : currencies;
  const [picked, setPicked] = useState<Currency | null>(null);
  const chartCurrency = picked && shown.includes(picked) ? picked : shown[0];

  return (
    <Shell title={t('Бюджет')} heading={t('План расходов')} subtitle={t('Посмотрите, сколько потребуется на месяц и год — отдельно по каждой валюте.')}>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <div className="budget-toolbar">
        <div className="budget-switch" role="group" aria-label={t('Год бюджета')}>
          <button type="button" className="status-tab" aria-label={t('Предыдущий год')} onClick={() => setYear((y) => Math.max(2000, y - 1))}>‹</button>
          <button type="button" className="status-tab selected" aria-live="polite">{t('На {year} год', { year })}</button>
          <button type="button" className="status-tab" aria-label={t('Следующий год')} onClick={() => setYear((y) => Math.min(2100, y + 1))}>›</button>
        </div>
        <label className="budget-year-label">{t('Год')}
          <input type="number" min={2000} max={2100} value={year} aria-label={t('Год бюджета')}
            onChange={(e) => { const v = Number(e.target.value); if (v >= 2000 && v <= 2100) setYear(v); }} />
        </label>
      </div>
      {!data ? <div className="ledger empty-state">{t('Считаем…')}</div> : (
        <>
          <div className="summary-grid">
            {currencies.map((c) => <BudgetCard key={c} currency={c} line={data.currencies[c]} />)}
          </div>
          <div className="notice">{t('Разовые платежи учтены один раз, регулярные — по своему повторению, по сроку оплаты. Будущие месяцы посчитаны по графику без создания записей в истории, паузы учтены. Конвертации валют нет.')}</div>
          {used.length > 0 && (
            <section className="work-panel chart-panel">
              <div className="work-panel-heading">
                <h2>{t('По месяцам')}</h2>
                <div className="status-tabs" role="group" aria-label={t('Валюта графиков')}>
                  {used.map((c) => (
                    <button key={c} type="button" className={`status-tab${c === chartCurrency ? ' selected' : ''}`} aria-pressed={c === chartCurrency} onClick={() => setPicked(c)}>
                      {symbols[c]} {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-body">
                <MonthChart budget={data} currency={chartCurrency} />
                <Legend />
              </div>
            </section>
          )}
          <h2 className="section-title">{t('План по месяцам')}</h2>
          <div className="ledger table-wrap cards">
            <table>
              <thead><tr><th>{t('МЕСЯЦ')}</th>{shown.map((c) => <th key={c}>{c} · {t('ПЛАН')}</th>)}{shown.map((c) => <th key={c + 'p'}>{c} · {t('ОПЛАЧЕНО')}</th>)}</tr></thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month}>
                    <td>{date(m.month + '-01', { month: 'long', year: 'numeric' })}</td>
                    {shown.map((c) => <td key={c} className="amount-cell" data-label={`${c} · ${t('план')}`}>{money(m.currencies[c].planned)}<small>{symbols[c]}</small></td>)}
                    {shown.map((c) => <td key={c + 'p'} className="date-cell" data-label={`${c} · ${t('оплачено')}`}>{money(m.currencies[c].paid)} {symbols[c]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="section-title">{t('По категориям')}</h2>
          {data.categories.length === 0 ? <div className="ledger empty-state">{t('В этом году платежей нет')}</div> : (
            <>
              {used.length > 0 && <section className="work-panel chart-panel"><div className="chart-body"><CategoryChart budget={data} currency={chartCurrency} /></div></section>}
              <div className="ledger table-wrap cards">
                <table>
                  <thead><tr><th>{t('КАТЕГОРИЯ')}</th>{shown.map((c) => <th key={c}>{c} · {t('ПЛАН')}</th>)}{shown.map((c) => <th key={c + 'r'}>{c} · {t('ОСТАЛОСЬ')}</th>)}</tr></thead>
                  <tbody>
                    {data.categories.map((row) => (
                      <tr key={row.category ?? '-'}>
                        <td>{row.category ?? <span className="muted">{t('Без категории')}</span>}</td>
                        {shown.map((c) => <td key={c} className="amount-cell" data-label={`${c} · ${t('план')}`}>{money(row.currencies[c].planned)}<small>{symbols[c]}</small></td>)}
                        {shown.map((c) => <td key={c + 'r'} className="date-cell" data-label={`${c} · ${t('осталось')}`}>{money(row.currencies[c].remaining)} {symbols[c]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}

function BudgetCard({ currency, line }: { currency: Currency; line: BudgetLine }) {
  return (
    <article className="summary-card">
      <div className="summary-top">
        <span className="currency-label"><span className="currency-symbol">{symbols[currency]}</span>{currency}</span>
        <span>{currencyTitle(currency)}</span>
      </div>
      <div className="summary-amount">{money(line.planned)}<small>{symbols[currency]}</small></div>
      <p className="summary-caption">{t('План на год')}</p>
      <div className="budget-card-detail">
        <span>{t('Оплачено')} <b>{money(line.paid)} {symbols[currency]}</b></span>
        <span>{t('Осталось')} <b>{money(line.remaining)} {symbols[currency]}</b></span>
      </div>
    </article>
  );
}
