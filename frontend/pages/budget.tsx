import { useState } from 'react';
import styled from 'styled-components';
import { Shell } from '@/components/Shell';
import { Amount, Empty, Muted, Notice, Row, SectionTitle, TableWrap, Tile, TileTitle } from '@/components/ui';
import { api, type Budget, type BudgetLine } from '@/lib/api';
import { currencies, currencyName, date, money, symbols, type Currency } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';

export default function BudgetPage() {
  const { settings } = useSession();
  const [year, setYear] = useState(Number(settings.today.slice(0, 4)));
  const { data, error } = useLoad(() => api<Budget>(`/budget?year=${year}`), [year]);
  const used = currencies.filter((c) => data && Number(data.currencies[c].planned) > 0);
  const shown = used.length ? used : currencies;

  return (
    <Shell title={t('Бюджет')} heading={t('бюджет на год')} subtitle={t('Плановые расходы по месяцам и категориям, отдельно по каждой валюте.')}>
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      <Row $gap={0.4}>
        <Arrow type="button" aria-label={t('Предыдущий год')} onClick={() => setYear((y) => Math.max(2000, y - 1))}>‹</Arrow>
        <Year aria-live="polite">{year}</Year>
        <Arrow type="button" aria-label={t('Следующий год')} onClick={() => setYear((y) => Math.min(2100, y + 1))}>›</Arrow>
      </Row>
      {!data ? <Empty>{t('Считаем…')}</Empty> : (
        <>
          <Tiles>
            {currencies.map((c) => <Total key={c} currency={c} line={data.currencies[c]} />)}
          </Tiles>
          <Notice><span>{t('Будущие месяцы посчитаны по правилу повторения каждого платежа, паузы учтены. «Оплачено» — по отмеченным периодам.')}</span></Notice>
          <SectionTitle>{t('по месяцам')}</SectionTitle>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>{t('Месяц')}</th>
                  {shown.map((c) => <th key={c}>{t('План, {c}', { c })}</th>)}
                  {shown.map((c) => <th key={c + 'p'}>{t('Оплачено, {c}', { c })}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month}>
                    <td>{capitalize(date(m.month + '-01', { month: 'long' }))}</td>
                    {shown.map((c) => <td key={c}><Cell value={m.currencies[c].planned} currency={c} /></td>)}
                    {shown.map((c) => <td key={c + 'p'}><Cell value={m.currencies[c].paid} currency={c} muted /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <SectionTitle>{t('по категориям')}</SectionTitle>
          {data.categories.length === 0 ? <Empty>{t('В этом году платежей нет')}</Empty> : (
            <TableWrap>
              <table>
                <thead><tr><th>{t('Категория')}</th>{shown.map((c) => <th key={c}>{t('План, {c}', { c })}</th>)}{shown.map((c) => <th key={c + 'r'}>{t('Осталось, {c}', { c })}</th>)}</tr></thead>
                <tbody>
                  {data.categories.map((row) => (
                    <tr key={row.category ?? '-'}>
                      <td>{row.category ?? <Muted>{t('без категории')}</Muted>}</td>
                      {shown.map((c) => <td key={c}><Cell value={row.currencies[c].planned} currency={c} /></td>)}
                      {shown.map((c) => <td key={c + 'r'}><Cell value={row.currencies[c].remaining} currency={c} muted /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </>
      )}
    </Shell>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Cell({ value, currency, muted = false }: { value: string; currency: Currency; muted?: boolean }) {
  if (Number(value) === 0) return <Muted>—</Muted>;
  return muted ? <Muted>{symbols[currency]} {money(value)}</Muted> : <Amount>{symbols[currency]} {money(value)}</Amount>;
}

function Total({ currency, line }: { currency: Currency; line: BudgetLine }) {
  const planned = Number(line.planned);
  const ratio = planned ? Math.round((Number(line.paid) / planned) * 100) : 0;
  return (
    <Tile>
      <TileTitle>{currencyName(currency)} · {currency}</TileTitle>
      <Muted>{t('план на год')}</Muted>
      <Big>{symbols[currency]} {money(line.planned)}</Big>
      <Track><span style={{ width: `${ratio}%` }} /></Track>
      <Row $between $wrap>
        <Muted>{t('оплачено {sum}', { sum: `${money(line.paid)} ${symbols[currency]}` })}</Muted>
        <Muted>{t('осталось {sum}', { sum: `${money(line.remaining)} ${symbols[currency]}` })}</Muted>
      </Row>
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
  margin: 0.8rem 0;
  font-size: 3.2rem;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.color.strong};
`;

const Track = styled.div`
  height: 0.6rem;
  margin-bottom: 0.8rem;
  border-radius: 99rem;
  background: ${({ theme }) => theme.color.line};
  overflow: hidden;
  span { display: block; height: 100%; background: ${({ theme }) => theme.color.accent}; }
`;

const Arrow = styled.button`
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  color: ${({ theme }) => theme.color.muted};
  font-size: 2.6rem;
  line-height: 1;
  &:hover { color: ${({ theme }) => theme.color.strong}; background: ${({ theme }) => theme.color.tile}; }
`;

const Year = styled.h2`
  min-width: 8rem;
  text-align: center;
  font-size: 2rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.strong};
`;
