import { useRef, useState } from 'react';
import styled from 'styled-components';
import { api, type ImportResult, type Occurrence, type Receipt, type Recurring, type TeamUser } from '@/lib/api';
import { currencies, date, frequencies, frequencyName, longDate, moneyWith, type Frequency } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { FormRow, InfoBox, Modal, ModalForm } from './Modal';
import { Button, Empty, Field, Input, Muted, Notice, Pill, Row, Select, TableWrap } from './ui';

type Close = { onClose: () => void };

/** Users for the «Ответственный» select (admin only) and known categories for suggestions. */
function usePaymentChoices() {
  const { isAdmin } = useSession();
  const users = useLoad(() => (isAdmin ? api<TeamUser[]>('/users') : Promise.resolve([])), [isAdmin]).data ?? [];
  const payments = useLoad(() => api<Recurring[]>('/recurring-payments'), []).data ?? [];
  const categories = [...new Set(payments.map((p) => p.category).filter(Boolean) as string[])].sort();
  return { users, categories };
}

function CategoryField({ value, categories }: { value?: string | null; categories: string[] }) {
  return (
    <Field>
      {t('Категория')}
      <Input name="category" defaultValue={value ?? ''} maxLength={40} list="ik-categories" placeholder={t('Например, IT или Аренда')} />
      <datalist id="ik-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
    </Field>
  );
}

function AssigneeField({ value, users }: { value?: number | null; users: TeamUser[] }) {
  return (
    <Field>
      {t('Ответственный')}
      <Select name="assignee_id" defaultValue={value ? String(value) : ''}>
        <option value="">{t('Не назначен')}</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.display_name} · @{u.username}</option>)}
      </Select>
      <small>{t('Личные напоминания по платежу уходят ответственному, если он привязал Telegram')}</small>
    </Field>
  );
}

/** Where to pay: a link to the bill or the service cabinet and free-form details. */
function PaymentLinkFields({ payment }: { payment?: Recurring }) {
  return (
    <>
      <Field>
        {t('Ссылка на оплату')}
        <Input name="payment_url" type="url" defaultValue={payment?.payment_url ?? ''} maxLength={500} placeholder="https://" />
        <small>{t('Кабинет или счёт: в напоминаниях появится кнопка «💳 Оплатить»')}</small>
      </Field>
      <Field>
        {t('Реквизиты')}
        <Input name="payment_details" defaultValue={payment?.payment_details ?? ''} maxLength={500} placeholder={t('Например, ИНН, номер договора или счёта')} />
      </Field>
    </>
  );
}

const optional = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

