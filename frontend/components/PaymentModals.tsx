import { api, type Occurrence, type Recurring } from '@/lib/api';
import { currencies, longDate, moneyWith } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { FormRow, InfoBox, Modal, ModalForm } from './Modal';
import { Button, Field, Input, Select } from './ui';

type Close = { onClose: () => void };

export function CreatePaymentModal({ onClose }: Close) {
  const { settings, setMonth, refresh } = useSession();
  const toast = useToast();
  return (
    <Modal title="Новый регулярный платёж" onClose={onClose}>
      <ModalForm
        onSubmit={async (data) => {
          const created = await api<Recurring>('/recurring-payments', {
            method: 'POST',
            body: { title: data.get('title'), amount: data.get('amount'), currency: data.get('currency'), first_due_date: data.get('first_due_date'), frequency: 'monthly' },
          });
          onClose();
          setMonth(created.first_due_date.slice(0, 7));
          refresh();
          toast('Регулярный платёж добавлен');
        }}
        actions={<>
          <Button type="button" $variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit">Добавить платёж</Button>
        </>}
      >
        <Field>Название платежа<Input name="title" maxLength={120} required placeholder="Например, аренда офиса" autoFocus /></Field>
        <FormRow>
          <Field>Сумма<Input name="amount" type="number" step="0.01" min="0.01" max="9999999999.99" required placeholder="0,00" inputMode="decimal" /></Field>
          <Field>Валюта<Select name="currency" defaultValue="RUB">{currencies.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </FormRow>
        <Field>
          Первая дата оплаты
          <Input name="first_due_date" type="date" min="2000-01-01" max="2100-12-31" defaultValue={settings.today} required />
          <small>Часовой пояс: {settings.timezone}</small>
        </Field>
        <InfoBox>
          <b>Повторяется каждый месяц.</b> Если такого числа нет, срок — последний день месяца.
          Для каждого периода будет своя отметка оплаты. Если до срока меньше 3 дней, напоминание уйдёт сразу.
        </InfoBox>
      </ModalForm>
    </Modal>
  );
}

export function PayModal({ occurrence: o, onClose }: Close & { occurrence: Occurrence }) {
  const { settings, refresh } = useSession();
  const toast = useToast();
  const paid = o.paid_at !== null;
  return (
    <Modal title={paid ? 'Изменить оплату' : 'Отметить оплату'} onClose={onClose}>
      <ModalForm
        onSubmit={async (data, submitter) => {
          const undo = submitter?.value === 'undo';
          await api(`/payment-occurrences/${o.id}`, { method: 'PATCH', body: undo ? { paid: false } : { paid: true, paid_at: data.get('paid_at') } });
          onClose();
          refresh();
          toast(undo ? 'Оплата отменена. Дата очищена.' : 'Оплата сохранена');
        }}
        actions={<>
          {paid
            ? <Button type="submit" name="action" value="undo" formNoValidate $variant="secondary">Отменить оплату</Button>
            : <Button type="button" $variant="secondary" onClick={onClose}>Назад</Button>}
          <Button type="submit" name="action" value="save">{paid ? 'Сохранить дату' : 'Подтвердить оплату'}</Button>
        </>}
      >
        <InfoBox>
          <b>{o.title}</b><br />
          {moneyWith(o.amount, o.currency)} · срок {longDate(o.due_date)}<br />
          Изменение затронет только этот период.
        </InfoBox>
        <Field>
          Фактическая дата оплаты
          <Input name="paid_at" type="date" defaultValue={o.paid_at ?? settings.today} max={settings.today} required />
          <small>Оплата в день срока — вовремя. Исправление даты пересчитает просрочку, срок не изменится.</small>
        </Field>
      </ModalForm>
    </Modal>
  );
}

export function ArchiveModal({ payment, onClose }: Close & { payment: Recurring }) {
  const { refresh } = useSession();
  const toast = useToast();
  return (
    <Modal title="Прекратить повторение?" onClose={onClose}>
      <ModalForm
        onSubmit={async () => {
          await api(`/recurring-payments/${payment.id}`, { method: 'DELETE' });
          onClose();
          refresh();
          toast('Платёж перенесён в архив. История сохранена.');
        }}
        actions={<>
          <Button type="button" $variant="secondary" onClick={onClose}>Оставить</Button>
          <Button type="submit" $variant="danger">Прекратить платёж</Button>
        </>}
      >
        <InfoBox>
          <b>{payment.title}</b><br />
          Новые периоды и напоминания создаваться не будут. Уже созданные периоды, даты и история оплат сохранятся в архиве.
        </InfoBox>
      </ModalForm>
    </Modal>
  );
}
