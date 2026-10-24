import styled from 'styled-components';
import { monthLabel, shiftMonth } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Button, Row } from './ui';

/** «‹ Октябрь 2026 ›» — the pager style from the control panel. */
export function MonthSwitcher({ hint }: { hint?: string }) {
  const { month, setMonth, settings } = useSession();
  const current = settings.today.slice(0, 7);
  return (
    <Row $between $wrap>
      <Row $gap={0.4}>
        <Arrow type="button" aria-label={t('Предыдущий месяц')} onClick={() => setMonth(shiftMonth(month, -1))}>‹</Arrow>
        <Label aria-live="polite">{monthLabel(month)}</Label>
        <Arrow type="button" aria-label={t('Следующий месяц')} onClick={() => setMonth(shiftMonth(month, 1))}>›</Arrow>
      </Row>
      {month !== current
        ? <Button type="button" $variant="ghost" onClick={() => setMonth(current)}>{t('к текущему месяцу →')}</Button>
        : hint && <Hint>{hint}</Hint>}
    </Row>
  );
}

const Arrow = styled.button`
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  color: ${({ theme }) => theme.color.muted};
  font-size: 2.6rem;
  line-height: 1;
  &:hover { color: ${({ theme }) => theme.color.strong}; background: ${({ theme }) => theme.color.tile}; }
`;

const Label = styled.h2`
  min-width: 16rem;
  text-align: center;
  font-size: 1.8rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.strong};
`;

const Hint = styled.span`color: ${({ theme }) => theme.color.muted};`;