export function CreatePaymentModal({ onClose }: Close) {
  const { settings, setMonth, refresh } = useSession();
  const toast = useToast();
  const { users, categories } = usePaymentChoices();
  return (
    <Modal title={t('Новый регулярный платёж')} onClose={onClose}>
      <ModalForm
        onSubmit={async (data) => {
          const assignee = optional(data.get('assignee_id'));
          const created = await api<Recurring>('/recurring-payments', {
            method: 'POST',
            body: {
              title: data.get('title'), amount: data.get('amount'), currency: data.get('currency'), first_due_date: data.get('first_due_date'),
              frequency: data.get('frequency'), category: optional(data.get('category')), assignee_id: assignee ? Number(assignee) : null,
              payment_url: optional(data.get('payment_url')), payment_details: optional(data.get('payment_details')),
            },
          });
          onClose();
          setMonth(created.first_due_date.slice(0, 7));
          refresh();
          toast(t('Регулярный платёж добавлен'));
        }}
        actions={<>
          <Button type="button" $variant="secondary" onClick={onClose}>{t('Отмена')}</Button>
          <Button type="submit">{t('Добавить платёж')}</Button>
        </>}
      >
        <Field>{t('Название платежа')}<Input name="title" maxLength={120} required placeholder={t('Например, аренда офиса')} autoFocus /></Field>
        <FormRow>
          <Field>{t('Сумма')}<Input name="amount" type="number" step="0.01" min="0.01" max="9999999999.99" required placeholder="0,00" inputMode="decimal" /></Field>
          <Field>{t('Валюта')}<Select name="currency" defaultValue="RUB">{currencies.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </FormRow>
        <FormRow>
          <Field>
            {t('Первая дата оплаты')}
            <Input name="first_due_date" type="date" min="2000-01-01" max="2100-12-31" defaultValue={settings.today} required />
          </Field>
          <Field>
            {t('Повтор')}
            <Select name="frequency" defaultValue="monthly">{frequencies.map((f) => <option key={f} value={f}>{frequencyName(f)}</option>)}</Select>
          </Field>
        </FormRow>
        <CategoryField categories={categories} />
        {users.length > 0 && <AssigneeField users={users} />}
        <PaymentLinkFields />
        <InfoBox>
          {t('Каждый период — своя отметка оплаты. Если в месяце нет нужного числа, срок — последний день месяца. Если до срока меньше 3 дней, напоминание уйдёт сразу.')}
          <br /><Muted>{t('Часовой пояс: {tz}', { tz: settings.timezone })}</Muted>
        </InfoBox>
      </ModalForm>
    </Modal>
  );
}

export function EditPaymentModal({ payment, onClose }: Close & { payment: Recurring }) {
  const { refresh } = useSession();
  const toast = useToast();
  const { users, categories } = usePaymentChoices();
  return (
    <Modal title={t('Изменить платёж')} onClose={onClose}>
      <ModalForm
        onSubmit={async (data) => {
          const assignee = optional(data.get('assignee_id'));
          await api(`/recurring-payments/${payment.id}`, {
            method: 'PATCH',
            body: {
              title: data.get('title'), amount: data.get('amount'), category: optional(data.get('category')), assignee_id: assignee ? Number(assignee) : null,
              payment_url: optional(data.get('payment_url')), payment_details: optional(data.get('payment_details')),
            },
          });
          onClose();
          refresh();
          toast(t('Платёж изменён'));
        }}
        actions={<>
          <Button type="button" $variant="secondary" onClick={onClose}>{t('Отмена')}</Button>
          <Button type="submit">{t('Сохранить')}</Button>
        </>}
      >
        <Field>{t('Название платежа')}<Input name="title" defaultValue={payment.title} maxLength={120} required autoFocus /></Field>
        <Field>
          {t('Сумма, {currency}', { currency: payment.currency })}
          <Input name="amount" type="number" step="0.01" min="0.01" defaultValue={payment.amount} required />
          <small>{t('Новая сумма применится к неоплаченным периодам с сегодняшнего дня; оплаченные останутся как были.')}</small>
        </Field>
        <CategoryField value={payment.category} categories={categories} />
        <AssigneeField value={payment.assignee?.id} users={users} />
        <PaymentLinkFields payment={payment} />
      </ModalForm>
    </Modal>
  );
}

export function PauseModal({ payment, onClose }: Close & { payment: Recurring }) {
  const { settings, refresh } = useSession();
  const toast = useToast();
  return (
    <Modal title={t('Пауза платежа')} onClose={onClose}>
      <ModalForm
        onSubmit={async (data) => {
          const until = optional(data.get('until'));
          await api(`/recurring-payments/${payment.id}/pause`, { method: 'POST', body: until ? { until } : {} });
          onClose();
          refresh();
          toast(until ? t('На паузе до {date}', { date: longDate(until) }) : t('На паузе до возобновления'));
        }}
        actions={<>
          <Button type="button" $variant="secondary" onClick={onClose}>{t('Отмена')}</Button>
          <Button type="submit">{t('Поставить на паузу')}</Button>
        </>}
      >
        <InfoBox>
          <b>{payment.title}</b><br />
          {t('С сегодняшнего дня новых периодов и напоминаний не будет. Пропущенные месяцы потом не станут просрочкой, история оплат сохранится.')}
        </InfoBox>
        <Field>
          {t('До какого дня (включительно)')}
          <Input name="until" type="date" min={settings.today} max="2100-12-31" />
          <small>{t('Оставьте пустым, чтобы пауза длилась до возобновления')}</small>
        </Field>
      </ModalForm>
    </Modal>
  );
}

export function PayModal({ occurrence: o, onClose }: Close & { occurrence: Occurrence }) {
  const { settings, refresh } = useSession();
  const toast = useToast();
  const paid = o.paid_at !== null;
  return (
    <Modal title={paid ? t('Изменить оплату') : t('Отметить оплату')} onClose={onClose}>
      <ModalForm
        onSubmit={async (data, submitter) => {
          const undo = submitter?.value === 'undo';
          await api(`/payment-occurrences/${o.id}`, { method: 'PATCH', body: undo ? { paid: false } : { paid: true, paid_at: data.get('paid_at') } });
          onClose();
          refresh();
          toast(undo ? t('Оплата отменена. Дата очищена.') : t('Оплата сохранена'));
        }}
        actions={<>
          {paid
            ? <Button type="submit" name="action" value="undo" formNoValidate $variant="secondary">{t('Отменить оплату')}</Button>
            : <Button type="button" $variant="secondary" onClick={onClose}>{t('Назад')}</Button>}
          <Button type="submit" name="action" value="save">{paid ? t('Сохранить дату') : t('Подтвердить оплату')}</Button>
        </>}
      >
        <InfoBox>
          <b>{o.title}</b><br />
          {moneyWith(o.amount, o.currency)} · {t('срок {date}', { date: longDate(o.due_date) })}<br />
          {o.payment_details && <>{t('Реквизиты: {details}', { details: o.payment_details })}<br /></>}
          {o.payment_url && <><a href={o.payment_url} target="_blank" rel="noopener noreferrer">{t('Открыть ссылку на оплату ↗')}</a><br /></>}
          {t('Изменение затронет только этот период.')}
        </InfoBox>
        <Field>
          {t('Фактическая дата оплаты')}
          <Input name="paid_at" type="date" defaultValue={o.paid_at ?? settings.today} max={settings.today} required />
          <small>{t('Оплата в день срока — вовремя. Исправление даты пересчитает просрочку, срок не изменится.')}</small>
        </Field>
      </ModalForm>
    </Modal>
  );
}

export function ArchiveModal({ payment, onClose }: Close & { payment: Recurring }) {
  const { refresh } = useSession();
  const toast = useToast();
  return (
    <Modal title={t('Прекратить повторение?')} onClose={onClose}>
      <ModalForm
        onSubmit={async () => {
          await api(`/recurring-payments/${payment.id}`, { method: 'DELETE' });
          onClose();
          refresh();
          toast(t('Платёж перенесён в архив. История сохранена.'));
        }}
        actions={<>
          <Button type="button" $variant="secondary" onClick={onClose}>{t('Оставить')}</Button>
          <Button type="submit" $variant="danger">{t('Прекратить платёж')}</Button>
        </>}
      >
        <InfoBox>
          <b>{payment.title}</b><br />
          {t('Новые периоды и напоминания создаваться не будут. Уже созданные периоды, даты и история оплат сохранятся в архиве.')}
        </InfoBox>
      </ModalForm>
    </Modal>
  );
}

function size(bytes: number | null) {
  if (!bytes) return '';
  return bytes > 1 << 20 ? `${(bytes / (1 << 20)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/** Receipts of one period: links and files (PDF, PNG, JPEG, WebP up to 5 MB). */
export function ReceiptsModal({ occurrence: o, onClose }: Close & { occurrence: Occurrence }) {
  const { user, isAdmin, refresh } = useSession();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: receipts } = useLoad(() => api<Receipt[]>(`/payment-occurrences/${o.id}/receipts`), [version]);
  const reload = () => { setVersion((v) => v + 1); refresh(); };

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      reload();
      toast(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('Чеки и ссылки')} onClose={onClose}>
      <InfoBox><b>{o.title}</b><br />{moneyWith(o.amount, o.currency)} · {t('срок {date}', { date: longDate(o.due_date) })}</InfoBox>
      <List>
        {!receipts ? <Muted>{t('Загружаем…')}</Muted> : receipts.length === 0 ? <Muted>{t('Пока ничего не прикреплено')}</Muted> : receipts.map((r) => (
          <Item key={r.id}>
            <span>
              {r.kind === 'link'
                ? <a href={r.url ?? '#'} target="_blank" rel="noopener noreferrer">{r.url}</a>
                : <a href={r.download_url ?? '#'}>{r.file_name}</a>}
              <small>{r.kind === 'file' ? `${size(r.size)} · ` : ''}@{r.created_by} · {date(r.created_at)}</small>
            </span>
            {(isAdmin || r.created_by === user.username) && (
              <Button type="button" $small $variant="ghost" disabled={busy}
                onClick={() => run(() => api(`/receipts/${r.id}`, { method: 'DELETE' }), t('Чек удалён'))}>{t('удалить')}</Button>
            )}
          </Item>
        ))}
      </List>
      <AddForm onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const url = String(new FormData(form).get('url') ?? '').trim();
        if (url) run(() => api(`/payment-occurrences/${o.id}/receipts`, { method: 'POST', body: { url } }).then(() => form.reset()), t('Ссылка прикреплена'));
      }}>
        <Input name="url" type="url" placeholder={t('Ссылка на чек или счёт')} maxLength={500} />
        <Button type="submit" $variant="secondary" disabled={busy}>{t('Добавить')}</Button>
      </AddForm>
      <Row $between $wrap>
        <Muted>{t('Файл: PDF, PNG, JPEG или WebP до 5 МБ')}</Muted>
        <Button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>{t('Загрузить файл')}</Button>
        <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const body = new FormData();
          body.append('file', file);
          run(() => api(`/payment-occurrences/${o.id}/receipts`, { method: 'POST', body }), t('Файл прикреплён'));
        }} />
      </Row>
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
    </Modal>
  );
}

/** CSV import: preview every row first; importing is possible only without errors. */
export function ImportModal({ onClose }: Close) {
  const { refresh } = useSession();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(dryRun: boolean, chosen = file) {
    if (!chosen) return;
    const body = new FormData();
    body.append('file', chosen);
    setBusy(true);
    setError(null);
    try {
      const result = await api<ImportResult>(`/recurring-payments/import?dry_run=${dryRun}`, { method: 'POST', body });
      if (dryRun) {
        setPreview(result);
      } else {
        onClose();
        refresh();
        toast(t('Импортировано платежей: {n}', { n: result.created }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('Импорт из CSV')} wide onClose={onClose}>
      <InfoBox>
        {t('Столбцы: название, сумма, валюта, первая оплата, периодичность, категория. Разделитель «;», «,» или табуляция; UTF-8 или Windows-1251; даты ДД.ММ.ГГГГ.')}
        {' '}<a href="/api/v1/recurring-payments/import/template">{t('Скачать шаблон ↓')}</a>
      </InfoBox>
      <Row $gap={1} $wrap>
        <Input type="file" accept=".csv,text/csv" onChange={(e) => {
          const chosen = e.target.files?.[0] ?? null;
          setFile(chosen);
          setPreview(null);
          if (chosen) send(true, chosen);
        }} />
      </Row>
      {preview && (
        preview.rows.length === 0 ? <Empty>{t('В файле нет строк с данными')}</Empty> : (
          <Preview>
            <TableWrap>
              <table>
                <thead><tr><th>#</th><th>{t('Название')}</th><th>{t('Сумма')}</th><th>{t('Первая оплата')}</th><th>{t('Повтор')}</th><th>{t('Проверка')}</th></tr></thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line}>
                      <td><Muted>{r.line}</Muted></td>
                      <td>{r.title}{r.category && <Muted> · {r.category}</Muted>}</td>
                      <td>{r.amount} {r.currency}</td>
                      <td>{r.first_due_date}</td>
                      <td>{r.frequency && frequencyName(r.frequency as Frequency)}</td>
                      <td>
                        {r.errors.length > 0 ? <Check $status="overdue">{r.errors.join('; ')}</Check>
                          : r.warnings.length > 0 ? <Check $status="unpaid">{r.warnings.join('; ')}</Check>
                          : <Check $status="paid">{t('ок')}</Check>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Preview>
        )
      )}
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      <Row $between $wrap>
        <Button type="button" $variant="secondary" onClick={onClose}>{t('Отмена')}</Button>
        <Button type="button" disabled={busy || !preview || preview.errors > 0 || preview.rows.length === 0} onClick={() => send(false)}>
          {preview && preview.errors > 0 ? t('Исправьте ошибки: {n}', { n: preview.errors }) : t('Импортировать')}
        </Button>
      </Row>
    </Modal>
  );
}

const List = styled.div`
  display: grid;
  gap: 0.6rem;
  margin: 1.6rem 0;
`;

const Item = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.2rem;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.tile};
  a { color: ${({ theme }) => theme.color.accent}; word-break: break-all; }
  small { display: block; color: ${({ theme }) => theme.color.muted}; }
`;

const AddForm = styled.form`
  display: flex;
  gap: 0.8rem;
  margin-bottom: 1.2rem;
`;

// Row check results can be long: let them wrap instead of widening the table.
const Check = styled(Pill)`
  white-space: normal;
  align-items: flex-start;
  &::before { margin-top: 0.5rem; }
`;

const Preview = styled.div`
  max-height: 36rem;
  overflow: auto;
  margin: 1.2rem 0;
  table { min-width: 72rem; }
`;
