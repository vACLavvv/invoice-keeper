import { useMemo, useState } from 'react';
import styled, { css } from 'styled-components';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { PayModal, ReceiptsModal } from '@/components/PaymentModals';
import { Shell } from '@/components/Shell';
import {
  Amount, Button, Chevron, CurrencyBadge, Empty, Input, Muted, Notice, PaymentName, Pill, Row, Select, Sticker,
  TableWrap, Tile, TileTitle, Wire,
} from '@/components/ui';
import { api, query, type Occurrence, type Summary, type TeamUser, type Totals } from '@/lib/api';
import { currencies, currencyName, longDate, money, monthRange, numericDate, perPeriod, statusName, symbols, type Currency } from '@/lib/format';
import { t, tp } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';

type Tab = 'all' | 'unpaid' | 'overdue' | 'paid';
type SortKey = 'title' | 'amount' | 'due_date' | 'status' | 'paid_at';

const statusOrder: Record<Occurrence['status'], number> = { overdue: 0, unpaid: 1, paid: 2 };

/** Comparators for the column headers; ties keep the due date order. */
const compare: Record<SortKey, (a: Occurrence, b: Occurrence) => number> = {
  title: (a, b) => a.title.localeCompare(b.title),
  amount: (a, b) => Number(a.amount) - Number(b.amount),
  due_date: (a, b) => a.due_date.localeCompare(b.due_date),
  status: (a, b) => statusOrder[a.status] - statusOrder[b.status],
  paid_at: (a, b) => (a.paid_at ?? '9999').localeCompare(b.paid_at ?? '9999'),
};

