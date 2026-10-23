import { useState } from 'react';
import styled from 'styled-components';
import { ArchiveModal } from '@/components/PaymentModals';
import { Shell } from '@/components/Shell';
import { Button, Chevron, Empty, Muted, Notice, Pill, Sticker, Tile, TileTitle, Wire } from '@/components/ui';
import { api, type Recurring } from '@/lib/api';
import { date, money, plural, symbols } from '@/lib/format';
import { useLoad, useSession } from '@/lib/session';

export default function RecurringPage() {
  const { isAdmin } = useSession();
  const [archiving, setArchiving] = useState<Recurring | null>(null);
  const { data, error } = useLoad(() => api<Recurring[]>('/recurring-payments'), []);
  return (
    <Shell title="Регулярные" heading="регулярные платежи" subtitle="Один раз настройте расход — система сама создаёт следующие периоды.">
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      <Notice>Каждый месяц — отдельный период со своей отметкой оплаты. Если нужного числа нет, срок переносится на последний день месяца.</Notice>
      {!data ? <Empty>Загружаем…</Empty> : data.length === 0 ? (
        <Empty><b>Начните с регулярного платежа</b>Добавьте аренду, сервер или подписку кнопкой «Добавить платёж» слева.</Empty>
      ) : (
        <Grid>
          {data.map((r) => (
            <Tile key={r.id}>
              <TileTitle>{r.title}<Chevron aria-hidden="true">›</Chevron></TileTitle>
              <Muted>{symbols[r.currency]} {money(r.amount)} / месяц · {r.anchor_day}-го числа</Muted>
              <Wire height={13.2}>
                <Line>с {date(r.first_due_date, { day: 'numeric', month: 'long', year: 'numeric' })}</Line>
                <Line>{r.unpaid_count} {plural(r.unpaid_count, 'неоплаченный период', 'неоплаченных периода', 'неоплаченных периодов')}</Line>
                <Line>
                  <Pill $status={r.active ? 'active' : 'archived'}>{r.active ? 'активен' : 'в архиве'}</Pill>
                  {isAdmin && r.active && <Button type="button" $small $variant="secondary" onClick={() => setArchiving(r)}>прекратить</Button>}
                </Line>
              </Wire>
              {!r.active && <Corner><Sticker $tilt={-6}>архив</Sticker></Corner>}
            </Tile>
          ))}
        </Grid>
      )}
      {archiving && <ArchiveModal payment={archiving} onClose={() => setArchiving(null)} />}
    </Shell>
  );
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(28rem, 1fr));
  gap: 1.6rem;
`;

const Line = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1.4rem;
  min-height: 4.2rem;
  & + & { border-top: 1px solid ${({ theme }) => theme.color.faint}; }
`;

const Corner = styled.div`
  position: absolute;
  right: 2rem;
  bottom: 2.4rem;
`;
