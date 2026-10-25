import { useRouter } from 'next/router';
import { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import type { Budget, BudgetLine } from '@/lib/api';
import { date, money, symbols, type Currency } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';

// Paid vs. remaining of the plan, in one currency (no conversion). Paid is the brand hue, remaining
// a neutral track; both are named in the legend and in the tooltip, and the tables below repeat the data.

function useColors() {
  const theme = useTheme();
  return { paid: theme.name === 'dark' ? theme.color.accent : theme.color.accentDeep, remaining: theme.color.faint };
}

/** A round upper bound for the axis: 1, 2, 2.5 or 5 × 10ⁿ. */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 2.5, 5, 10].find((step) => step * power >= value) ?? 10) * power;
}

const short = (value: number) => (value >= 1e6 ? `${+(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${+(value / 1e3).toFixed(1)}k` : String(value));

export function Legend() {
  const colors = useColors();
  return (
    <LegendRow>
      <span><Swatch style={{ background: colors.paid }} />{t('оплачено')}</span>
      <span><Swatch style={{ background: colors.remaining }} />{t('осталось')}</span>
    </LegendRow>
  );
}

function Tip({ title, line, currency }: { title: string; line: BudgetLine; currency: Currency }) {
  const s = symbols[currency];
  return (
    <>
      <b>{title}</b>
      <span>{t('план')}: {s} {money(line.planned)}</span>
      <span>{t('оплачено')}: {s} {money(line.paid)}</span>
      <span>{t('осталось')}: {s} {money(line.remaining)}</span>
    </>
  );
}

/** Columns by month; a click opens the month in the calendar. */
export function MonthChart({ budget, currency }: { budget: Budget; currency: Currency }) {
  const colors = useColors();
  const router = useRouter();
  const { setMonth } = useSession();
  const [active, setActive] = useState<number | null>(null);
  const top = niceMax(Math.max(...budget.months.map((m) => Number(m.currencies[currency].planned))));
  const ticks = [1, 0.5, 0];
  return (
    <>
    <Chart role="group" aria-label={t('План и оплата по месяцам, {c}', { c: currency })}>
      <Axis aria-hidden="true">{ticks.map((k) => <span key={k}>{short(top * k)}</span>)}</Axis>
      <Plot>
        {ticks.map((k) => <Grid key={k} style={{ top: `${(1 - k) * 20}rem` }} />)}
        {budget.months.map((m, i) => {
          const line = m.currencies[currency];
          const paid = (Number(line.paid) / top) * 100;
          const remaining = (Number(line.remaining) / top) * 100;
          const name = date(m.month + '-01', { month: 'long' });
          return (
            <Column key={m.month} type="button" aria-label={`${name}: ${t('план')} ${money(line.planned)} ${currency}, ${t('оплачено')} ${money(line.paid)}`}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              onClick={() => { setMonth(m.month); router.push('/calendar'); }}>
              <Stack>
                {remaining > 0 && <Segment $top style={{ height: `${remaining}%`, background: colors.remaining }} />}
                {paid > 0 && <Segment $top={remaining === 0} style={{ height: `${paid}%`, background: colors.paid }} />}
              </Stack>
              <Label aria-hidden="true">
                <span>{date(m.month + '-01', { month: 'short' }).replace('.', '')}</span>
                <span>{name.charAt(0).toUpperCase()}</span>
              </Label>
              {active === i && <Tooltip $right={i > 7}><Tip title={name} line={line} currency={currency} /></Tooltip>}
            </Column>
          );
        })}
      </Plot>
    </Chart>
    <MobileMonths aria-label={t('План и оплата по месяцам, {c}', { c: currency })}>
      {budget.months.map((m) => {
        const line = m.currencies[currency];
        const total = Number(line.planned);
        return <button type="button" key={m.month} onClick={() => { setMonth(m.month); router.push('/calendar'); }}>
          <span>{date(m.month + '-01', { month: 'long' })}</span>
          <b>{money(line.planned)} {symbols[currency]}</b>
          <span className="month-chart-track" aria-hidden="true"><i style={{ width: `${total / top * 100}%`, background: colors.remaining }}><i style={{ width: `${total > 0 ? Math.min(100, Number(line.paid) / total * 100) : 0}%`, background: colors.paid }} /></i></span>
          <small>{t('Оплачено')} {money(line.paid)} {symbols[currency]}</small>
        </button>;
      })}
    </MobileMonths>
    </>
  );
}

/** Horizontal bars by category, longest plan first. */
export function CategoryChart({ budget, currency }: { budget: Budget; currency: Currency }) {
  const colors = useColors();
  const [active, setActive] = useState<string | null>(null);
  const rows = budget.categories
    .map((c) => ({ name: c.category ?? t('без категории'), line: c.currencies[currency] }))
    .filter((r) => Number(r.line.planned) > 0)
    .sort((a, b) => Number(b.line.planned) - Number(a.line.planned));
  if (!rows.length) return null;
  const top = Math.max(...rows.map((r) => Number(r.line.planned)));
  return (
    <Bars role="list" aria-label={t('План по категориям, {c}', { c: currency })}>
      {rows.map((r) => (
        <BarRow key={r.name} role="listitem" tabIndex={0} onMouseEnter={() => setActive(r.name)} onMouseLeave={() => setActive(null)}
          onFocus={() => setActive(r.name)} onBlur={() => setActive(null)}>
          <BarName title={r.name}>{r.name}</BarName>
          <Track>
            <span style={{ width: `${(Number(r.line.planned) / top) * 100}%` }}>
              {Number(r.line.paid) > 0 && <i style={{ flex: Number(r.line.paid), background: colors.paid }} />}
              {Number(r.line.remaining) > 0 && <i style={{ flex: Number(r.line.remaining), background: colors.remaining }} />}
            </span>
          </Track>
          <BarValue>{symbols[currency]} {money(r.line.planned)}</BarValue>
          {active === r.name && <Tooltip $right={false} $below><Tip title={r.name} line={r.line} currency={currency} /></Tooltip>}
        </BarRow>
      ))}
    </Bars>
  );
}

