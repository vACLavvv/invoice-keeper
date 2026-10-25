import { DeletePaymentModal } from '@/components/DeletePaymentModal';
import { useEffect, useRef, useState } from 'react';
import styled, { css } from 'styled-components';
import { api, type Forecast, type ImportResult, type Occurrence, type Receipt, type Recurring, type TeamUser } from '@/lib/api';
import { currencies, date, frequencies, frequencyName, longDate, moneyWith, type Frequency } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { FormRow, InfoBox, Modal, ModalForm } from './Modal';
import { SanctionsWarning, WalletFields, walletBody, shortAddress } from './Wallet';
import { Button, Empty, Field, Input, Muted, Notice, Pill, Row, Select, TableWrap, Textarea } from './ui';

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
      <small>{t('Личные напоминания отправляются ответственному в подключённый Telegram и на подтверждённую почту.')}</small>
    </Field>
  );
}

/** Optional link to the bill or service cabinet belongs with the other extra fields. */
function PaymentLinkField({ payment }: { payment?: Recurring }) {
  return (
    <Field>
      {t('Ссылка на оплату')} <Muted>{t('необязательно')}</Muted>
      <Input name="payment_url" type="url" defaultValue={payment?.payment_url ?? ''} maxLength={500} placeholder="https://" />
      <small>{t('Кабинет или счёт: в напоминаниях появится кнопка «💳 Оплатить»')}</small>
    </Field>
  );
}

type Method = 'fiat' | 'crypto';

/** Two big options side by side: «Как часто» (once / regular) and «Как платим» (bank / crypto). */
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string, string][]; onChange: (v: T) => void }) {
  return (
    <Field as="div">
      {label}
      <Segmented role="radiogroup" aria-label={label} onKeyDown={(e) => {
        const current = options.findIndex(([option]) => option === value);
        const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (current + 1) % options.length
          : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (current + options.length - 1) % options.length
          : e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : -1;
        if (next < 0) return;
        e.preventDefault();
        onChange(options[next][0]);
        e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
      }}>
        {options.map(([option, title, hint]) => (
          <Segment key={option} type="button" role="radio" aria-checked={value === option} tabIndex={value === option ? 0 : -1} $selected={value === option} onClick={() => onChange(option)}>
            <b>{title}</b>
            <small>{hint}</small>
          </Segment>
        ))}
      </Segmented>
    </Field>
  );
}

/** «Как платим»: a bank transfer or card (link and requisites) or a crypto wallet — never both. */
function MethodToggle({ method, onChange }: { method: Method; onChange: (m: Method) => void }) {
  return (
    <Choice label={t('Как платим')} value={method} onChange={onChange} options={[
      ['fiat', t('Банк или карта'), t('Ссылка на счёт и реквизиты')],
      ['crypto', t('₿ Криптовалюта'), t('Кошелёк получателя, проверка по санкциям OFAC')],
    ]} />
  );
}

type Kind = 'regular' | 'once';

function DescriptionField({ value }: { value?: string | null }) {
  return (
    <Field>
      {t('За что платим')} <Muted>{t('необязательно')}</Muted>
      <Textarea name="description" defaultValue={value ?? ''} maxLength={500} rows={2} placeholder={t('Например: за принятую разработку новой функции')} />
    </Field>
  );
}

/** The fields of the chosen method; the other method's values are cleared on save. */
function MethodFields({ method, payment }: { method: Method; payment?: Recurring }) {
  if (method === 'fiat') return (
    <Field>
      {t('Реквизиты')} <Muted>{t('необязательно')}</Muted>
      <Input name="payment_details" defaultValue={payment?.payment_details ?? ''} maxLength={500} placeholder={t('Например, ИНН, номер договора или счёта')} />
    </Field>
  );
  return (
    <>
      <WalletFields wallet={payment?.wallet} required />
      <SanctionsWarning wallet={payment?.wallet ?? null} />
    </>
  );
}

/** Request fields for the chosen method: the other one is sent as null, so a payment never has both. */
function methodBody(method: Method, data: FormData) {
  if (method === 'crypto') return { payment_url: null, payment_details: null, ...walletBody(data) };
  return { payment_url: optional(data.get('payment_url')), payment_details: optional(data.get('payment_details')), wallet_network: null, wallet_address: null };
}

const optional = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