export default function Payments() {
  const { month, setMonth, isAdmin, user } = useSession();
  const [tab, setTab] = useState<Tab>('all');
  const [currency, setCurrency] = useState<Currency | ''>('');
  const [category, setCategory] = useState('');
  const [assignee, setAssignee] = useState('');
  const [search, setSearch] = useState('');
  const [onDate, setOnDate] = useState('');
  const [paying, setPaying] = useState<Occurrence | null>(null);
  const [receipts, setReceipts] = useState<Occurrence | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'due_date', dir: 1 });
  const tabs: [Tab, string][] = [['all', t('все')], ['unpaid', t('к оплате')], ['overdue', t('просрочено')], ['paid', t('оплачено')]];

  // «Итоги на дату»: everything due up to the chosen day; otherwise the selected month.
  const range = onDate ? { to_date: onDate } : monthRange(month);
  const { data: summary } = useLoad(() => api<Summary>('/payments/summary' + query(range)), [month, onDate]);
  const { data: all, error } = useLoad(() => api<Occurrence[]>('/payment-occurrences' + query({ category, assignee })), [category, assignee]);
  const users = useLoad(() => (isAdmin ? api<TeamUser[]>('/users') : Promise.resolve([])), [isAdmin]).data ?? [];
  const everything = useLoad(() => api<Occurrence[]>('/payment-occurrences'), []).data;
  const categories = useMemo(() => [...new Set((everything ?? []).map((o) => o.category).filter(Boolean) as string[])].sort(), [everything]);

  const overdue = useMemo(() => (all ?? []).filter((o) => o.active && o.status === 'overdue'), [all]);
  const inMonth = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return (all ?? []).filter((o) => o.due_date.startsWith(month)
      && (!currency || o.currency === currency)
      && (!q || o.title.toLocaleLowerCase().includes(q)));
  }, [all, month, currency, search]);
  const matches = (o: Occurrence, k: Tab) => k === 'all' || (k === 'unpaid' ? o.status !== 'paid' : o.status === k);
  const items = inMonth.filter((o) => matches(o, tab))
    .sort((a, b) => sort.dir * compare[sort.key](a, b) || a.due_date.localeCompare(b.due_date) || a.id - b.id);
  const header = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <SortButton type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}>
        {label}<span aria-hidden="true">{sort.key === key ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span>
      </SortButton>
    </th>
  );
  const filtered = !!search || !!currency || !!category || !!assignee || tab !== 'all';
  const exportUrl = '/api/v1/payment-occurrences/export' + query({
    ...monthRange(month), currency, category, assignee, search: search.trim(), status: tab === 'all' || tab === 'unpaid' ? '' : tab,
  });

  function showOverdue() {
    if (!overdue.length) return;
    setMonth(overdue[0].due_date.slice(0, 7));
    setTab('overdue');
    setCurrency('');
    setSearch('');
  }

  return (
    <Shell title={t('Платежи')} heading={t('мои платежи')} subtitle={t('Что и когда оплатить, что уже оплачено и что просрочено.')}
      action={<Button as="a" href={exportUrl} $variant="secondary">{t('Скачать CSV ↓')}</Button>}>
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      <Row $between $wrap>
        <MonthSwitcher />
        <OnDate>
          {t('итоги на дату')}
          <Input type="date" value={onDate} max="2100-12-31" min="2000-01-01" onChange={(e) => setOnDate(e.target.value)} aria-label={t('Итоги на дату')} />
          {onDate && <Button type="button" $variant="ghost" onClick={() => setOnDate('')}>{t('сбросить')}</Button>}
        </OnDate>
      </Row>
      <Tiles aria-live="polite">
        {currencies.map((c) => (
          <CurrencyTile key={c} currency={c} totals={summary?.currencies[c]} onDate={onDate}
            onClick={() => { setCurrency(c); setTab('unpaid'); }} />
        ))}
      </Tiles>
      {overdue.length > 0 && (
        <Notice $tone="error">
          <b>{overdue.length} {tp(overdue.length, ['платёж просрочен', 'платежа просрочены', 'платежей просрочены'], ['payment is overdue', 'payments are overdue'])}.</b>
          <span>{t('Есть неоплаченные периоды с истёкшим сроком.')}</span>
          <Button type="button" $variant="ghost" onClick={showOverdue}>{t('показать →')}</Button>
        </Notice>
      )}
      <section>
        <Toolbar>
          <Tabs role="group" aria-label={t('Статус платежа')}>
            {tabs.map(([key, label]) => (
              <TabButton key={key} type="button" $selected={tab === key} aria-pressed={tab === key} onClick={() => setTab(key)}>
                {label} <span>{inMonth.filter((o) => matches(o, key)).length}</span>
              </TabButton>
            ))}
          </Tabs>
          <Row $gap={0.8} $wrap>
            {!isAdmin && (
              <TabButton type="button" $selected={assignee === 'me'} aria-pressed={assignee === 'me'} onClick={() => setAssignee(assignee === 'me' ? '' : 'me')}>
                {t('только мои')}
              </TabButton>
            )}
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Найти платёж')} aria-label={t('Найти платёж')} />
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency | '')} aria-label={t('Валюта')}>
              <option value="">{t('Все валюты')}</option>
              {currencies.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('Категория')}>
              <option value="">{t('Все категории')}</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="-">{t('Без категории')}</option>
            </Select>
            {isAdmin && (
              <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label={t('Ответственный')}>
                <option value="">{t('Все ответственные')}</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                <option value="-">{t('Без ответственного')}</option>
              </Select>
            )}
          </Row>
        </Toolbar>
        {!all ? <Empty>{t('Загружаем платежи…')}</Empty> : items.length === 0 ? (
          <Empty>
            <b>{filtered ? t('Ничего не нашлось') : t('Здесь пока спокойно')}</b>
            {filtered ? t('Измените запрос, фильтры или статус.') : t('В этом месяце нет периодов оплаты. Система создаёт их до конца следующего месяца.')}
          </Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  {header('title', t('Имя'))}{header('amount', t('Сумма'))}{header('due_date', t('Срок'))}
                  {header('status', t('Состояние'))}{header('paid_at', t('Оплачено'))}<th />
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <PaymentName>
                        <CurrencyBadge aria-hidden="true">{symbols[o.currency]}</CurrencyBadge>
                        <b>{o.title}</b>
                        <small>
                          {[o.wallet?.sanctioned && t('⛔ санкции OFAC'), o.category, o.assignee && (o.assignee.id === user.id && !isAdmin ? t('вы') : '@' + o.assignee.username), !o.active && t('архив')]
                            .filter(Boolean).join(' · ')}
                        </small>
                      </PaymentName>
                    </td>
                    <td><Amount>{symbols[o.currency]} {money(o.amount)}<small>{perPeriod(o.frequency)}</small></Amount></td>
                    <td>
                      <Due $late={o.is_late}>{numericDate(o.due_date)}</Due>
                      {o.is_late && <Muted> · {t('{n} дн.', { n: o.days_overdue })}</Muted>}
                    </td>
                    <td><Pill $status={o.status}>{statusName(o.status)}</Pill></td>
                    <td><Muted>{o.paid_at ? numericDate(o.paid_at) : '—'}</Muted></td>
                    <td>
                      <Row $gap={0.6}>
                        {o.payment_url && o.status !== 'paid' && !o.wallet?.sanctioned && (
                          <Button as="a" href={o.payment_url} target="_blank" rel="noopener noreferrer" $small $variant="secondary"
                            title={o.payment_details ? t('Оплатить · {details}', { details: o.payment_details }) : t('Открыть ссылку на оплату')}
                            aria-label={t('Открыть ссылку на оплату')}>💳</Button>
                        )}
                        <Button type="button" $small $variant="secondary" onClick={() => setReceipts(o)} title={t('Чеки и ссылки')} aria-label={t('Чеки и ссылки')}>
                          🧾{o.receipts > 0 ? ` ${o.receipts}` : ''}
                        </Button>
                        <Button type="button" $small $variant={o.status === 'paid' ? 'secondary' : 'primary'} onClick={() => setPaying(o)}>
                          {o.status === 'paid' ? t('изменить') : t('оплатить')}
                        </Button>
                      </Row>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pager>{items.length} {tp(items.length, ['платёж', 'платежа', 'платежей'], ['payment', 'payments'])}</Pager>
      </section>
      {paying && <PayModal occurrence={paying} onClose={() => setPaying(null)} />}
      {receipts && <ReceiptsModal occurrence={receipts} onClose={() => setReceipts(null)} />}
    </Shell>
  );
}