const LegendRow = styled.div`
  display: flex;
  gap: 1.6rem;
  color: ${({ theme }) => theme.color.muted};
  font-size: 1.4rem;
  span { display: inline-flex; align-items: center; gap: 0.6rem; }
`;

const Swatch = styled.i`
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 0.3rem;
`;

const Chart = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.8rem;
  padding: 1.6rem 1.6rem 0.8rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.surface};
  @media (max-width: 720px) { display: none; }
`;

const MobileMonths = styled.div`
  display: none;
  @media (max-width: 720px) { display: grid; gap: 4px; }
  button { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px 12px; text-align: left; padding: 12px 0; background: transparent; color: var(--desk-ink); border-bottom: 1px solid var(--desk-rule); }
  button > span:first-child { font-size: 15px; text-transform: capitalize; }
  b { text-align: right; font-size: 15px; font-weight: 550; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  small { grid-column: 1 / -1; font-size: 13px; color: var(--desk-muted); }
  .month-chart-track { grid-column: 1 / -1; height: 7px; background: var(--desk-raised); border-radius: 4px; overflow: hidden; }
  i { display: block; height: 100%; border-radius: inherit; }
`;

const Axis = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 20rem;
  color: ${({ theme }) => theme.color.muted};
  font-size: 1.2rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  span { line-height: 0; }
`;

const Plot = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 0.4rem;
`;

const Grid = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: ${({ theme }) => theme.color.line};
  pointer-events: none;
`;

const Column = styled.button`
  position: relative;
  display: grid;
  grid-template-rows: 20rem auto;
  justify-items: center;
  padding: 0;
  cursor: pointer;
  border-radius: ${({ theme }) => theme.radius.sm};
  &:hover, &:focus-visible { background: ${({ theme }) => theme.color.hover}; }
`;

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
  width: min(70%, 3.2rem);
  height: 100%;
`;

const Segment = styled.div<{ $top: boolean }>`
  min-height: 2px;
  border-radius: ${({ $top }) => ($top ? '4px 4px 0 0' : '0')};
`;

// On a phone twelve short names do not fit: only the first letter is shown.
const Label = styled.span`
  padding: 0.6rem 0;
  color: ${({ theme }) => theme.color.muted};
  font-size: 1.2rem;
  span + span { display: none; }
  ${({ theme }) => theme.mobile} {
    span:first-child { display: none; }
    span + span { display: inline; }
  }
`;

const Tooltip = styled.div<{ $right: boolean; $below?: boolean }>`
  position: absolute;
  z-index: 5;
  ${({ $below }) => ($below ? 'top: 100%;' : 'top: 2rem;')}
  ${({ $right }) => ($right ? 'right: 50%;' : 'left: 50%;')}
  display: grid;
  gap: 0.2rem;
  min-width: 16rem;
  padding: 1rem 1.2rem;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.tile};
  box-shadow: 0 0.8rem 2.4rem ${({ theme }) => theme.color.shadow};
  color: ${({ theme }) => theme.color.text};
  font-size: 1.3rem;
  text-align: left;
  white-space: nowrap;
  pointer-events: none;
  b { color: ${({ theme }) => theme.color.strong}; font-weight: 500; text-transform: capitalize; }
`;

const Bars = styled.div`
  display: grid;
  gap: 0.4rem;
  padding: 1.2rem 1.6rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.surface};
`;

const BarRow = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: minmax(8rem, 16rem) 1fr auto;
  align-items: center;
  gap: 1.2rem;
  padding: 0.6rem 0.8rem;
  border-radius: ${({ theme }) => theme.radius.sm};
  outline-offset: 2px;
  &:hover, &:focus-visible { background: ${({ theme }) => theme.color.hover}; }
  ${({ theme }) => theme.mobile} {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; }
    ${Tooltip} { left: 0; right: 0; min-width: 0; white-space: normal; overflow-wrap: anywhere; }
  }
`;

const BarName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ theme }) => theme.color.text};
`;

const Track = styled.div`
  height: 1.2rem;
  > span { display: flex; gap: 2px; height: 100%; min-width: 2px; }
  i { display: block; height: 100%; }
  i:first-child { border-radius: 4px 0 0 4px; }
  i:last-child { border-radius: 0 4px 4px 0; }
  i:only-child { border-radius: 4px; }
`;

const BarValue = styled.span`
  color: ${({ theme }) => theme.color.muted};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${({ theme }) => theme.mobile} { white-space: normal; overflow-wrap: anywhere; text-align: right; }
`;