export function CreatePaymentModal({ onClose, kind: initialKind = 'regular' }: Close & { kind?: Kind }) {
  const { settings, setMonth, refresh } = useSession();
  const toast = useToast();
  const { users, categories } = usePaymentChoices();
  const [method, setMethod] = useState<Method>('fiat');
  const [kind, setKind] = useState<Kind>(initialKind);
  return (
    <Modal title={t('Новый платёж')} onClose={onClose}>
      <ModalForm
        onSubmit={async (data) => {
          const assignee = optional(data.get('assignee_id'));
          const created = await api<Recurring>('/recurring-payments', {
            method: 'POST',
            body: {
              title: data.get('title'), amount: data.get('amount'), currency: data.get('currency'), first_due_date: data.get('first_due_date'),
              frequency: kind === 'once' ? 'once' : data.get('frequency'), description: optional(data.get('description')),
              category: optional(data.get('category')), assignee_id: assignee ? Number(assignee) : null,
              ...methodBody(method, data),
            },
          });
          onClose();
          setMonth(created.first_due_date.slice(0, 7));
          refresh();
          if (created.wallet?.sanctioned) toast(t('Платёж добавлен, но кошелёк получателя в санкционном списке OFAC'), true);
          else toast(kind === 'once' ? t('Разовый платёж добавлен') : t('Регулярный платёж добавлен'));
        }}
        actions={<>
          <Button type="button" $variant="secondary" onClick={onClose}>{t('Отмена')}</Button>
          <Button type="submit">{t('Добавить платёж')}</Button>
        </>}
      >
        <Choice label={t('Как часто')} value={kind} onChange={setKind} options={[
          ['once', t('Один раз'), t('За работу, услугу или покупку')],
          ['regular', t('Регулярно'), t('Аренда, подписки, серверы')],
        ]} />
        <Field>
          {t('Название платежа')}
          <Input name="title" maxLength={120} required autoFocus
            placeholder={kind === 'once' ? t('Например, макеты страницы продукта') : t('Например, аренда офиса')} />
        </Field>
        {kind === 'once' && <DescriptionField />}
        <MethodToggle method={method} onChange={setMethod} />
        <FormRow>
          <Field>{t('Сумма')}<Input name="amount" type="number" step="0.01" min="0.01" max="9999999999.99" required placeholder="0,00" inputMode="decimal" /></Field>
          <Field>
            {method === 'crypto' ? t('Учитывать в') : t('Валюта')}
            <Select name="currency" key={method} defaultValue={method === 'crypto' ? 'USD' : 'RUB'}>{currencies.map((c) => <option key={c}>{c}</option>)}</Select>
          </Field>
        </FormRow>
        {method === 'crypto' && <Muted>{t('Итоги и бюджет считаются в RUB, USD или EUR: стейблкоины USDT и USDC обычно учитывают как USD.')}</Muted>}
        {kind === 'once' ? (
          <Field>
            {t('Срок оплаты')}
            <Input name="first_due_date" type="date" min="2000-01-01" max="2100-12-31" defaultValue={settings.today} required />
          </Field>
        ) : (
          <ScheduleRow>
            <Field>
              {t('Первая дата оплаты')}
              <Input name="first_due_date" type="date" min="2000-01-01" max="2100-12-31" defaultValue={settings.today} required />
            </Field>
            <Field>
              {t('Повтор')}
              <Select name="frequency" defaultValue="monthly">{frequencies.map((f) => <option key={f} value={f}>{frequencyName(f)}</option>)}</Select>
            </Field>
          </ScheduleRow>
        )}
        <MethodFields method={method} />
        <Group>{t('дополнительно')}</Group>
        {method === 'fiat' && <PaymentLinkField />}
        <CategoryField categories={categories} />
        {users.length > 0 && <AssigneeField users={users} />}
        <InfoBox>
          {kind === 'once'
            ? t('Разовый платёж — одна запись с одним сроком, в следующем месяце он не повторится. Напоминание придёт за 3 дня, оплата, чеки и журнал — как у обычного периода.')
            : t('Каждый период — своя отметка оплаты. Если в месяце нет нужного числа, срок — последний день месяца. Если до срока меньше 3 дней, напоминание уйдёт сразу.')}
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
  const [method, setMethod] = useState<Method>(payment.wallet ? 'crypto' : 'fiat');
  return (
    <Modal title={t('Изменить платёж')} onClose={onClose}>
      <ModalForm
        onSubmit={async (data) => {
          const assignee = optional(data.get('assignee_id'));
          const saved = await api<Recurring>(`/recurring-payments/${payment.id}`, {
            method: 'PATCH',
            body: {
              title: data.get('title'), amount: data.get('amount'), category: optional(data.get('category')), assignee_id: assignee ? Number(assignee) : null,
              description: optional(data.get('description')), ...methodBody(method, data),
            },
          });
          onClose();
          refresh();
          if (saved.wallet?.sanctioned) toast(t('Сохранено, но кошелёк получателя в санкционном списке OFAC'), true);
          else toast(t('Платёж изменён'));
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
          <small>{payment.frequency === 'once' ? t('Если срок ещё не наступил, новая сумма применится к платежу.') : t('Новая сумма применится к неоплаченным периодам с сегодняшнего дня; оплаченные останутся как были.')}</small>
        </Field>
        <DescriptionField value={payment.description} />
        <MethodToggle method={method} onChange={setMethod} />
        <MethodFields method={method} payment={payment} />
        {method === 'fiat' && payment.wallet && <Muted>{t('При сохранении кошелёк будет удалён.')}</Muted>}
        {method === 'crypto' && (payment.payment_url || payment.payment_details) && <Muted>{t('При сохранении ссылка на оплату и реквизиты будут удалены.')}</Muted>}
        <Group>{t('дополнительно')}</Group>
        {method === 'fiat' && <PaymentLinkField payment={payment} />}
        <CategoryField value={payment.category} categories={categories} />
        <AssigneeField value={payment.assignee?.id} users={users} />
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

/** Marks a period paid; a forecast date (no period yet) is created and paid ahead in one step. */
export function PayModal({ occurrence: o, onClose }: Close & { occurrence: Occurrence | Forecast }) {
  const { settings, refresh, isAdmin } = useSession();
  const [deleting, setDeleting] = useState(false);
  const [receiptsBlocked, setReceiptsBlocked] = useState(false);
  const toast = useToast();
  const ahead = !('id' in o);
  const paid = !ahead && o.paid_at !== null;
  if (deleting) return <DeletePaymentModal payment={o} onClose={onClose} />;
  return (
    <Modal title={ahead ? t('Оплатить заранее') : paid ? t('Изменить оплату') : t('Отметить оплату')} onClose={onClose}>
      <ModalForm
        onSubmit={async (data, submitter) => {
          if (receiptsBlocked) throw new Error(t('Прикрепите выбранный чек или уберите его перед сохранением оплаты.'));
          const undo = submitter?.value === 'undo';
          if (ahead) {
            await api(`/recurring-payments/${o.recurring_payment_id}/periods`, { method: 'POST', body: { due_date: o.due_date, paid_at: data.get('paid_at') } });
          } else {
            await api(`/payment-occurrences/${o.id}`, { method: 'PATCH', body: undo ? { paid: false } : { paid: true, paid_at: data.get('paid_at') } });
          }
          onClose();
          refresh();
          toast(undo ? t('Оплата отменена. Дата очищена.') : ahead ? t('Оплачено заранее') : t('Оплата сохранена'));
        }}
        actions={<>
          {paid
            ? <Button type="submit" name="action" value="undo" formNoValidate $variant="secondary" disabled={receiptsBlocked}>{t('Отменить оплату')}</Button>
            : <Button type="button" $variant="secondary" onClick={onClose}>{t('Назад')}</Button>}
          <Button type="submit" name="action" value="save" disabled={receiptsBlocked}>{paid ? t('Сохранить дату') : t('Подтвердить оплату')}</Button>
        </>}
      >
        <InfoBox>
          <b>{o.title}</b><br />
          {moneyWith(o.amount, o.currency)} · {t('срок {date}', { date: longDate(o.due_date) })}<br />
          {o.description && <>{o.description}<br /></>}
          {o.payment_details && <>{t('Реквизиты: {details}', { details: o.payment_details })}<br /></>}
          {o.wallet && <>{t('Кошелёк ({network}): {address}', { network: o.wallet.network, address: shortAddress(o.wallet.address) })}<br /></>}
          {o.payment_url && !o.wallet?.sanctioned && <><a href={o.payment_url} target="_blank" rel="noopener noreferrer">{t('Открыть ссылку на оплату ↗')}</a><br /></>}
          {ahead ? t('Период появится в календаре уже оплаченным, напоминания по нему не будет.') : t('Изменение затронет только этот период.')}
        </InfoBox>
        <SanctionsWarning wallet={o.wallet} />
        {isAdmin && <Button type="button" $variant="ghost" onClick={() => setDeleting(true)}>{t('Удалить платёж…')}</Button>}
        <Field>
          {t('Фактическая дата оплаты')}
          <Input name="paid_at" type="date" defaultValue={(!ahead && o.paid_at) || settings.today} max={settings.today} required />
          <small>{t('Оплата в день срока — вовремя. Исправление даты пересчитает просрочку, срок не изменится.')}</small>
        </Field>
        {ahead
          ? <ReceiptHint>{t('Чек можно прикрепить после сохранения оплаты: откройте этот платёж в истории.')}</ReceiptHint>
          : <ReceiptSection>
              <h3>{t('Чеки и ссылки')}</h3>
              <ReceiptHint>{t('Необязательно. Чеки сохраняются сразу и остаются у этого периода, даже если закрыть окно.')}</ReceiptHint>
              <ReceiptsPanel occurrence={o} onBlockedChange={setReceiptsBlocked} />
            </ReceiptSection>}
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

/** Receipts of one period. This panel has no form so it can also live inside PayModal. */
function ReceiptsPanel({ occurrence: o, onBlockedChange }: { occurrence: Occurrence; onBlockedChange?: (blocked: boolean) => void }) {
  const { user, isAdmin, refresh } = useSession();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const { data: receipts, error: loadError } = useLoad(() => api<Receipt[]>(`/payment-occurrences/${o.id}/receipts`), [version]);
  const blocked = busy || url.trim() !== '' || pendingFile !== null;
  useEffect(() => { onBlockedChange?.(blocked); }, [blocked, onBlockedChange]);
  const reload = () => { setVersion((v) => v + 1); refresh(); };

  async function run(action: () => Promise<unknown>, done: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      reload();
      toast(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function addLink() {
    const link = url.trim();
    if (!link || !urlRef.current?.reportValidity()) return;
    run(async () => {
      await api(`/payment-occurrences/${o.id}/receipts`, { method: 'POST', body: { url: link } });
      setUrl('');
    }, t('Ссылка прикреплена'));
  }

  function addFile(file: File) {
    setPendingFile(file);
    if (file.size > 5 * 1024 * 1024) {
      setError(t('Файл слишком большой. Выберите файл до 5 МБ.'));
      return;
    }
    const body = new FormData();
    body.append('file', file);
    run(async () => {
      await api(`/payment-occurrences/${o.id}/receipts`, { method: 'POST', body });
      setPendingFile(null);
    }, t('Файл прикреплён'));
  }

  return (
    <>
      {loadError && <Notice $tone="error" role="alert">
        {loadError}
        <Button type="button" $variant="secondary" $small disabled={busy} onClick={() => setVersion((v) => v + 1)}>{t('Повторить')}</Button>
      </Notice>}
      <List aria-live="polite">
        {!receipts ? (!loadError && <ReceiptHint>{t('Загружаем…')}</ReceiptHint>) : receipts.length === 0 ? <ReceiptHint>{t('Пока ничего не прикреплено')}</ReceiptHint> : receipts.map((r) => (
          <Item key={r.id}>
            <span>
              {r.kind === 'link'
                ? <a href={r.url ?? '#'} target="_blank" rel="noopener noreferrer">{r.url}</a>
                : <a href={r.download_url ?? '#'}>{r.file_name}</a>}
              <small>{r.kind === 'file' ? `${size(r.size)} · ` : ''}@{r.created_by} · {date(r.created_at)}</small>
            </span>
            {(isAdmin || r.created_by === user.username) && (
              <Button type="button" $small $variant="ghost" disabled={busy}
                onClick={() => run(() => api(`/receipts/${r.id}`, { method: 'DELETE' }), t('Чек удалён'))}>{t('Удалить')}</Button>
            )}
          </Item>
        ))}
      </List>
      <AddRow>
        <Field>
          {t('Ссылка на чек или счёт')}
          <Input ref={urlRef} type="url" placeholder="https://" maxLength={500} value={url} disabled={busy}
            onChange={(e) => { setUrl(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} />
        </Field>
        <Button type="button" $variant="secondary" disabled={busy || !url.trim()} onClick={addLink}>{t('Прикрепить')}</Button>
      </AddRow>
      <UploadRow>
        <ReceiptHint>{t('Файл: PDF, PNG, JPEG или WebP до 5 МБ')}</ReceiptHint>
        <Button type="button" $variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>{t('Загрузить файл')}</Button>
        <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) addFile(file);
        }} />
      </UploadRow>
      {pendingFile && <PendingReceipt role="status">
        <span>{busy ? t('Загружаем…') : t('Файл не прикреплён')}: <b>{pendingFile.name}</b></span>
        {!busy && <Row $wrap>
          <Button type="button" $small $variant="secondary" onClick={() => addFile(pendingFile)}>{t('Повторить')}</Button>
          <Button type="button" $small $variant="ghost" onClick={() => { setPendingFile(null); setError(null); }}>{t('Убрать')}</Button>
        </Row>}
      </PendingReceipt>}
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      {onBlockedChange && blocked && !busy && <ReceiptHint>{t('Прикрепите выбранный чек или уберите его перед сохранением оплаты.')}</ReceiptHint>}
    </>
  );
}

/** A quick receipt entry remains available for already paid and archived records. */
export function ReceiptsModal({ occurrence: o, onClose }: Close & { occurrence: Occurrence }) {
  return (
    <Modal title={t('Чеки и ссылки')} onClose={onClose}>
      <InfoBox><b>{o.title}</b><br />{moneyWith(o.amount, o.currency)} · {t('срок {date}', { date: longDate(o.due_date) })}</InfoBox>
      <ReceiptSection>
        <ReceiptsPanel occurrence={o} />
      </ReceiptSection>
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
        {t('Столбцы: название, сумма, валюта, первая оплата, периодичность (в том числе «разово»), категория. Разделитель «;», «,» или табуляция; UTF-8 или Windows-1251; даты ДД.ММ.ГГГГ.')}
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

const Segmented = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.8rem;
  ${({ theme }) => theme.mobile} { grid-template-columns: 1fr; }
`;

const Segment = styled.button<{ $selected: boolean }>`
  display: grid;
  gap: 0.2rem;
  padding: 1.2rem 1.4rem;
  text-align: left;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.color.line};
  background: ${({ theme }) => theme.color.tile};
  color: ${({ theme }) => theme.color.muted};
  b { color: var(--ink); font-size: 16px; font-weight: 550; }
  small { color: var(--desk-muted); font-size: 14px; line-height: 1.5; }
  &:hover { border-color: ${({ theme }) => theme.color.faint}; }
  ${({ $selected, theme }) => $selected && css`
    border-color: ${theme.color.accent};
    background: ${theme.color.accentSoft};
    b { color: ${theme.color.strong}; }
  `}
`;

const ScheduleRow = styled(FormRow)`
  &.form-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  @media (max-width: 480px) { &.form-row { grid-template-columns: minmax(0, 1fr); } }
`;

const Group = styled.div`
  margin-top: 4px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
  color: var(--ink);
  font-size: 16px;
  font-weight: 600;
  &::first-letter { text-transform: uppercase; }
`;

const ReceiptSection = styled.section`
  display: grid;
  gap: 12px;
  min-width: 0;
  margin-top: 8px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
  h3 { margin: 0; font-size: 17px; font-weight: 600; color: var(--ink); }
`;

const ReceiptHint = styled.p`
  margin: 0;
  color: var(--desk-muted);
  font-size: 14px;
  line-height: 1.55;
`;

const PendingReceipt = styled.div`
  display: grid;
  gap: 10px;
  font-size: 14px;
  overflow-wrap: anywhere;
`;

const List = styled.div`
  display: grid;
  gap: 0.6rem;
  margin: 0;
`;

const Item = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.2rem;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.tile};
  min-width: 0;
  > span { min-width: 0; }
  a { color: var(--apple-blue); overflow-wrap: anywhere; font-size: 15px; }
  small { display: block; margin-top: 4px; color: var(--desk-muted); font-size: 13px; }
  button { flex: 0 0 auto; }
`;

const AddRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  @media (max-width: 480px) { grid-template-columns: minmax(0, 1fr); }
`;

const UploadRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  button { flex-shrink: 0; }
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
