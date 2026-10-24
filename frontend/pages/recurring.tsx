import { useState } from 'react';
import styled from 'styled-components';
import { ArchiveModal, EditPaymentModal, ImportModal, PauseModal } from '@/components/PaymentModals';
import { Shell } from '@/components/Shell';
import { Button, Chevron, Empty, Muted, Notice, Pill, Row, Sticker, Tile, TileTitle, Wire } from '@/components/ui';
import { api, type Recurring } from '@/lib/api';
import { frequencyName, longDate, money, perPeriod, symbols } from '@/lib/format';
import { t, tp } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';

export default function RecurringPage() {
  const { isAdmin, refresh } = useSession();
  const toast = useToast();
  const [modal, setModal] = useState<{ kind: 'edit' | 'pause' | 'archive'; payment: Recurring } | 'import' | null>(null);
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
    <Shell
      title={t('Регулярные')}
      heading={t('регулярные платежи')}
      subtitle={t('Один раз настройте расход — система сама создаёт следующие периоды.')}
      action={isAdmin && <Button type="button" $variant="secondary" onClick={() => setModal('import')}>{t('Импорт из CSV')}</Button>}
    >
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      <Notice><span>{t('Каждый период — отдельная отметка оплаты. Повтор ежемесячно, раз в квартал или раз в год; если нужного числа нет, срок переносится на последний день месяца.')}</span></Notice>
      {!data ? <Empty>{t('Загружаем…')}</Empty> : data.length === 0 ? (
        <Empty><b>{t('Начните с регулярного платежа')}</b>{t('Добавьте аренду, сервер или подписку кнопкой «Добавить платёж» слева или импортируйте CSV.')}</Empty>
      ) : (
        <Grid>
          {data.map((r) => (
            <Tile key={r.id}>
              <TileTitle>{r.title}<Chevron aria-hidden="true">›</Chevron></TileTitle>
              <Muted>
                {symbols[r.currency]} {money(r.amount)} {perPeriod(r.frequency)} · {frequencyName(r.frequency)}
                {r.category ? ` · ${r.category}` : ''}
              </Muted>
              <Wire height={r.payment_url || r.payment_details ? 21.3 : 17}>
                <Line>{r.next_due_date ? t('ближайший срок {date}', { date: longDate(r.next_due_date) }) : t('с {date}', { date: longDate(r.first_due_date) })}</Line>
                <Line>
                  {r.unpaid_count} {tp(r.unpaid_count, ['неоплаченный период', 'неоплаченных периода', 'неоплаченных периодов'], ['unpaid period', 'unpaid periods'])}
                  {r.assignee && <Muted>@{r.assignee.username}</Muted>}
                </Line>
                {(r.payment_url || r.payment_details) && (
                  <Line>
                    <Details title={r.payment_details ?? undefined}>{r.payment_details ?? ''}</Details>
                    {r.payment_url && <PayLink href={r.payment_url} target="_blank" rel="noopener noreferrer">{t('💳 оплатить ↗')}</PayLink>}
                  </Line>
                )}
                <Line>
                  <Pill $status={!r.active ? 'archived' : r.paused ? 'unpaid' : 'active'}>
                    {!r.active ? t('в архиве') : r.paused ? (r.paused.until ? t('на паузе до {date}', { date: longDate(r.paused.until) }) : t('на паузе')) : t('активен')}
                  </Pill>
                </Line>
                {isAdmin && r.active && (
                  <Line>
                    <Row $gap={0.4} $wrap>
                      <Button type="button" $small $variant="secondary" onClick={() => setModal({ kind: 'edit', payment: r })}>{t('изменить')}</Button>
                      {r.paused
                        ? <Button type="button" $small $variant="secondary" onClick={() => resume(r)}>{t('возобновить')}</Button>
                        : <Button type="button" $small $variant="secondary" onClick={() => setModal({ kind: 'pause', payment: r })}>{t('пауза')}</Button>}
                      <Button type="button" $small $variant="ghost" onClick={() => setModal({ kind: 'archive', payment: r })}>{t('прекратить')}</Button>
                    </Row>
                  </Line>
                )}
              </Wire>
              {!r.active && <Corner><Sticker $tilt={-6}>{t('архив')}</Sticker></Corner>}
              {r.active && r.paused && <Corner><Sticker $tilt={-6}>{t('пауза')}</Sticker></Corner>}
            </Tile>
          ))}
        </Grid>
      )}
      {modal === 'import' && <ImportModal onClose={() => setModal(null)} />}
      {modal && modal !== 'import' && modal.kind === 'edit' && <EditPaymentModal payment={modal.payment} onClose={() => setModal(null)} />}
      {modal && modal !== 'import' && modal.kind === 'pause' && <PauseModal payment={modal.payment} onClose={() => setModal(null)} />}
      {modal && modal !== 'import' && modal.kind === 'archive' && <ArchiveModal payment={modal.payment} onClose={() => setModal(null)} />}
    </Shell>
  );
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(30rem, 1fr));
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

const Details = styled(Muted)`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PayLink = styled.a`
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.accent};
`;

const Corner = styled.div`
  position: absolute;
  right: 2rem;
  top: 1.4rem;
`;
