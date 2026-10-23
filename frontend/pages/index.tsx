import { useMemo, useState } from 'react';
import styled, { css } from 'styled-components';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { PayModal } from '@/components/PaymentModals';
import { Shell } from '@/components/Shell';
import {
  Amount, Button, Chevron, CurrencyBadge, Empty, Input, Muted, Notice, PaymentName, Pill, Row, Select, Sticker,
  TableWrap, Tile, TileTitle, Wire,
} from '@/components/ui';
import { api, type Occurrence, type Summary, type Totals } from '@/lib/api';
import { currencies, date, money, monthRange, plural, statusNames, symbols, type Currency } from '@/lib/format';
import { useLoad, useSession } from '@/lib/session';

type Tab = 'all' | 'unpaid' | 'overdue' | 'paid';
const tabs: [Tab, string][] = [['all', 'все'], ['unpaid', 'к оплате'], ['overdue', 'просрочено'], ['paid', 'оплачено']];
const currencyTitles: Record<Currency, string> = { RUB: 'рубли', USD: 'доллары', EUR: 'евро' };

export default function Payments() {
  const { month, setMonth } = useSession();
  const [tab, setTab] = useState<Tab>('all');
  const [currency, setCurrency] = useState<Currency | ''>('');
  const [search, setSearch] = useState('');
  const [paying, setPaying] = useState<Occurrence | null>(null);

  const range = monthRange(month);
  const { data: summary } = useLoad(() => api<Summary>('/payments/summary?' + new URLSearchParams(range)), [month]);
  const { data: all, error } = useLoad(() => api<Occurrence[]>('/payment-occurrences'), []);

  const overdue = useMemo(() => (all ?? []).filter((o) => o.active && o.status === 'overdue'), [all]);
  const inMonth = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru');
    return (all ?? []).filter((o) => o.due_date.startsWith(month)
      && (!currency || o.currency === currency)
      && (!query || o.title.toLocaleLowerCase('ru').includes(query)));
  }, [all, month, currency, search]);
  const matches = (o: Occurrence, t: Tab) => t === 'all' || (t === 'unpaid' ? o.status !== 'paid' : o.status === t);
  const items = inMonth.filter((o) => matches(o, tab));
  const filtered = !!search || !!currency || tab !== 'all';

  function showOverdue() {
    if (!overdue.length) return;
    setMonth(overdue[0].due_date.slice(0, 7));
    setTab('overdue');
    setCurrency('');
    setSearch('');
  }

  return (
    <Shell title="Платежи" heading="мои платежи" subtitle="Что и когда оплатить, что уже оплачено и что просрочено.">
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      <MonthSwitcher hint="суммы по сроку оплаты, без конвертации" />
      <Tiles aria-live="polite">
        {currencies.map((c) => (
          <CurrencyTile key={c} currency={c} totals={summary?.currencies[c]}
            onClick={() => { setCurrency(c); setTab('unpaid'); }} />
        ))}
      </Tiles>
      {overdue.length > 0 && (
        <Notice $tone="error">
          <b>{overdue.length} {plural(overdue.length, 'платёж просрочен', 'платежа просрочены', 'платежей просрочены')}.</b>
          <span>Есть неоплаченные периоды с истёкшим сроком.</span>
          <Button type="button" $variant="ghost" onClick={showOverdue}>показать →</Button>
        </Notice>
      )}
      <section>
        <Toolbar>
          <Tabs role="group" aria-label="Статус платежа">
            {tabs.map(([key, label]) => (
              <TabButton key={key} type="button" $selected={tab === key} aria-pressed={tab === key} onClick={() => setTab(key)}>
                {label} <span>{inMonth.filter((o) => matches(o, key)).length}</span>
              </TabButton>
            ))}
          </Tabs>
          <Row $gap={0.8} $wrap>
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти платёж" aria-label="Найти платёж" />
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency | '')} aria-label="Валюта">
              <option value="">Все валюты</option>
              {currencies.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Row>
        </Toolbar>
        {!all ? <Empty>Загружаем платежи…</Empty> : items.length === 0 ? (
          <Empty>
            <b>{filtered ? 'Ничего не нашлось' : 'Здесь пока спокойно'}</b>
            {filtered ? 'Измените запрос, валюту или статус.' : 'В этом месяце нет периодов оплаты. Система создаёт их до конца следующего месяца.'}
          </Empty>
        ) : (
          <TableWrap>
            <table>
              <thead><tr><th>Имя</th><th>Сумма</th><th>Срок</th><th>Состояние</th><th>Оплачено</th><th /></tr></thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <PaymentName>
                        <CurrencyBadge aria-hidden="true">{symbols[o.currency]}</CurrencyBadge>
                        <b>{o.title}</b>
                        <small>{o.active ? 'ежемесячно' : 'архив'}</small>
                      </PaymentName>
                    </td>
                    <td><Amount>{symbols[o.currency]} {money(o.amount)}<small>/ месяц</small></Amount></td>
                    <td>
                      <Due $late={o.is_late}>{date(o.due_date, { day: '2-digit', month: '2-digit', year: 'numeric' })}</Due>
                      {o.is_late && <Muted> · {o.days_overdue} дн.</Muted>}
                    </td>
                    <td><Pill $status={o.status}>{statusNames[o.status].toLowerCase()}</Pill></td>
                    <td><Muted>{o.paid_at ? date(o.paid_at, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</Muted></td>
                    <td>
                      <Button type="button" $small $variant={o.status === 'paid' ? 'secondary' : 'primary'} onClick={() => setPaying(o)}>
                        {o.status === 'paid' ? 'изменить' : 'оплатить'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pager>{items.length} {plural(items.length, 'платёж', 'платежа', 'платежей')}</Pager>
      </section>
      {paying && <PayModal occurrence={paying} onClose={() => setPaying(null)} />}
    </Shell>
  );
}

/** A service-style tile: caption, big remaining amount and two rings showing paid vs. unpaid. */
function CurrencyTile({ currency, totals, onClick }: { currency: Currency; totals?: Totals; onClick: () => void }) {
  const total = Number(totals?.total ?? 0);
  const paid = total ? Math.round((Number(totals?.paid ?? 0) / total) * 100) : 0;
  const overdue = Number(totals?.overdue ?? 0);
  return (
    <Tile $interactive role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      aria-label={`${currencyTitles[currency]}: показать неоплаченные`}>
      <TileTitle>{currencyTitles[currency]} · {currency}<Chevron aria-hidden="true">›</Chevron></TileTitle>
      <Muted>осталось оплатить за месяц</Muted>
      <Big>{symbols[currency]} {totals ? money(totals.unpaid) : '—'}</Big>
      <Muted>оплачено {totals ? money(totals.paid) : '—'} из {totals ? money(totals.total) : '—'} {symbols[currency]}</Muted>
      <Wire height={12}>
        <Ring $size={paid >= 50 ? 13 : 7}>{paid}%</Ring>
        <Ring $size={paid >= 50 ? 7 : 13}>{100 - paid}%</Ring>
      </Wire>
      {overdue > 0 && <Corner><Sticker $tilt={-7}>просрочено {money(overdue)} {symbols[currency]}</Sticker></Corner>}
      {totals?.count === 0 && <Corner><Sticker $tilt={6}>спокойно ✓</Sticker></Corner>}
    </Tile>
  );
}

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
  input { width: 22rem; }
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

const Due = styled.span<{ $late: boolean }>`
  color: ${({ theme, $late }) => ($late ? theme.color.overdue : theme.color.text)};
`;

const Pager = styled.div`
  padding: 1.4rem;
  text-align: right;
  color: ${({ theme }) => theme.color.faint};
  font-size: 1.5rem;
`;