/** A service-style tile: caption, big remaining amount and two rings showing paid vs. unpaid. */
function CurrencyTile({ currency, totals, onDate, onClick }: { currency: Currency; totals?: Totals; onDate: string; onClick: () => void }) {
  const total = Number(totals?.total ?? 0);
  const paid = total ? Math.round((Number(totals?.paid ?? 0) / total) * 100) : 0;
  const overdue = Number(totals?.overdue ?? 0);
  return (
    <Tile $interactive role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      aria-label={t('{name}: показать неоплаченные', { name: currencyName(currency) })}>
      <TileTitle>{currencyName(currency)} · {currency}<Chevron aria-hidden="true">›</Chevron></TileTitle>
      <Muted>{onDate ? t('не оплачено на {date}', { date: longDate(onDate) }) : t('осталось оплатить за месяц')}</Muted>
      <Big>{symbols[currency]} {totals ? money(totals.unpaid) : '—'}</Big>
      <Muted>{t('оплачено {paid} из {total} {symbol}', { paid: totals ? money(totals.paid) : '—', total: totals ? money(totals.total) : '—', symbol: symbols[currency] })}</Muted>
      <Wire height={12}>
        <Ring $size={paid >= 50 ? 13 : 7}>{paid}%</Ring>
        <Ring $size={paid >= 50 ? 7 : 13}>{100 - paid}%</Ring>
      </Wire>
      {overdue > 0 && <Corner><Sticker $tilt={-7}>{t('просрочено {sum}', { sum: `${money(overdue)} ${symbols[currency]}` })}</Sticker></Corner>}
      {totals?.count === 0 && <Corner><Sticker $tilt={6}>{t('спокойно ✓')}</Sticker></Corner>}
    </Tile>
  );
}

const OnDate = styled.label`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: ${({ theme }) => theme.color.muted};
  input { width: auto; min-height: 3.8rem; }
`;

const Tiles = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.6rem;
  ${({ theme }) => theme.mobile} { grid-template-columns: 1fr; }
`;

const Big = styled.div`
  margin: 1.2rem 0 0.2rem;
  font-size: 3.6rem;
  line-height: 1.1;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.color.strong};
`;

const Ring = styled.span<{ $size: number }>`
  position: absolute;
  bottom: -2rem;
  display: grid;
  place-items: center;
  width: ${({ $size }) => $size}rem;
  height: ${({ $size }) => $size}rem;
  border-radius: 50%;
  border: 1px solid ${({ theme }) => theme.color.faint};
  color: ${({ theme }) => theme.color.muted};
  font-size: ${({ $size }) => ($size > 10 ? 1.8 : 1.3)}rem;
  &:first-child { left: 18%; }
  &:last-child { right: 14%; }
`;

const Corner = styled.div`
  position: absolute;
  right: 2rem;
  top: 9.6rem;
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.2rem;
  margin-bottom: 0.8rem;
  input, select { min-height: 4rem; width: auto; }
  input { width: 20rem; }
  ${({ theme }) => theme.mobile} { input { width: 100%; } }
`;

const Tabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const TabButton = styled.button<{ $selected: boolean }>`
  padding: 0.8rem 1.4rem;
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.muted};
  font-size: 1.5rem;
  span { margin-left: 0.4rem; color: ${({ theme }) => theme.color.faint}; }
  &:hover { color: ${({ theme }) => theme.color.strong}; }
  ${({ $selected, theme }) => $selected && css`background: ${theme.color.tile}; color: ${theme.color.strong}; span { color: ${theme.color.accent}; }`}
`;

const SortButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font: inherit;
  color: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  span { color: ${({ theme }) => theme.color.faint}; font-size: 0.9em; }
  &:hover, &:hover span { color: ${({ theme }) => theme.color.strong}; }
`;

const Due = styled.span<{ $late: boolean }>`
  color: ${({ theme, $late }) => ($late ? theme.color.overdue : theme.color.text)};
`;

const Pager = styled.div`
  padding: 1.4rem;
  text-align: right;
  color: ${({ theme }) => theme.color.faint};
  font-size: 1.5rem;
`;
