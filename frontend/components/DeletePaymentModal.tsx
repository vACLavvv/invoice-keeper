import { useState } from 'react';
import styled from 'styled-components';
import { api, type Forecast, type Occurrence, type Recurring } from '@/lib/api';
import { longDate, moneyWith } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { InfoBox, Modal, ModalForm } from './Modal';
import { Button, Muted } from './ui';

export function DeletePaymentModal({ payment, onClose }: {
  payment: Recurring | Occurrence | Forecast; onClose: () => void;
}) {
  const { refresh } = useSession();
  const toast = useToast();
  const period = 'due_date' in payment ? payment : null;
  const canChoose = !!period && payment.frequency !== 'once';
  const [scope, setScope] = useState<'period' | 'all'>(canChoose ? 'period' : 'all');
  const paymentID = 'recurring_payment_id' in payment ? payment.recurring_payment_id : payment.id;
  const single = scope === 'period' && period;
  const base = `/recurring-payments/${paymentID}`;
  const target = single ? `${base}/periods/${period.due_date}` : base;

  return (
    <Modal title={t('Удалить платёж?')} onClose={onClose}>
      <ModalForm onSubmit={async () => {
        await api(single ? target : `${target}?mode=delete`, { method: 'DELETE' });
        onClose();
        refresh();
        toast(single
          ? t('Удалён период «{title}» за {date}', { title: payment.title, date: longDate(period.due_date) })
          : t('Платёж «{title}» удалён', { title: payment.title }), false, {
          label: t('Отменить'),
          onClick: async () => {
            await api(`${target}/restore`, { method: 'POST' });
            refresh();
            toast(t('Платёж восстановлен'));
          },
        });
      }} actions={<>
        <Button type="button" $variant="secondary" autoFocus onClick={onClose}>{t('Оставить платёж')}</Button>
        <Button type="submit" $variant="danger">{single ? t('Удалить период') : t('Удалить платёж')}</Button>
      </>}>
        <InfoBox>
          <b>{payment.title}</b><br />
          {moneyWith(payment.amount, payment.currency)}
          {period && <> · {t('срок {date}', { date: longDate(period.due_date) })}</>}
        </InfoBox>
        {canChoose && <Choices role="radiogroup" aria-label={t('Что удалить')}>
          <Choice $selected={scope === 'period'}>
            <input type="radio" name="scope" value="period" checked={scope === 'period'} onChange={() => setScope('period')} />
            <span><b>{t('Только этот период')}</b><small>{t('Остальные сроки и повторение сохранятся.')}</small></span>
          </Choice>
          <Choice $selected={scope === 'all'}>
            <input type="radio" name="scope" value="all" checked={scope === 'all'} onChange={() => setScope('all')} />
            <span><b>{t('Весь платёж и повторения')}</b><small>{t('Все периоды, включая оплаченные, и будущие повторения.')}</small></span>
          </Choice>
        </Choices>}
        <p>{single
          ? t('Этот период исчезнет из календаря, истории и итогов. Напоминаний по нему больше не будет.')
          : payment.frequency === 'once'
            ? t('Платёж исчезнет из календаря, истории и итогов. Напоминаний по нему больше не будет.')
            : t('Платёж и все его периоды исчезнут из календаря, истории и итогов. Повторения и напоминания прекратятся.')}</p>
        <Muted>{t('После удаления появится кнопка «Отменить». Она вернёт запись вместе с датами оплаты и чеками.')}</Muted>
      </ModalForm>
    </Modal>
  );
}

const Choices = styled.div`
  display: grid;
  gap: 0.8rem;
`;

const Choice = styled.label<{ $selected: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.2rem;
  border: 1px solid ${({ theme, $selected }) => $selected ? theme.color.accent : theme.color.line};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme, $selected }) => $selected ? theme.color.accentSoft : theme.color.tile};
  cursor: pointer;
  input { width: auto; margin-top: 0.3rem; accent-color: ${({ theme }) => theme.color.accent}; }
  span { display: grid; gap: 0.3rem; }
  small { color: ${({ theme }) => theme.color.muted}; }
  &:focus-within { outline: 2px solid ${({ theme }) => theme.color.accent}; outline-offset: 2px; }
`;
